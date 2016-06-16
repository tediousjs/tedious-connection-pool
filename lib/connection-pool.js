'use strict';
const Connection = require('tedious').Connection;
const EventEmitter = require('events').EventEmitter;
const util = require('util');

function ConnectionPool(poolConfig, connectionConfig) {
    this.pending = new Set();
    this.free = new Set();
    this.used = new Set();
    
    this.waiting = []; //acquire() callbacks that are waiting for a connection to come available
    this.connectionConfig = connectionConfig;

    this.max = poolConfig.max >= 1 ? poolConfig.max : 50;

    this.min = Math.min(this.max, poolConfig.min >= 0 ? poolConfig.min : 10);

    this.idleTimeout = !poolConfig.idleTimeout && poolConfig.idleTimeout !== false
        ? 300000 //5 min
        : poolConfig.idleTimeout;

    this.retryDelay = !poolConfig.retryDelay && poolConfig.retryDelay !== false
        ? 5000
        : poolConfig.retryDelay;

    this.acquireTimeout = !poolConfig.acquireTimeout && poolConfig.acquireTimeout !== false
        ? 60000 //1 min
        : poolConfig.acquireTimeout;

    if (poolConfig.log) {
        if (Object.prototype.toString.call(poolConfig.log) === '[object Function]') {
            this.log = poolConfig.log;
        } else {
            this.log = function(text) {
                console.log('Tedious-Connection-Pool: ' + text);
            };
        }
    } else {
        this.log = function() {};
    }

    this.drained = false;
    
    this._nextId = 0;
    this._retryTimeout = null;
    
    setImmediate(fill.bind(this));
}

util.inherits(ConnectionPool, EventEmitter);
    
function createConnection(pooled) {
    this.log(pooled.id + ': creating connection');
    
    const connection = new Connection(this.connectionConfig);
    pooled.con = connection;
    connection.release = release.bind(this, pooled);
    
    const removeFromPool = () => {
        if (pooled.timeout)
            clearTimeout(pooled.timeout);
        
        //further indicate that this pooled object is dead to us, so it's easy to ignore
        // for example, if the user tries to release a connection that not a part of the pool
        delete pooled.con;
        
        const inPool = this.pending.delete(pooled) || this.free.delete(pooled) || this.used.delete(pooled);
        if (!inPool)
            return;
    
        if (this.drained) {//pool has been drained
            if (this.pending.size === 0 && this.free.size === 0 && this.used.size === 0)
                this.drained(); //once empty execute drained callback
            return;
        }
        
        if (!this.drained) {
            if (!this._retryTimeout) {
                this._retryTimeout = setTimeout(() => {
                    this._retryTimeout = null;
                    fill.call(this);
                }, this.retryDelay);
            }
        }
    };
    
    const handleError = (err) => {
        this.log(pooled.id + ': closing because of error');
        this.emit('error', err);
    
        removeFromPool();
    };
    
    connection.on('connect', (err) => {
        this.log(pooled.id + ': connected');
        
        if (this.drained) { //pool has been drained
            this.log(pooled.id + ': closing because pool has been drained');
            connection.close();
            return;
        }

        if (err) {
            handleError(err);
            return;
        }
        
        setFree.call(this, pooled);
    });

    connection.on('error', handleError);
    
    const endHandler = () => {
        this.log(pooled.id + ': ended');
    
        removeFromPool();
    };
    
    connection.on('end', endHandler);
}

function fill() {
    if (this.drained || this._retryTimeout) //pool has been drained
        return;
    
    const total = this.pending.size + this.free.size + this.used.size;
    
    let amount = Math.min(
        this.max - total, //max that can be created
        this.waiting.length - this.free.size); //how many are needed, minus how many are available
    
    amount = Math.max(
        this.min - total, //amount to create to reach min
        amount);
    
    if (amount > 0)
        this.log('pool: filling pool with ' + amount);
    
    for (let i = 0; i < amount; i++) {
        const pooled = {
            id: ++this._nextId
        };
        
        this.pending.add(pooled);
        
        setImmediate(createConnection.bind(this, pooled)); //avoid blocking if a lot of connections are being created
    }
}

function getOne(set) {
    for (const item in set)
        return item;
    
    return undefined;
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.drained) //pool has been drained
        return;

    const waiter = {
        callback: callback
    };

    if (this.free.size > 0) {
        const pooled = getOne(this.free);
        this.free.remove(pooled);
        setUsed.call(this, pooled, waiter);
        
    } else {
        if (this.acquireTimeout) {
            waiter.timeout = setTimeout(() => {
                for (let i = this.waiting.length - 1; i >= 0; i--) {
                    const waiter2 = this.waiting[i];

                    if (waiter2.timeout === waiter.timeout) {
                        this.waiting.splice(i, 1);
                        waiter.callback(new Error('Acquire Timeout Exceeded'));
                        return;
                    }
                }
            }, this.acquireTimeout);
        }

        this.waiting.push(waiter);
        fill.call(this);
    }
};

ConnectionPool.prototype.release = function (connection) {
    for (const pool in this.used) {
        if (pool.con === connection) {
            connection.release();
            return;
        }
    }
};

function release(pooled) {
    if (this.drained) //pool has been drained
        return;
    
    if (pooled.con) { //make sure connection is in the pool
        
        //reset connection before reusing it
        pooled.con.reset((err) => {
            if (!pooled.con) //the connection error-ed during the reset
                return;
            
            if (err) { //there is an error, don't reuse the connection, just close it
                pooled.con.close();
                return;
            }
            
            this.log(pooled.id + ': released');
            
            setFree.call(this, pooled);
        });
    }
}

function setUsed(pooled, waiter) {
    this.used.add(pooled);
    
    if (pooled.timeout) {
        clearTimeout(pooled.timeout);
        pooled.timeout = undefined;
    }
    if (waiter.timeout) {
        clearTimeout(waiter.timeout);
        waiter.timeout = undefined;
    }
    this.log(pooled.id + ': acquired');
    setImmediate(() => {
        waiter.callback(null, pooled.con);
    });
}

function setFree(pooled) {
    this.pending.delete(pooled);
    this.used.delete(pooled);
    
    //check if there is anything waiting for a connection
    const waiter = this.waiting.shift();
    
    if (waiter !== undefined) {
        setUsed.call(this, pooled, waiter);
        return;
    }
    
    this.free.add(pooled);

    //start idle timeout for pooled connection
    pooled.timeout = setTimeout(() => {
        this.log(pooled.id + ': closing idle connection');
        pooled.con.close();
    }, this.idleTimeout);
}

ConnectionPool.prototype.drain = function (callback) {
    if (this.drained) //pool has been drained
        throw new Error('pool: already drained');
    
    this.log('pool: draining');
    
    this.drained = callback || function() {};

    for (let i = this.waiting.length - 1; i >= 0; i--) {
        const waiter = this.waiting[i];

        if (waiter.timeout)
            clearTimeout(waiter.timeout);
    }

    this.waiting = null;
    
    if (this.pending.size === 0 && this.free.size === 0 && this.used.size === 0) {
        callback();
    } else {
        for (const pooled of this.pending) {
            if (pooled.con)
                pooled.con.close();
        }
    
        for (const pooled of this.free)
            pooled.con.close();
    
        for (const pooled of this.used)
            pooled.con.close();
    }
    
    this.pending = null;
    this.free = null;
    this.used = null;
};

module.exports = ConnectionPool;
