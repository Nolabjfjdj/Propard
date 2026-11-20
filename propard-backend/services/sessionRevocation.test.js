const test = require('node:test');
const assert = require('node:assert/strict');
const { revokeAllSessions } = require('./sessionRevocation');

test('revokes every active session by incrementing the session version', () => {
  const user = {
    sessionVersion: 4,
    activeSessions: [{ jti: 'session-a' }, { jti: 'session-b' }]
  };

  assert.equal(revokeAllSessions(user), user);
  assert.equal(user.sessionVersion, 5);
  assert.deepEqual(user.activeSessions, []);
});

test('starts a session version when none exists', () => {
  const user = { activeSessions: [{ jti: 'session-a' }] };

  revokeAllSessions(user);

  assert.equal(user.sessionVersion, 1);
  assert.deepEqual(user.activeSessions, []);
});
