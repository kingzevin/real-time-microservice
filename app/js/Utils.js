//@ sourceMappingURL=Utils.map
// Generated by CoffeeScript 1.6.0
(function() {
  var Utils, async;

  async = require("async");

  module.exports = Utils = {
    getClientAttributes: function(client, keys, callback) {
      var attributes, jobs;
      if (callback == null) {
        callback = function(error, attributes) {};
      }
      attributes = {};
      jobs = keys.map(function(key) {
        return function(callback) {
          return client.get(key, function(error, value) {
            if (error != null) {
              return callback(error);
            }
            attributes[key] = value;
            return callback();
          });
        };
      });
      return async.series(jobs, function(error) {
        if (error != null) {
          return callback(error);
        }
        return callback(null, attributes);
      });
    }
  };

}).call(this);
