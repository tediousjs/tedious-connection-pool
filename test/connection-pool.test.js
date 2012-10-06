var assert = require('assert')
var ConnectionPool = require('../index');

var connectionConfig = {
  userName: 'test',
  password: 'test',
  server: '192.168.1.212',
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    it('should connect and end', function(done) {
      var cp = new ConnectionPool({maxSize: 2}, connectionConfig);

      cp.requestConnection(function (connection) {
        connection.on('connect', function(err) {
          connection.close();
        });

        connection.on('end', function(err) {
          done();
        });
      });
    })
  })
})
