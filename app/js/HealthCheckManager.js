//@ sourceMappingURL=HealthCheckManager.map
// Generated by CoffeeScript 1.6.0
(function() {
  var CHANNEL_ERROR, CHANNEL_MANAGER, COUNT, HOST, HealthCheckManager, PID, logger, metrics, os;

  metrics = require("metrics-sharelatex");

  logger = require("logger-sharelatex");

  os = require("os");

  HOST = os.hostname();

  PID = process.pid;

  COUNT = 0;

  CHANNEL_MANAGER = {};

  CHANNEL_ERROR = {};

  module.exports = HealthCheckManager = (function() {

    function HealthCheckManager(channel, timeout) {
      var _this = this;
      this.channel = channel;
      if (timeout == null) {
        timeout = 1000;
      }
      this.id = "host=" + HOST + ":pid=" + PID + ":count=" + (COUNT++);
      this.count = 0;
      this.handler = setTimeout(function() {
        return _this.setStatus();
      }, timeout);
      this.timer = new metrics.Timer("event." + this.channel + ".latency");
      CHANNEL_MANAGER[this.channel] = this;
    }

    HealthCheckManager.prototype.processEvent = function(id) {
      var _ref;
      if (id === this.id) {
        this.count++;
        if ((_ref = this.timer) != null) {
          _ref.done();
        }
        return this.timer = null;
      }
    };

    HealthCheckManager.prototype.setStatus = function() {
      var error;
      if (this.count !== 1) {
        logger.err({
          channel: this.channel,
          count: this.count,
          id: this.id
        }, "redis channel health check error");
      }
      error = this.count !== 1;
      return CHANNEL_ERROR[this.channel] = error;
    };

    HealthCheckManager.check = function(channel, id) {
      var _ref;
      return (_ref = CHANNEL_MANAGER[channel]) != null ? _ref.processEvent(id) : void 0;
    };

    HealthCheckManager.status = function() {
      return CHANNEL_ERROR;
    };

    HealthCheckManager.isFailing = function() {
      var channel, error;
      for (channel in CHANNEL_ERROR) {
        error = CHANNEL_ERROR[channel];
        if (error === true) {
          return true;
        }
      }
      return false;
    };

    return HealthCheckManager;

  })();

}).call(this);
