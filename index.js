var Connection = require('tedious').Connection;
var util = require('util');

function PooledConnection(config) {
    Connection.call(this, config);
}

util.inherits(PooledConnection, Connection);

PooledConnection.prototype.close = function() {
    this._close();
}

PooledConnection.prototype._close = function() {
    Connection.prototype.close.call(this);
}

function ConnectionPool(config) {
  return {
    getConnection: function() {
      return new PooledConnection(config);
    }
  };
};

module.exports = ConnectionPool;
