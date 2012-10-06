var assert = require('assert')
var async = require('async')
var ConnectionPool = require('../index');
var Request = require('tedious').Request;

var connectionConfig = {
  userName: 'test',
  password: 'test',
  server: '192.168.1.212',
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    var poolSize = 1;

    it('should connect, and end', function(done) {
      var pool = new ConnectionPool({maxSize: poolSize}, connectionConfig);

      requestConnectionAndClose(pool, function() {
        done();
      });
    });

    it('should connect, select, and end', function(done) {
      var pool = new ConnectionPool({maxSize: poolSize}, connectionConfig);

      requestConnectionSelectAndClose(pool, function() {
        done();
      });
    });
  });

  describe('multiple connections within pool maxSize', function() {
    var poolSize = 5;

    it('should connect, and end', function(done) {
      var pool = new ConnectionPool({maxSize: poolSize}, connectionConfig);

      function doIt(done) {
        requestConnectionAndClose(pool, function() {
          done();
        });
      }

      var functions = [];
      for (var f = 0; f < poolSize; f++) {
        functions.push(doIt);
      }

      async.parallel(functions, done);
    });

    it('should connect, select, and end', function(done) {
      var pool = new ConnectionPool({maxSize: poolSize}, connectionConfig);

      function doIt(done) {
        requestConnectionSelectAndClose(pool, function() {
          done();
        });
      }

      var functions = [];
      for (var f = 0; f < poolSize; f++) {
        functions.push(doIt);
      }

      async.parallel(functions, done);
    });
  });
});

function requestConnectionAndClose(pool, done) {
  pool.requestConnection(function (connection) {
    connection.on('connect', function(err) {
      connection.close();
    });

    connection.on('end', function(err) {
      done();
    });
  });
}

function requestConnectionSelectAndClose(pool, done) {
  pool.requestConnection(function (connection) {
    var request = new Request('select 42', function(err, rowCount) {
        assert.strictEqual(rowCount, 1)
        connection.close()
    });

    request.on('row', function(columns) {
        assert.strictEqual(columns[0].value, 42)
    });

    connection.on('connect', function(err) {
      connection.execSql(request)
    });

    connection.on('end', function(err) {
      done();
    });
  });
}
