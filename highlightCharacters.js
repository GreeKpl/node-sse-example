var deepEqual = require('deep-equal');

var HIGHLIGHTED_CHARACTERS_FREQUENCY_MSEC = 1000;

var listenersForHighlighedCharacters = [];
var intervalId = null;


function startDispatcherLoop(dbConnection) {
  if (intervalId) {
    console.log("The listener loop was already started");
    return;
  }

  intervalId = setInterval(function() {
    var playerIds = listenersForHighlighedCharacters.map(function(clientData) {
      return clientData.playerId;
    });

    playerIds.push(-1); // to make sure the list is never empty
    dbConnection.query('SELECT c.player, c.id AS charId, new = 0 AS new FROM `newevents` ne ' +
      'INNER JOIN `chars` c ON ne.person = c.id AND c.player IN (?)', [playerIds], function(err, rows) {
      var charsByPlayer = getHighlightedCharsByPlayer(rows);

      listenersForHighlighedCharacters.forEach(function(clientData) {
        var currentCharactersList = charsByPlayer[clientData.playerId];
        if (!deepEqual(clientData.previousCharacterList, currentCharactersList)) { // notify if anything has changed
          clientData.socket.emit("highlighted-characters", charsByPlayer[clientData.playerId]);
        }
        clientData.previousCharacterList = currentCharactersList;
      });
    });
  }, HIGHLIGHTED_CHARACTERS_FREQUENCY_MSEC);
}

function stopDispatcherLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function getHighlightedCharsByPlayer(rows) {
  var charsByPlayer = {};
  rows.forEach(function(row) {
    if (!charsByPlayer[row.player]) {
      charsByPlayer[row.player] = {};
    }
    charsByPlayer[row.player][row.charId] = row.new;
  });
  return charsByPlayer;
}


function unregisterClient(socket) {
  for (var i = 0; i < listenersForHighlighedCharacters.length; i++) {
    if (listenersForHighlighedCharacters[i].socket == socket) {
      console.log("Remove player", listenersForHighlighedCharacters[i].playerId, "from active characters");
      listenersForHighlighedCharacters.splice(i, 1);
    }
  }
}

function registerClient(sessionId, socket, dbConnection) {
  dbConnection.query('SELECT player FROM sessions s ' +
    'WHERE s.id = ?', [sessionId], function(err, rows) {
    if (rows.length > 0) {
      var playerId = rows[0].player;
      if (playerId) {
        console.log("Add player", playerId, "as active characters watcher");
        listenersForHighlighedCharacters.push({
          playerId: playerId,
          socket: socket,
          previousCharacterList: {},
        });
      }
    } else {
      socket.disconnect();
    }
  });
}

module.exports = {
  registerClient: registerClient,
  unregisterClient: unregisterClient,
  startDispatcherLoop: startDispatcherLoop,
  stopDispatcherLoop: stopDispatcherLoop
};
