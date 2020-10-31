//@ sourceMappingURL=WebsocketController.map
// Generated by CoffeeScript 1.6.0
(function() {
  var AuthorizationManager, ConnectedUsersManager, DocumentUpdaterManager, RoomManager, Utils, WebApiManager, WebsocketController, WebsocketLoadBalancer, logger, metrics;

  logger = require("logger-sharelatex");

  metrics = require("metrics-sharelatex");

  WebApiManager = require("./WebApiManager");

  AuthorizationManager = require("./AuthorizationManager");

  DocumentUpdaterManager = require("./DocumentUpdaterManager");

  ConnectedUsersManager = require("./ConnectedUsersManager");

  WebsocketLoadBalancer = require("./WebsocketLoadBalancer");

  RoomManager = require("./RoomManager");

  Utils = require("./Utils");

  module.exports = WebsocketController = {
    PROTOCOL_VERSION: 2,
    joinProject: function(client, user, project_id, callback) {
      var user_id;
      if (callback == null) {
        callback = function(error, project, privilegeLevel, protocolVersion) {};
      }
      user_id = user != null ? user._id : void 0;
      logger.log({
        user_id: user_id,
        project_id: project_id,
        client_id: client.id
      }, "user joining project");
      metrics.inc("editor.join-project");
      return WebApiManager.joinProject(project_id, user, function(error, project, privilegeLevel, isRestrictedUser) {
        var err, _ref;
        if (error != null) {
          return callback(error);
        }
        if (!privilegeLevel || privilegeLevel === "") {
          err = new Error("not authorized");
          logger.warn({
            err: err,
            project_id: project_id,
            user_id: user_id,
            client_id: client.id
          }, "user is not authorized to join project");
          return callback(err);
        }
        client.set("privilege_level", privilegeLevel);
        client.set("user_id", user_id);
        client.set("project_id", project_id);
        client.set("owner_id", project != null ? (_ref = project.owner) != null ? _ref._id : void 0 : void 0);
        client.set("first_name", user != null ? user.first_name : void 0);
        client.set("last_name", user != null ? user.last_name : void 0);
        client.set("email", user != null ? user.email : void 0);
        client.set("connected_time", new Date());
        client.set("signup_date", user != null ? user.signUpDate : void 0);
        client.set("login_count", user != null ? user.loginCount : void 0);
        client.set("is_restricted_user", !!isRestrictedUser);
        RoomManager.joinProject(client, project_id, function(err) {
          logger.log({
            user_id: user_id,
            project_id: project_id,
            client_id: client.id
          }, "user joined project");
          return callback(null, project, privilegeLevel, WebsocketController.PROTOCOL_VERSION);
        });
        return ConnectedUsersManager.updateUserPosition(project_id, client.id, user, null, function() {});
      });
    },
    FLUSH_IF_EMPTY_DELAY: 500,
    leaveProject: function(io, client, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      metrics.inc("editor.leave-project");
      return Utils.getClientAttributes(client, ["project_id", "user_id"], function(error, _arg) {
        var project_id, user_id;
        project_id = _arg.project_id, user_id = _arg.user_id;
        if (error != null) {
          return callback(error);
        }
        logger.log({
          project_id: project_id,
          user_id: user_id,
          client_id: client.id
        }, "client leaving project");
        WebsocketLoadBalancer.emitToRoom(project_id, "clientTracking.clientDisconnected", client.id);
        if (user_id == null) {
          logger.log({
            client_id: client.id
          }, "client leaving, unknown user");
          return callback();
        }
        if (project_id == null) {
          logger.log({
            user_id: user_id,
            client_id: client.id
          }, "client leaving, not in project");
          return callback();
        }
        ConnectedUsersManager.markUserAsDisconnected(project_id, client.id, function(err) {
          if (err != null) {
            return logger.error({
              err: err,
              project_id: project_id,
              user_id: user_id,
              client_id: client.id
            }, "error marking client as disconnected");
          }
        });
        RoomManager.leaveProjectAndDocs(client);
        return setTimeout(function() {
          var remainingClients;
          remainingClients = io.sockets.clients(project_id);
          if (remainingClients.length === 0) {
            DocumentUpdaterManager.flushProjectToMongoAndDelete(project_id, function(err) {
              if (err != null) {
                return logger.error({
                  err: err,
                  project_id: project_id,
                  user_id: user_id,
                  client_id: client.id
                }, "error flushing to doc updater after leaving project");
              }
            });
          }
          return callback();
        }, WebsocketController.FLUSH_IF_EMPTY_DELAY);
      });
    },
    joinDoc: function(client, doc_id, fromVersion, options, callback) {
      if (fromVersion == null) {
        fromVersion = -1;
      }
      if (callback == null) {
        callback = function(error, doclines, version, ops, ranges) {};
      }
      metrics.inc("editor.join-doc");
      return Utils.getClientAttributes(client, ["project_id", "user_id", "is_restricted_user"], function(error, _arg) {
        var is_restricted_user, project_id, user_id;
        project_id = _arg.project_id, user_id = _arg.user_id, is_restricted_user = _arg.is_restricted_user;
        if (error != null) {
          return callback(error);
        }
        if (project_id == null) {
          return callback(new Error("no project_id found on client"));
        }
        logger.log({
          user_id: user_id,
          project_id: project_id,
          doc_id: doc_id,
          fromVersion: fromVersion,
          client_id: client.id
        }, "client joining doc");
        return AuthorizationManager.assertClientCanViewProject(client, function(error) {
          if (error != null) {
            return callback(error);
          }
          return RoomManager.joinDoc(client, doc_id, function(error) {
            if (error != null) {
              return callback(error);
            }
            return DocumentUpdaterManager.getDocument(project_id, doc_id, fromVersion, function(error, lines, version, ranges, ops) {
              var change, comment, encodeForWebsockets, escapedLines, line, _i, _j, _k, _len, _len1, _len2, _ref, _ref1;
              if (error != null) {
                return callback(error);
              }
              if (is_restricted_user && ((ranges != null ? ranges.comments : void 0) != null)) {
                ranges.comments = [];
              }
              encodeForWebsockets = function(text) {
                return unescape(encodeURIComponent(text));
              };
              escapedLines = [];
              for (_i = 0, _len = lines.length; _i < _len; _i++) {
                line = lines[_i];
                try {
                  line = encodeForWebsockets(line);
                } catch (err) {
                  logger.err({
                    err: err,
                    project_id: project_id,
                    doc_id: doc_id,
                    fromVersion: fromVersion,
                    line: line,
                    client_id: client.id
                  }, "error encoding line uri component");
                  return callback(err);
                }
                escapedLines.push(line);
              }
              if (options.encodeRanges) {
                try {
                  _ref = (ranges != null ? ranges.comments : void 0) || [];
                  for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
                    comment = _ref[_j];
                    if (comment.op.c != null) {
                      comment.op.c = encodeForWebsockets(comment.op.c);
                    }
                  }
                  _ref1 = (ranges != null ? ranges.changes : void 0) || [];
                  for (_k = 0, _len2 = _ref1.length; _k < _len2; _k++) {
                    change = _ref1[_k];
                    if (change.op.i != null) {
                      change.op.i = encodeForWebsockets(change.op.i);
                    }
                    if (change.op.d != null) {
                      change.op.d = encodeForWebsockets(change.op.d);
                    }
                  }
                } catch (err) {
                  logger.err({
                    err: err,
                    project_id: project_id,
                    doc_id: doc_id,
                    fromVersion: fromVersion,
                    ranges: ranges,
                    client_id: client.id
                  }, "error encoding range uri component");
                  return callback(err);
                }
              }
              AuthorizationManager.addAccessToDoc(client, doc_id);
              logger.log({
                user_id: user_id,
                project_id: project_id,
                doc_id: doc_id,
                fromVersion: fromVersion,
                client_id: client.id
              }, "client joined doc");
              return callback(null, escapedLines, version, ops, ranges);
            });
          });
        });
      });
    },
    leaveDoc: function(client, doc_id, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      metrics.inc("editor.leave-doc");
      return Utils.getClientAttributes(client, ["project_id", "user_id"], function(error, _arg) {
        var project_id, user_id;
        project_id = _arg.project_id, user_id = _arg.user_id;
        logger.log({
          user_id: user_id,
          project_id: project_id,
          doc_id: doc_id,
          client_id: client.id
        }, "client leaving doc");
        RoomManager.leaveDoc(client, doc_id);
        return callback();
      });
    },
    updateClientPosition: function(client, cursorData, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      metrics.inc("editor.update-client-position", 0.1);
      return Utils.getClientAttributes(client, ["project_id", "first_name", "last_name", "email", "user_id"], function(error, _arg) {
        var email, first_name, last_name, project_id, user_id;
        project_id = _arg.project_id, first_name = _arg.first_name, last_name = _arg.last_name, email = _arg.email, user_id = _arg.user_id;
        if (error != null) {
          return callback(error);
        }
        logger.log({
          user_id: user_id,
          project_id: project_id,
          client_id: client.id,
          cursorData: cursorData
        }, "updating client position");
        return AuthorizationManager.assertClientCanViewProjectAndDoc(client, cursorData.doc_id, function(error) {
          if (error != null) {
            logger.warn({
              err: error,
              client_id: client.id,
              project_id: project_id,
              user_id: user_id
            }, "silently ignoring unauthorized updateClientPosition. Client likely hasn't called joinProject yet.");
            return callback();
          }
          cursorData.id = client.id;
          if (user_id != null) {
            cursorData.user_id = user_id;
          }
          if (email != null) {
            cursorData.email = email;
          }
          if (!user_id || user_id === 'anonymous-user') {
            cursorData.name = "";
            callback();
          } else {
            cursorData.name = first_name && last_name ? "" + first_name + " " + last_name : first_name ? first_name : last_name ? last_name : "";
            ConnectedUsersManager.updateUserPosition(project_id, client.id, {
              first_name: first_name,
              last_name: last_name,
              email: email,
              _id: user_id
            }, {
              row: cursorData.row,
              column: cursorData.column,
              doc_id: cursorData.doc_id
            }, callback);
          }
          return WebsocketLoadBalancer.emitToRoom(project_id, "clientTracking.clientUpdated", cursorData);
        });
      });
    },
    CLIENT_REFRESH_DELAY: 1000,
    getConnectedUsers: function(client, callback) {
      if (callback == null) {
        callback = function(error, users) {};
      }
      metrics.inc("editor.get-connected-users");
      return Utils.getClientAttributes(client, ["project_id", "user_id", "is_restricted_user"], function(error, clientAttributes) {
        var is_restricted_user, project_id, user_id;
        if (error != null) {
          return callback(error);
        }
        project_id = clientAttributes.project_id, user_id = clientAttributes.user_id, is_restricted_user = clientAttributes.is_restricted_user;
        if (is_restricted_user) {
          return callback(null, []);
        }
        if (project_id == null) {
          return callback(new Error("no project_id found on client"));
        }
        logger.log({
          user_id: user_id,
          project_id: project_id,
          client_id: client.id
        }, "getting connected users");
        return AuthorizationManager.assertClientCanViewProject(client, function(error) {
          if (error != null) {
            return callback(error);
          }
          WebsocketLoadBalancer.emitToRoom(project_id, 'clientTracking.refresh');
          return setTimeout(function() {
            return ConnectedUsersManager.getConnectedUsers(project_id, function(error, users) {
              if (error != null) {
                return callback(error);
              }
              callback(null, users);
              return logger.log({
                user_id: user_id,
                project_id: project_id,
                client_id: client.id
              }, "got connected users");
            });
          }, WebsocketController.CLIENT_REFRESH_DELAY);
        });
      });
    },
    applyOtUpdate: function(client, doc_id, update, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      return Utils.getClientAttributes(client, ["user_id", "project_id"], function(error, _arg) {
        var project_id, user_id;
        user_id = _arg.user_id, project_id = _arg.project_id;
        if (error != null) {
          return callback(error);
        }
        if (project_id == null) {
          return callback(new Error("no project_id found on client"));
        }
        return WebsocketController._assertClientCanApplyUpdate(client, doc_id, update, function(error) {
          if (error != null) {
            logger.warn({
              err: error,
              doc_id: doc_id,
              client_id: client.id,
              version: update.v
            }, "client is not authorized to make update");
            setTimeout(function() {
              return client.disconnect();
            }, 100);
            return callback(error);
          }
          update.meta || (update.meta = {});
          update.meta.source = client.id;
          update.meta.user_id = user_id;
          metrics.inc("editor.doc-update", 0.3);
          logger.log({
            user_id: user_id,
            doc_id: doc_id,
            project_id: project_id,
            client_id: client.id,
            version: update.v
          }, "sending update to doc updater");
          return DocumentUpdaterManager.queueChange(project_id, doc_id, update, function(error) {
            if (error != null) {
              logger.error({
                err: error,
                project_id: project_id,
                doc_id: doc_id,
                client_id: client.id,
                version: update.v
              }, "document was not available for update");
              client.disconnect();
            }
            return callback(error);
          });
        });
      });
    },
    _assertClientCanApplyUpdate: function(client, doc_id, update, callback) {
      return AuthorizationManager.assertClientCanEditProjectAndDoc(client, doc_id, function(error) {
        if (error != null) {
          if (error.message === "not authorized" && WebsocketController._isCommentUpdate(update)) {
            return AuthorizationManager.assertClientCanViewProjectAndDoc(client, doc_id, callback);
          } else {
            return callback(error);
          }
        } else {
          return callback(null);
        }
      });
    },
    _isCommentUpdate: function(update) {
      var op, _i, _len, _ref;
      _ref = update.op;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        op = _ref[_i];
        if (op.c == null) {
          return false;
        }
      }
      return true;
    }
  };

}).call(this);