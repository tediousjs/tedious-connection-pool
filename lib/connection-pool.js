var PooledConnection = require('./pooled-connection'),
    PoolModule = require('generic-pool');

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

function ConnectionPool(poolConfig, connectionConfig) {
  var self = this,
      param = {
        name: poolConfig.name || "",
        log: poolConfig.log,
        create: function(callback) {
          var connection = new PooledConnection(connectionConfig);
          var connected = false;

          connection.on('connect', function(err) {
            if (connected) {
              // The real 'connect' event has already been emmited by the
              // connection, and processed in this function.
              //
              // This is now the fake connect event emmited by the acquire function,
              // for applications' benefit.
              return;
            }

            if (err) {
              callback(err, null);
            } else {
              connected = true;

              connection.on('release', function() {
                connectionEventNames.forEach(function removeAllListeners(eventName) {
                  connection.removeAllListeners(eventName);
                });

                self.pool.release(connection);
              });

              callback(null, connection);
            }
          });
        },
        destroy: function(connection) {
          connection._close();
        },
        max: poolConfig.max || 10,
        min: poolConfig.min || 0,
        idleTimeoutMillis: poolConfig.idleTimeoutMillis || 30000
      };

  this.pool = PoolModule.Pool(param);
}

module.exports = ConnectionPool;


ConnectionPool.prototype.requestConnection = function(callback) {
  var self = this;
  this.pool.acquire(function(err, connection) {
    if(err) {
      callback(err, null);
    }
    else {
      callback(null, connection);
      connection.emit('connect');
    }
  });
};

ConnectionPool.prototype.drain = function(callback) {
  var self = this;

  self.pool.drain(function() {
    self.pool.destroyAllNow();
    callback();
  });
};
