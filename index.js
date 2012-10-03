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
  pool.activeConnections = [];
  pool.availableConnections = [];

  pool.connectionAvailable = function(connection) {
    this.activeConnections.splice(this.activeConnections.indexOf(connection), 1);
  };

  return {
    Connection: function() {
      var connection = new PooledConnection(pool, connectionConfig);
      pool.activeConnections.push(connection);

      return connection;
    }
  };
};

module.exports = ConnectionPool;
