var Connection = require('tedious').Connection;
var util = require('util');

var connectionEventNames = [
  'connect',
  'end',
  'debug',
  'infoMessage',
  'errorMessage',
  'databaseChange',
  'languageChange',
  'charsetChange',
  'secure'
];

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

function ConnectionPool(poolConfig, connectionConfig) {
  var pool = this;

  pool.config = poolConfig;
  pool.requestNumber = 0;
  pool.stats = {
    maxSize: poolConfig.maxSize,
    connections: 0
  };
  pool.inUseConnections = [];
  pool.availableConnections = [];
  pool.pendingConnectionRequests = [];

  pool.returnConnectionToPool = function(connection) {
    connectionEventNames.forEach(function removeAllListeners(eventName) {
      connection.removeAllListeners(eventName);
    });

    pool.inUseConnections.splice(pool.inUseConnections.indexOf(connection), 1);

    if (pool.pendingConnectionRequests.length > 0) {
      var pendingConnectionRequest = pool.pendingConnectionRequests.shift();

      pendingConnectionRequest(connection);
    }
  };

  pool.requestConnection = function(callback) {
    var requestNumber = ++pool.requestNumber;
    var connection;

    if (pool.availableConnections.length > 0) {
      connection = availableConnections.shift();
      connection.emit('connect');
    } else if (pool.inUseConnections.length < pool.config.maxSize) {
      connection = new PooledConnection(pool, connectionConfig);
      connection.number = ++pool.stats.connections;
    }

    if (connection) {
      useConnection(connection);
    } else {
      pool.pendingConnectionRequests.push(function (connection) {
        useConnection(connection);
        connection.emit('connect');
      });
    }

    function useConnection(connection) {
      pool.inUseConnections.push(connection);

      callback(connection);
    }
  };

  return {
    requestConnection: pool.requestConnection
  };
};

module.exports = ConnectionPool;
