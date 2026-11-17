const test = require('node:test');
const assert = require('node:assert/strict');
const { disconnectUserSessionSockets } = require('./socketSessions');

const createSocket = sessionJti => ({
  sessionJti,
  events: [],
  disconnected: false,
  emit(event, payload) {
    this.events.push({ event, payload });
  },
  disconnect(force) {
    this.disconnected = force;
  }
});

test('disconnects only sockets using the revoked session token', () => {
  const first = createSocket('session-a');
  const second = createSocket('session-a');
  const otherSession = createSocket('session-b');
  const otherUser = createSocket('session-a');
  const io = {
    sockets: {
      sockets: new Map([
        ['first', first],
        ['second', second],
        ['other-session', otherSession],
        ['other-user', otherUser]
      ])
    }
  };
  const connectedUsers = new Map([
    ['user-1', new Set(['first', 'second', 'other-session'])],
    ['user-2', new Set(['other-user'])]
  ]);

  assert.equal(disconnectUserSessionSockets(io, connectedUsers, 'user-1', 'session-a'), 2);
  assert.equal(first.disconnected, true);
  assert.equal(second.disconnected, true);
  assert.equal(otherSession.disconnected, false);
  assert.equal(otherUser.disconnected, false);
  assert.deepEqual(first.events, [{
    event: 'sessionExpired',
    payload: { message: 'Session expirée. Reconnecte-toi.' }
  }]);
});

test('does not disconnect sockets when the session identifier is missing or unknown', () => {
  const socket = createSocket('session-a');
  const io = { sockets: { sockets: new Map([['socket', socket]]) } };
  const connectedUsers = new Map([['user-1', new Set(['socket'])]]);

  assert.equal(disconnectUserSessionSockets(io, connectedUsers, 'user-1', ''), 0);
  assert.equal(disconnectUserSessionSockets(io, connectedUsers, 'user-1', 'session-b'), 0);
  assert.equal(socket.disconnected, false);
});
