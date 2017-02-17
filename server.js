var Cookies = require("cookies"),
  http = require('http'),
  mysql = require('mysql'),
  url = require('url'),
  deepEqual = require('deep-equal'),
  socketIO = require('socket.io'),
  requestToApache = require("./requestToApache").default;


var EVENT_REFRESH_FREQUENCY_MSEC = 100;
var HIGHLIGHTED_CHARACTERS_FREQUENCY_MSEC = 1000;
var SESSION_COOKIE_NAME = "40d0228e409c8b711909680cba94881c";

var SERVER_PORT = 12345;
if (process.argv.length > 2) {
  SERVER_PORT = process.argv[2];
}

var dbCredentials = require('../config/database.config.json');

var dbConnection = mysql.createConnection(dbCredentials);
dbConnection.connect();


function pushNewEventsToClient(clientData) {
  var requestUrl = '/liteindex.php?page=info.new_events&le='
    + clientData.lastEvent
    + "&character=" + clientData.charId;
  var responseCallback = function(obj) {
    clientData.socket.emit("new-events", obj);
  };
  requestToApache(
    requestUrl,
    clientData,
    responseCallback
  );
}

var listenersForEventsList = [];
var listenersForHighlighedCharacters = [];

function notifyActiveCharacters(lastEventForCharacter) {
  listenersForEventsList.forEach(function(clientData) {

    var clientCharId = clientData.charId;

    if (clientCharId in lastEventForCharacter && lastEventForCharacter[clientCharId] > clientData.lastEvent) {
      pushNewEventsToClient(clientData);

      clientData.lastEvent = lastEventForCharacter[clientCharId]; // update last event for this session
    }
  });
}

setInterval(function() {
  var characterIds = listenersForEventsList.map(function(clientData) {
    return clientData.charId;
  });

  characterIds.push(-1); // to make sure the list is never empty
  dbConnection.query('SELECT `observer` AS charId, MAX(`event`) AS lastEvent FROM events_obs ' +
    'WHERE observer IN (?) GROUP BY observer', [characterIds], function(err, rows) {
    var lastEventsForCharacters = {};
    rows.forEach(function(element) {
      lastEventsForCharacters[element.charId] = element.lastEvent;
    });
    notifyActiveCharacters(lastEventsForCharacters);
  });
}, EVENT_REFRESH_FREQUENCY_MSEC);

setInterval(function() {
  var playerIds = listenersForHighlighedCharacters.map(function(clientData) {
    return clientData.playerId;
  });

  playerIds.push(-1); // to make sure the list is never empty
  dbConnection.query('SELECT c.player, c.id AS charId, new = 0 AS new FROM `newevents` ne ' +
    'INNER JOIN `chars` c ON ne.person = c.id AND c.player IN (?)', [playerIds], function(err, rows) {
    var charsByPlayer = {};
    rows.forEach(function(row) {
      if (!charsByPlayer[row.player]) {
        charsByPlayer[row.player] = {};
      }
      charsByPlayer[row.player][row.charId] = row.new;
    });
    listenersForHighlighedCharacters.forEach(function(clientData) {
      var currentCharactersList = charsByPlayer[clientData.playerId];
      if (!deepEqual(clientData.previousCharacterList, currentCharactersList)) { // notify if anything has changed
        clientData.socket.emit("highlighted-characters", charsByPlayer[clientData.playerId]);
      }
      clientData.previousCharacterList = currentCharactersList;
    });
  });
}, HIGHLIGHTED_CHARACTERS_FREQUENCY_MSEC);

var app = http.createServer(function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

var io = socketIO(app, {
  path: '/real-time/socket.io'
});

function registerNewEventsObserver(charId, lastEvent, sessionId, socket, listenersForEventsList, dbConnection) {
  if (!isNaN(charId) && !isNaN(lastEvent)) {
    dbConnection.query('SELECT COUNT(*) AS count FROM sessions s ' +
      'INNER JOIN chars c ON c.player = s.player ' +
      'WHERE c.id = ? AND s.id = ?', [charId, sessionId], function(err, rows) {
      if (rows[0].count == 1) {
        console.log("Add user ", charId, " as an event observer");
        var hostName = /(.*):\d+/.exec(socket.handshake.headers.host)[1];
        listenersForEventsList.push({
          charId: charId,
          socket: socket,
          lastEvent: lastEvent,
          cookies: socket.handshake.headers.cookie,
          hostName: hostName
        });
      }
    });

    socket.on('disconnect', function() {
      for (var i = 0; i < listenersForEventsList.length; i++) {
        if (listenersForEventsList[i].socket == socket) {
          console.log("Remove user", listenersForEventsList[i].charId, "from event observers");
          listenersForEventsList.splice(i, 1);
        }
      }
    });
  }
}

function registerHighlightedCharacters(sessionId, socket, listenersForHighlighedCharacters, dbConnection) {
  dbConnection.query('SELECT player FROM sessions s ' +
    'WHERE s.id = ?', [sessionId], function(err, rows) {
    var playerId = rows[0].player;
    if (playerId) {
      console.log("Add player ", playerId, " as active characters watcher");
      listenersForHighlighedCharacters.push({
        playerId: playerId,
        socket: socket,
        previousCharacterList: {},
      });
    }
  });

  socket.on('disconnect', function() {
    for (var i = 0; i < listenersForHighlighedCharacters.length; i++) {
      if (listenersForHighlighedCharacters[i].socket == socket) {
        console.log("Remove player", listenersForHighlighedCharacters[i].playerId, "from active characters");
        listenersForHighlighedCharacters.splice(i, 1);
      }
    }
  });
}

io.on('connection', function(socket) {
  var cookies = new Cookies(socket.handshake);
  var notifcationType = socket.handshake.query["notificationType"];

  switch (notifcationType) {
    case "newEvents":
      var sessionId = cookies.get(SESSION_COOKIE_NAME);
      var charId = parseInt(socket.handshake.query["character"], 10);
      var lastEvent = parseInt(socket.handshake.query["lastEvent"], 10);
      registerNewEventsObserver(charId, lastEvent, sessionId, socket, listenersForEventsList, dbConnection);
      break;
    case "highlightedCharacters":
      var sessionId = cookies.get(SESSION_COOKIE_NAME);
      registerHighlightedCharacters(sessionId, socket, listenersForHighlighedCharacters, dbConnection);
      break;
  }
});

process.on('exit', function(code) {
  dbConnection.disconnect();
});

app.listen(SERVER_PORT);
