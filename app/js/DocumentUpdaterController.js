//@ sourceMappingURL=DocumentUpdaterController.map
// Generated by CoffeeScript 1.6.0
(function() {
  var ChannelManager, DocumentUpdaterController, EventLogger, HealthCheckManager, MESSAGE_SIZE_LOG_LIMIT, RedisClientManager, RoomManager, SafeJsonParse, logger, metrics, settings;

  logger = require("logger-sharelatex");

  settings = require('settings-sharelatex');

  RedisClientManager = require("./RedisClientManager");

  SafeJsonParse = require("./SafeJsonParse");

  EventLogger = require("./EventLogger");

  HealthCheckManager = require("./HealthCheckManager");

  RoomManager = require("./RoomManager");

  ChannelManager = require("./ChannelManager");

  metrics = require("metrics-sharelatex");

  MESSAGE_SIZE_LOG_LIMIT = 1024 * 1024;

  module.exports = DocumentUpdaterController = {
    rclientList: RedisClientManager.createClientList(settings.redis.pubsub),
    listenForUpdatesFromDocumentUpdater: function(io) {
      var i, rclient, _fn, _i, _j, _len, _len1, _ref, _ref1;
      logger.log({
        rclients: this.rclientList.length
      }, "listening for applied-ops events");
      _ref = this.rclientList;
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        rclient = _ref[i];
        rclient.subscribe("applied-ops");
        rclient.on("message", function(channel, message) {
          metrics.inc("rclient", 0.001);
          if (settings.debugEvents > 0) {
            EventLogger.debugEvent(channel, message);
          }
          return DocumentUpdaterController._processMessageFromDocumentUpdater(io, channel, message);
        });
      }
      if (this.rclientList.length > 1) {
        _ref1 = this.rclientList;
        _fn = function(i) {
          return rclient.on("message", function() {
            return metrics.inc("rclient-" + i, 0.001);
          });
        };
        for (i = _j = 0, _len1 = _ref1.length; _j < _len1; i = ++_j) {
          rclient = _ref1[i];
          _fn(i);
        }
      }
      return this.handleRoomUpdates(this.rclientList);
    },
    handleRoomUpdates: function(rclientSubList) {
      var roomEvents;
      roomEvents = RoomManager.eventSource();
      roomEvents.on('doc-active', function(doc_id) {
        var rclient, subscribePromises;
        subscribePromises = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = rclientSubList.length; _i < _len; _i++) {
            rclient = rclientSubList[_i];
            _results.push(ChannelManager.subscribe(rclient, "applied-ops", doc_id));
          }
          return _results;
        })();
        return RoomManager.emitOnCompletion(subscribePromises, "doc-subscribed-" + doc_id);
      });
      return roomEvents.on('doc-empty', function(doc_id) {
        var rclient, _i, _len, _results;
        _results = [];
        for (_i = 0, _len = rclientSubList.length; _i < _len; _i++) {
          rclient = rclientSubList[_i];
          _results.push(ChannelManager.unsubscribe(rclient, "applied-ops", doc_id));
        }
        return _results;
      });
    },
    _processMessageFromDocumentUpdater: function(io, channel, message) {
      return SafeJsonParse.parse(message, function(error, message) {
        var status;
        if (error != null) {
          logger.error({
            err: error,
            channel: channel
          }, "error parsing JSON");
          return;
        }
        if (message.op != null) {
          if ((message._id != null) && settings.checkEventOrder) {
            status = EventLogger.checkEventOrder("applied-ops", message._id, message);
            if (status === 'duplicate') {
              return;
            }
          }
          return DocumentUpdaterController._applyUpdateFromDocumentUpdater(io, message.doc_id, message.op);
        } else if (message.error != null) {
          return DocumentUpdaterController._processErrorFromDocumentUpdater(io, message.doc_id, message.error, message);
        } else if (message.health_check != null) {
          logger.debug({
            message: message
          }, "got health check message in applied ops channel");
          return HealthCheckManager.check(channel, message.key);
        }
      });
    },
    _applyUpdateFromDocumentUpdater: function(io, doc_id, update) {
      var client, clientList, seen, _i, _len, _ref, _ref1, _ref2;
      clientList = io.sockets.clients(doc_id);
      if (clientList.length === 0) {
        return;
      }
      logger.log({
        doc_id: doc_id,
        version: update.v,
        source: (_ref = update.meta) != null ? _ref.source : void 0,
        socketIoClients: (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = clientList.length; _i < _len; _i++) {
            client = clientList[_i];
            _results.push(client.id);
          }
          return _results;
        })()
      }, "distributing updates to clients");
      seen = {};
      for (_i = 0, _len = clientList.length; _i < _len; _i++) {
        client = clientList[_i];
        if (!(!seen[client.id])) {
          continue;
        }
        seen[client.id] = true;
        if (client.id === update.meta.source) {
          logger.log({
            doc_id: doc_id,
            version: update.v,
            source: (_ref1 = update.meta) != null ? _ref1.source : void 0
          }, "distributing update to sender");
          try {
            client.emit("otUpdateApplied", {
              v: update.v,
              doc: update.doc
            });
          } catch (err) {
            logger.warn({
              client_id: client.id,
              doc_id: doc_id,
              err: err
            }, "error sending update to sender");
          }
        } else if (!update.dup) {
          logger.log({
            doc_id: doc_id,
            version: update.v,
            source: (_ref2 = update.meta) != null ? _ref2.source : void 0,
            client_id: client.id
          }, "distributing update to collaborator");
          try {
            client.emit("otUpdateApplied", update);
          } catch (err) {
            logger.warn({
              client_id: client.id,
              doc_id: doc_id,
              err: err
            }, "error sending update to collaborator");
          }
        }
      }
      if (Object.keys(seen).length < clientList.length) {
        metrics.inc("socket-io.duplicate-clients", 0.1);
        return logger.log({
          doc_id: doc_id,
          socketIoClients: (function() {
            var _j, _len1, _results;
            _results = [];
            for (_j = 0, _len1 = clientList.length; _j < _len1; _j++) {
              client = clientList[_j];
              _results.push(client.id);
            }
            return _results;
          })()
        }, "discarded duplicate clients");
      }
    },
    _processErrorFromDocumentUpdater: function(io, doc_id, error, message) {
      var client, _i, _len, _ref, _results;
      _ref = io.sockets.clients(doc_id);
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        client = _ref[_i];
        logger.warn({
          err: error,
          doc_id: doc_id,
          client_id: client.id
        }, "error from document updater, disconnecting client");
        try {
          client.emit("otUpdateError", error, message);
          _results.push(client.disconnect());
        } catch (err) {
          _results.push(logger.warn({
            client_id: client.id,
            doc_id: doc_id,
            err: err,
            cause: error
          }, "error sending error to client"));
        }
      }
      return _results;
    }
  };

}).call(this);