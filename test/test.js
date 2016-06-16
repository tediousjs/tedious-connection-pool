'use strict';
/*eslint-env node, mocha */
const assert = require('assert');
const Request = require('tedious').Request;
const ConnectionPool = require('../lib/connection-pool');
const Connection = require('tedious').Connection;

const connectionConfig = {
    userName: 'test',
    password: 'test',
    server: 'dev1',
    options: {
        appName: 'pool-test',
        database: 'test'
    }
};

/* create a db user with the correct permissions:
CREATE DATABASE test
CREATE LOGIN test WITH PASSWORD=N'test', DEFAULT_DATABASE=test, CHECK_POLICY=OFF
GRANT ALTER ANY CONNECTION TO test

USE test
CREATE USER test FOR LOGIN test WITH DEFAULT_SCHEMA=dbo
ALTER ROLE db_owner ADD MEMBER test

USE msdb
CREATE USER test FOR LOGIN test WITH DEFAULT_SCHEMA=dbo
ALTER ROLE SQLAgentOperatorRole ADD MEMBER test
ALTER ROLE SQLAgentReaderRole ADD MEMBER test
ALTER ROLE SQLAgentUserRole ADD MEMBER test
*/

/* disable the user when not testing:
ALTER LOGIN test DISABLE
*/

describe('Name Collision', function () {

    it('release', function () {
        assert(!Connection.prototype.release);

        const con = new Connection({});
        assert(!con.release);
        con.close();
    });
    
});

describe('ConnectionPool', function () {
    this.timeout(10000);
    
    it('min', function (done) {
        const poolConfig = {min: 2};
        const pool = new ConnectionPool(poolConfig, connectionConfig);
    
        setTimeout(() => {
            assert.equal(pool.pending.size, poolConfig.min);
            assert.equal(pool.free.size, 0);
            assert.equal(pool.used.size, 0);
        }, 4);
    
        setTimeout(() => {
            assert.equal(pool.pending.size, 0);
            assert.equal(pool.free.size, poolConfig.min);
            assert.equal(pool.used.size, 0);
            pool.drain(done);
        }, 2000);
    });

    it('min=0', function (done) {

        const poolConfig = {min: 0, idleTimeout: 10};
        const pool = new ConnectionPool(poolConfig, connectionConfig);

        setTimeout(() => {
            assert.equal(pool.pending.size, 0);
            assert.equal(pool.free.size, 0);
            assert.equal(pool.used.size, 0);
        }, 4);

        setTimeout(() => {
            pool.acquire(function(err, connection) {
                assert(!err);
                
                assert.equal(pool.pending.size, 0);
                assert.equal(pool.free.size, 0);
                assert.equal(pool.used.size, 1);

                const request = new Request('select 42', function (err2, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    connection.release();
                    
                    setTimeout(function () {
                        assert.equal(pool.pending.size, 0);
                        assert.equal(pool.free.size, 0);
                        assert.equal(pool.used.size, 0);
                        pool.drain(done);
                    }, 200);
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });
        }, 2000);
    });

    it('max', function (done) {
        const poolConfig = {min: 2, max: 5};
        const pool = new ConnectionPool(poolConfig, connectionConfig);

        const count = 20;
        let run = 0;

        const createRequest = function (err, connection) {
            assert(!err);

            const request = new Request('select 42', function (err2, rowCount) {
                assert.strictEqual(rowCount, 1);
                run++;
                assert(pool.pending.size + pool.free.size + pool.used.size <= poolConfig.max);
                connection.release();
                if (run === count)
                    pool.drain(done);
            });

            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, 42);
            });

            connection.execSql(request);
        };

        for (let i = 0; i < count; i++) {
            setImmediate(() => {
                pool.acquire(createRequest);
            });
        }
    });

    it('min > max', function (done) {
        const poolConfig = {min: 5, max: 2};
        const pool = new ConnectionPool(poolConfig, connectionConfig);
    
        const count = 20;
        let run = 0;
    
        const createRequest = function (err, connection) {
            assert(!err);
        
            const request = new Request('select 42', function (err2, rowCount) {
                assert.strictEqual(rowCount, 1);
                run++;
                assert(pool.pending.size + pool.free.size + pool.used.size <= poolConfig.max);
                connection.release();
                if (run === count)
                    pool.drain(done);
            });
        
            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, 42);
            });
        
            connection.execSql(request);
        };
    
        for (let i = 0; i < count; i++) {
            setImmediate(() => {
                pool.acquire(createRequest);
            });
        }
    });

    it('min > max, no min specified', function (done) {
        const poolConfig = {max: 2};
        const pool = new ConnectionPool(poolConfig, connectionConfig);
    
        const count = 20;
        let run = 0;
    
        const createRequest = function (err, connection) {
            assert(!err);
        
            const request = new Request('select 42', function (err2, rowCount) {
                assert.strictEqual(rowCount, 1);
                run++;
                assert(pool.pending.size + pool.free.size + pool.used.size <= poolConfig.max);
                connection.release();
                if (run === count)
                    pool.drain(done);
            });
        
            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, 42);
            });
        
            connection.execSql(request);
        };
    
        for (let i = 0; i < count; i++) {
            setImmediate(() => {
                pool.acquire(createRequest);
            });
        }
    });

    it('pool error event', function (done) {
        const poolConfig = {min: 3};
        const pool = new ConnectionPool(poolConfig, {});

        pool.acquire(function() { });

        pool.on('error', function(err) {
            assert(!!err);
            pool.drain(done);
        });
    });

    it('connection retry', function (done) {
        const poolConfig = {min: 2, max: 5, retryDelay: 5};
        const pool = new ConnectionPool(poolConfig, {});

        pool.on('error', function(err) {
            assert(!!err);
            pool.connectionConfig = connectionConfig;
        });

        function testConnected() {
            if (pool.free.size < poolConfig.min) {
                setTimeout(testConnected, 100);
                return;
            }

            pool.drain(done);
        }
        
        testConnected();
    });

    it('acquire timeout', function (done) {
        const poolConfig = {min: 1, max: 1, acquireTimeout: 2000};
        const pool = new ConnectionPool(poolConfig, connectionConfig);

        pool.acquire(function(err, connection) {
            assert(!err);
            assert(!!connection);
        });

        pool.acquire(function(err, connection) {
            assert(!!err);
            assert(!connection);
            done();
        });
    });

    it('idle timeout', function (done) {
        const poolConfig = {min: 0, max: 5, idleTimeout: 100};
        const pool = new ConnectionPool(poolConfig, connectionConfig);
    
        const count = 20;
        let run = 0;
    
        const createRequest = function (err, connection) {
            assert(!err);
        
            const request = new Request('select 42', function (err2, rowCount) {
                assert.strictEqual(rowCount, 1);
                run++;
                connection.release();
                if (run === count) {
                    assert.equal(pool.pending.size + pool.free.size + pool.used.size, poolConfig.max);
                    
                    //check for idleTimeout
                    setTimeout(() => {
                        assert.equal(pool.pending.size + pool.free.size + pool.used.size, 0);
                        done();
                    }, 1000);
                }
            });
        
            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, 42);
            });
        
            connection.execSql(request);
        };
    
        for (let i = 0; i < count; i++) {
            setImmediate(() => {
                pool.acquire(createRequest);
            });
        }
    });

    it('connection error handling', function (done) {
        this.timeout(10000);
        const poolConfig = {min: 1, max: 5};

        const pool = new ConnectionPool(poolConfig, connectionConfig);

        pool.on('error', function(err) {
            assert(err && err.name === 'ConnectionError');
        });

        //This simulates a lost connections by creating a job that kills the current session and then deletesthe job.
        pool.acquire(function (err, connection) {
            assert(!err);

            const command = 'DECLARE @jobName VARCHAR(68) = \'pool\' + CONVERT(VARCHAR(64),NEWID()), @jobId UNIQUEIDENTIFIER;' +
            'EXECUTE msdb..sp_add_job @jobName, @owner_login_name=\'' + connectionConfig.userName + '\', @job_id=@jobId OUTPUT;' +
            'EXECUTE msdb..sp_add_jobserver @job_id=@jobId;' +

            'DECLARE @cmd VARCHAR(50);' +
            'SELECT @cmd = \'kill \' + CONVERT(VARCHAR(10), @@SPID);' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step1\', @command = @cmd, @database_name = \'' + connectionConfig.options.database + '\', @on_success_action = 3;' +

            'DECLARE @deleteCommand VARCHAR(200);' +
            'SET @deleteCommand = \'execute msdb..sp_delete_job @job_name=\'\'\'+@jobName+\'\'\'\';' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step2\', @command = @deletecommand;' +

            'EXECUTE msdb..sp_start_job @job_id=@jobId;' +
            'WAITFOR DELAY \'01:00:00\';' +
            'SELECT 42';

            const request = new Request(command, function (err2, rowCount) {
                assert(err2);
                pool.drain(done);
            });

            request.on('row', function (columns) {
                assert(false);
            });

            connection.execSql(request);
        });
    });

    it('release(), reset()', function (done) {
        this.timeout(10000);

        const poolConfig = {max: 1};
        const pool = new ConnectionPool(poolConfig, connectionConfig);

        const createRequest = function(query, value, callback) {
            const request = new Request(query, function (err, rowCount) {
                assert.strictEqual(rowCount, 1);
                callback();
            });

            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, value);
            });

            return request;
        };

        pool.acquire(function(err, conn) {
            assert(!err);

            conn.execSql(createRequest('SELECT 42', 42, function () {
                conn.release(); //release the connect

                pool.acquire(function (err2, conn2) { //re-acquire the connection
                    assert(!err);
    
                    conn2.execSql(createRequest('SELECT 42', 42, function () {

                        pool.drain(done);
                    }));
                });
            }));
        });
    });
});
