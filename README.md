# node-sse-example
Example of using node.js and server-sent events for browser notification.
This example aims to deliver information about new events for characters in the game.
It has a single global handler which can notify any of connected users using server-sent events.

SQL code of MySQL queries that authenticated connected users and get info who should be notified is left for implementation.

# how to run
node server.js
