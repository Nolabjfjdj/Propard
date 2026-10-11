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

test('reports private call timestamps and duration from the answer time', () => {
  const finished = [];
  const call = {
    callerId: 'a',
    receiverId: 'b',
    startedAt: 1000,
    answered: true,
    answeredAt: 2500
  };
  const manager = createCallStateManager({
    groupCalls: new Map(),
    privateCalls: new Map([['a:b', call]]),
    emitToUser: () => {},
    onCallFinished: event => finished.push(event)
  });
  const originalNow = Date.now;
  Date.now = () => 6500;

  try {
    assert.equal(manager.endPrivateCall('a', 'b'), true);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(finished.length, 1);
  assert.equal(finished[0].type, 'private');
  assert.equal(finished[0].status, 'ended');
  assert.equal(finished[0].durationSeconds, 4);
  assert.equal(finished[0].call.startedAt, 1000);
  assert.equal(finished[0].call.answeredAt, 2500);
});

test('reports missed private calls with zero duration', () => {
  const finished = [];
  const manager = createCallStateManager({
    groupCalls: new Map(),
    privateCalls: new Map([[
      'a:b',
      { callerId: 'a', receiverId: 'b', startedAt: 1000, answered: false }
    ]]),
    emitToUser: () => {},
    onCallFinished: event => finished.push(event)
  });

  assert.equal(manager.endPrivateCall('a', 'b'), true);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, 'missed');
  assert.equal(finished[0].durationSeconds, 0);
});

test('reports group call timestamps and duration from the first answer', () => {
  const finished = [];
  const call = {
    callId: 'call',
    groupId: 'group',
    callerId: 'owner',
    members: new Set(['owner', 'member']),
    startedAt: 1000,
    everAnswered: true,
    answeredAt: 3000
  };
  const groupCalls = new Map([['group', call]]);
  const manager = createCallStateManager({
    groupCalls,
    privateCalls: new Map(),
    emitToUser: () => {},
    onCallFinished: event => finished.push(event)
  });
  const originalNow = Date.now;
  Date.now = () => 8000;

  try {
    assert.equal(manager.endGroupCall('group'), true);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(finished.length, 1);
  assert.equal(finished[0].type, 'group');
  assert.equal(finished[0].status, 'ended');
  assert.equal(finished[0].durationSeconds, 5);
  assert.equal(finished[0].call.startedAt, 1000);
  assert.equal(finished[0].call.answeredAt, 3000);
});
