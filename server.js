var SSE = require('sse-nodejs'),
  Cookies = require("cookies"),
  http = require('http'),
  mysql = require('mysql'),
  express = require('express');


var SERVER_PORT = 12345;
var EVENT_REFRESH_FREQUENCY_MSEC = 100;
var SESSION_COOKIE_NAME = "YOUR COOKIE NAME";

var dbCredentials = require('../config/database.config.json');

var dbConnection = mysql.createConnection(dbCredentials);
dbConnection.connect();


var sseUsers = [];

function notifyActiveCharacters(lastEventForCharacters) {
  sseUsers.forEach(function(sseUser) {

    var userCharId = sseUser.charId;

    if (userCharId in lastEventForCharacters && lastEventForCharacters[userCharId] > sseUser.lastEvent) {
      var sseHandler = sseUser.sse;
      sseHandler.sendEvent("new-events", "po-ta-toes");

      sseUser.lastEvent = lastEventForCharacters[userCharId]; // update last event ssen for this session
    }
  });
}

setInterval(function() {
  var characterIds = sseUsers.map(function(sseUser) {
    return sseUser.charId;
  });

  characterIds.push(-1); // to make sure the list is never empty
  dbConnection.query('SELECT charId, lastEvent FROM ...', [characterIds], function(err, rows) {
    var lastEventsForCharacters = {};
    rows.forEach(function(element) {
      lastEventsForCharacters[element.charId] = element.lastEvent;
    });
    notifyActiveCharacters(lastEventsForCharacters);
  });
}, EVENT_REFRESH_FREQUENCY_MSEC);


var app = express();

app.get('/', function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

app.get('/sse', function(req, res) {

  var sseHandler = new SSE(res);
  var cookies = new Cookies(req, res);

  var charId = parseInt(req.query.character, 10);
  var lastEvent = parseInt(req.query.lastEvent, 10);

  var sessionId = cookies.get(SESSION_COOKIE_NAME);
  if (!isNaN(charId) && !isNaN(lastEvent)) {
    dbConnection.query('SELECT COUNT(*) AS count FROM sessions s WHERE ...', [charId, sessionId], function(err, rows) {
      if (rows[0].count == 1) {
        sseUsers.push({charId: charId, sse: sseHandler, lastEvent: lastEvent});
      }
    });
  }

  sseHandler.disconnect(function() {
    for (var i = 0; i < sseUsers.length; i++) {
      if (sseUsers[i].sse == sseHandler) {
        sseUsers.splice(i, 1);
      }
    }
  });
});

process.on('exit', function(code) {
  dbConnection.disconnect();
});

app.listen(SERVER_PORT);
