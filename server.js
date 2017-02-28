var Cookies = require("cookies"),
  http = require('http'),
  mysql = require('mysql'),
  url = require('url'),
  socketIO = require('socket.io'),
  highlightCharacters = require('./highlightCharacters'),
  newEventsRefresh = require("./newEventsRefresh");


var SESSION_COOKIE_NAME = "40d0228e409c8b711909680cba94881c";

var SERVER_PORT = 12345;
if (process.argv.length > 2) {
  SERVER_PORT = process.argv[2];
}

var dbCredentials = require('../config/database.config.json');

var dbConnection = mysql.createConnection(dbCredentials);
dbConnection.connect();


var server = http.createServer(function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

var io = socketIO(server, {
  path: '/real-time/socket.io'
});

io.on('connection', function(socket) {
  var cookies = new Cookies(socket.handshake);
  var sessionId = cookies.get(SESSION_COOKIE_NAME);

  var notifcationType = socket.handshake.query["notificationType"];
  switch (notifcationType) {
    case "newEvents":
      var charId = parseInt(socket.handshake.query["character"], 10);
      var lastEvent = parseInt(socket.handshake.query["lastEvent"], 10);

      newEventsRefresh.registerClient(charId, lastEvent, sessionId, socket, dbConnection);
      socket.on('disconnect', function() {
        newEventsRefresh.unregisterClient(socket);
      });
      break;
    case "highlightedCharacters":

      highlightCharacters.registerClient(sessionId, socket, dbConnection);
      socket.on('disconnect', function() {
        highlightCharacters.unregisterClient(socket);
      });
      break;
  }
});

/**
 * Infinite setIntervals that query the db for the new data to push it to clients.
 */
newEventsRefresh.startDispatcherLoop(dbConnection);
highlightCharacters.startDispatcherLoop(dbConnection);

process.on('exit', function() {
  dbConnection.disconnect();
});

server.listen(SERVER_PORT, "127.0.0.1");
