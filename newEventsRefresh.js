var requestToApache = require("./requestToApache").default;

var NEW_EVENTS_REFRESH_FREQUENCY_MSEC = 100;

var listenersForNewEventsList = [];
var intervalId = null;


function startDispatcherLoop(dbConnection) {
  if (intervalId) {
    console.log("The listener loop was already started");
    return;
  }

  intervalId = setInterval(function() {
    var characterIds = listenersForNewEventsList.map(function(clientData) {
      return clientData.charId;
    });

    characterIds.push(-1); // to make sure the list is never empty
    dbConnection.query('SELECT `observer` AS charId, MAX(`event`) AS lastEvent FROM events_obs ' +
      'WHERE observer IN (?) GROUP BY observer', [characterIds], function(err, rows) {
      var lastEventsForCharacters = {};
      rows.forEach(function(element) {
        lastEventsForCharacters[element.charId] = element.lastEvent;
      });
      dispatchNewEventsToCharaters(lastEventsForCharacters);
    });
  }, NEW_EVENTS_REFRESH_FREQUENCY_MSEC);
}

function stopDispatcherLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function pushNewEventsToClientAndUpdateLastEvent(clientData) {
  var requestUrl = '/liteindex.php?page=info.new_events&le='
    + clientData.lastEvent
    + "&character=" + clientData.charId;

  requestToApache(
    requestUrl,
    clientData,
    function(apacheResponse) {
      if (apacheResponse.e) {
        console.log("Request to apache", clientData.charId, "returned error:", apacheResponse.e);
        unregisterClient(clientData.socket);
        clientData.socket.disconnect();
        return;
      }
      clientData.socket.emit("new-events", apacheResponse, function() {

        if (apacheResponse.newestEventId > clientData.lastEvent) {
          clientData.lastEvent = apacheResponse.newestEventId;
        }
        clientData.requestingEvents = false;
      });
    }
  );
}


function dispatchNewEventsToCharaters(lastEventForCharacter) {
  listenersForNewEventsList.forEach(function(clientData) {

    var clientCharId = clientData.charId;
    if (clientCharId in lastEventForCharacter
      && !clientData.requestingEvents
      && lastEventForCharacter[clientCharId] > clientData.lastEvent) {
      clientData.requestingEvents = true;
      pushNewEventsToClientAndUpdateLastEvent(clientData);
    }
  });
}


function unregisterClient(socket) {
  for (var i = 0; i < listenersForNewEventsList.length; i++) {
    if (listenersForNewEventsList[i].socket == socket) {
      console.log("Remove user", listenersForNewEventsList[i].charId, "from event observers");
      listenersForNewEventsList.splice(i, 1);
    }
  }
}

function registerClient(charId, lastEvent, sessionId, socket, dbConnection) {
  if (!isNaN(charId) && !isNaN(lastEvent)) {
    dbConnection.query('SELECT COUNT(*) AS count FROM sessions s ' +
      'INNER JOIN chars c ON c.player = s.player ' +
      'WHERE c.id = ? AND s.id = ?', [charId, sessionId], function(err, rows) {
      if (rows[0].count == 1) {
        console.log("Add user", charId, "as an event observer");
        var hostName = /([^:]+)(:\d+)?/.exec(socket.handshake.headers.host)[1];
        listenersForNewEventsList.push({
          charId: charId,
          socket: socket,
          lastEvent: lastEvent,
          cookies: socket.handshake.headers.cookie,
          hostName: hostName,
          requestingEvents: false,
        });
      } else {
        socket.disconnect();
      }
    });

    socket.on('disconnect', function() {
      unregisterClient(socket);
    });
  }
}


module.exports = {
  registerClient: registerClient,
  unregisterClient: unregisterClient,
  startDispatcherLoop: startDispatcherLoop,
  stopDispatcherLoop: stopDispatcherLoop
};
