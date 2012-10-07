var Connection = require('tedious').Connection;
var util = require('util');

function PooledConnection(pool, config) {
    Connection.call(this, config);
    this.pool = pool;
}

util.inherits(PooledConnection, Connection);

PooledConnection.prototype.close = function() {
    this.emit('end');
    this.pool.returnConnectionToPool(this);
}

PooledConnection.prototype._close = function() {
    Connection.prototype.close.call(this);
}

module.exports = PooledConnection;
