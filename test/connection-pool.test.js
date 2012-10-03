var assert = require('assert')
var ConnectionPool = require('../index');

var connectionConfig = {
  userName: 'test',
  password: 'test',
  server: '192.168.1.212',
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    it('should connect', function(done) {

      // var connection = new Connection(connectionConfig);

      // connection.on('connect', function(err) {
      //   done();
      // });

      var cp = new ConnectionPool({size: 2}, connectionConfig);
      var Connection = cp.Connection;
      //var connection = cp.getConnection();
      var connection = new Connection();
      //console.log(connection.pool);

      connection.on('connect', function(err) {
        connection.close();
        // done();
      });

      connection.on('end', function(err) {
        // console.log('end')
        done();
      });
    })
  })
})
