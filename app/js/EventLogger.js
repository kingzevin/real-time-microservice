//@ sourceMappingURL=EventLogger.map
// Generated by CoffeeScript 1.6.0
(function() {
  var COUNTER, EVENT_LAST_CLEAN_TIMESTAMP, EVENT_LOG_COUNTER, EVENT_LOG_TIMESTAMP, EventLogger, logger, metrics, settings;

  logger = require('logger-sharelatex');

  metrics = require('metrics-sharelatex');

  settings = require('settings-sharelatex');

  EVENT_LOG_COUNTER = {};

  EVENT_LOG_TIMESTAMP = {};

  EVENT_LAST_CLEAN_TIMESTAMP = 0;

  COUNTER = 0;

  module.exports = EventLogger = {
    MAX_STALE_TIME_IN_MS: 3600 * 1000,
    debugEvent: function(channel, message) {
      if (settings.debugEvents > 0) {
        logger.log({
          channel: channel,
          message: message,
          counter: COUNTER++
        }, "logging event");
        return settings.debugEvents--;
      }
    },
    checkEventOrder: function(channel, message_id, message) {
      var count, key, previous, result;
      if (typeof message_id !== 'string') {
        return;
      }
      if (!(result = message_id.match(/^(.*)-(\d+)$/))) {
        return;
      }
      key = result[1];
      count = parseInt(result[2], 0);
      if (!(count >= 0)) {
        return;
      }
      previous = EventLogger._storeEventCount(key, count);
      if ((previous == null) || count === (previous + 1)) {
        metrics.inc("event." + channel + ".valid", 0.001);
        return;
      }
      if (count === previous) {
        metrics.inc("event." + channel + ".duplicate");
        logger.warn({
          channel: channel,
          message_id: message_id
        }, "duplicate event");
        return "duplicate";
      } else {
        metrics.inc("event." + channel + ".out-of-order");
        logger.warn({
          channel: channel,
          message_id: message_id,
          key: key,
          previous: previous,
          count: count
        }, "out of order event");
        return "out-of-order";
      }
    },
    _storeEventCount: function(key, count) {
      var now, previous;
      previous = EVENT_LOG_COUNTER[key];
      now = Date.now();
      EVENT_LOG_COUNTER[key] = count;
      EVENT_LOG_TIMESTAMP[key] = now;
      if ((now - EVENT_LAST_CLEAN_TIMESTAMP) > EventLogger.MAX_STALE_TIME_IN_MS) {
        EventLogger._cleanEventStream(now);
        EVENT_LAST_CLEAN_TIMESTAMP = now;
      }
      return previous;
    },
    _cleanEventStream: function(now) {
      var key, timestamp, _results;
      _results = [];
      for (key in EVENT_LOG_TIMESTAMP) {
        timestamp = EVENT_LOG_TIMESTAMP[key];
        if ((now - timestamp) > EventLogger.MAX_STALE_TIME_IN_MS) {
          delete EVENT_LOG_COUNTER[key];
          _results.push(delete EVENT_LOG_TIMESTAMP[key]);
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    }
  };

}).call(this);