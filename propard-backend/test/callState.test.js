const test = require('node:test');
const assert = require('node:assert/strict');
const { createCallStateManager } = require('../services/callState');

test('ends a private call for both participants', () => {
  const events = [];
  const manager = createCallStateManager({
    groupCalls: new Map(),
    privateCalls: new Map([
      ['a:b', { callerId: 'a', receiverId: 'b' }]
    ]),
    emitToUser: (userId, event, payload) => {
      events.push({ userId, event, payload });
    }
  });

  assert.equal(manager.endPrivateCall('a', 'b'), true);
  assert.equal(events.filter(e => e.event === 'callEnded').length, 2);
});

test('removes a non-caller from a group call', () => {
  const events = [];
  const groupCalls = new Map([
    ['group', {
      callId: 'call',
      callerId: 'owner',
      members: new Set(['owner', 'member'])
    }]
  ]);

  const manager = createCallStateManager({
    groupCalls,
    privateCalls: new Map(),
    emitToUser: (userId, event, payload) => {
      events.push({ userId, event, payload });
    }
  });

  assert.equal(manager.removeUserFromGroupCall('group', 'member'), true);
  assert.equal(groupCalls.get('group').members.has('member'), false);
  assert.ok(events.some(e => e.userId === 'member' && e.event === 'groupCallEnded'));
});

test('ends the whole group call when its caller is removed', () => {
  const events = [];
  const groupCalls = new Map([
    ['group', {
      callId: 'call',
      callerId: 'owner',
      members: new Set(['owner', 'member'])
    }]
  ]);

  const manager = createCallStateManager({
    groupCalls,
    privateCalls: new Map(),
    emitToUser: (userId, event, payload) => {
      events.push({ userId, event, payload });
    }
  });

  assert.equal(manager.removeUserFromGroupCall('group', 'owner'), true);
  assert.equal(groupCalls.has('group'), false);
  assert.equal(events.filter(e => e.event === 'groupCallEnded').length, 2);
});
