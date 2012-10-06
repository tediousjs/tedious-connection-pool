var Connection = require('tedious').Connection;
var util = require('util');

function PooledConnection(pool, config) {
    Connection.call(this, config);
    this.pool = pool;
}

util.inherits(PooledConnection, Connection);

PooledConnection.prototype.close = function() {
    this.emit('end');
    this.pool.connectionAvailable(this);
}

PooledConnection.prototype._close = function() {
    Connection.prototype.close.call(this);
}

function ConnectionPool(poolConfig, connectionConfig) {
  var pool = this;

  pool.config = poolConfig;
  pool.inUseConnections = [];
  pool.availableConnections = [];

  pool.connectionAvailable = function(connection) {
    this.inUseConnections.splice(this.inUseConnections.indexOf(connection), 1);
  };

  pool.requestConnection = function(callback) {
    var connection = new PooledConnection(pool, connectionConfig);
    pool.inUseConnections.push(connection);

    process.nextTick(function() {
      callback(connection);
    });
  };

  return {
    requestConnection: pool.requestConnection
  };
};

module.exports = ConnectionPool;
