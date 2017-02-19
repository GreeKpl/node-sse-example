# node-socketio-example
Example of using node.js and socketio for event notifications.
It's an example of unidirectional communication, so it was tried to be done using server-sent events,
but socket.io has proven to be a superior and better supported solution.

This example aims to deliver the information about new events to the characters in the game.
It has an eternal handler loop which can notify any of connected users when new data is available.

Specifically, it's meant to be used for [Cantr](https://cantr.net) - a 100% free-to-play, browser-based role-playing game and society simulator.

# how to run
node server.js [PORT_TO_LISTEN]

[PORT_TO_LISTEN] - optional, default is 12345
