var assert = require('assert')
var async = require('async')
var ConnectionPool = require('../lib/connection-pool');
var Request = require('tedious').Request;

var connectionConfig = {
  userName: 'test',
  password: 'test',
  server: '192.168.1.212',
  // options: {
  //   debug: {
  //     packet: true,
  //     data: true,
  //     payload: true,
  //     token: true
  //   }
  // }
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    var poolConfig = {maxSize: 1};

    it('should connect, and end', function(done) {
      testPool(poolConfig, poolConfig.maxSize, requestConnectionAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, poolConfig.maxSize, requestConnectionSelectAndClose, done);
    });
  });

  describe('multiple connections within pool maxSize', function() {
    var poolConfig = {maxSize: 5};
    var numberOfConnectionsToUse = poolConfig.maxSize;

    it('should connect, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, requestConnectionAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, requestConnectionSelectAndClose, done);
    });
  });

  describe('connections exceed pool maxSize', function() {
    var poolConfig = {maxSize: 5};
    var numberOfConnectionsToUse = 20;

    it('should connect, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, requestConnectionAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, requestConnectionSelectAndClose, done);
    });
  });
});

function testPool(poolConfig, numberOfConnectionsToUse, useConnectionFunction, done) {
  var pool = new ConnectionPool(poolConfig, connectionConfig);

  function doIt(done) {
    useConnectionFunction(pool, function() {
      done();
    });
  }

  var functions = [];
  for (var f = 0; f < numberOfConnectionsToUse; f++) {
    functions.push(doIt);
  }

  async.parallel(functions, done);
}

function requestConnectionAndClose(pool, done) {
  pool.requestConnection(function (err, connection) {
    assert.ok(!err);

    connection.on('connect', function(err) {
      connection.close();
    });

    connection.on('end', function(err) {
      done();
    });
  } );
}

function requestConnectionSelectAndClose(pool, done) {
  pool.requestConnection(function (err, connection) {
    assert.ok(!err);

    var request = new Request('select 42', function(err, rowCount) {
        assert.strictEqual(rowCount, 1);
        connection.close();
    });

    request.on('row', function(columns) {
        assert.strictEqual(columns[0].value, 42);
    });

    connection.on('connect', function(err) {
      connection.execSql(request);
    });

    connection.on('end', function(err) {
      done();
    });
  });
}
