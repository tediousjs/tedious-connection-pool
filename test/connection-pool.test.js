var assert = require('assert')
var ConnectionPool = require('../index');

var config = {
  userName: 'test',
  password: 'test',
  server: '192.168.1.212',
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    it('should connect', function(done) {

      // var connection = new Connection(config);

      // connection.on('connect', function(err) {
      //   done();
      // });

      var cp = new ConnectionPool(config);
      var connection = cp.getConnection();
      // console.log(connection);

      connection.on('connect', function(err) {
        connection.close();
      });

      connection.on('end', function(err) {
        console.log('end')
        done();
      });
    })
  })
})
