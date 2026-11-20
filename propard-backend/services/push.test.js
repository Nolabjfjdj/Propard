const test = require('node:test');
const assert = require('node:assert/strict');
const { canReceivePush, getAuthorizedStaffUsers } = require('./push');

test('push eligibility excludes accounts pending deletion', () => {
  assert.equal(canReceivePush(null), false);
  assert.equal(canReceivePush({ pendingDeletionAt: null }), true);
  assert.equal(canReceivePush({ pendingDeletionAt: undefined }), true);
  assert.equal(canReceivePush({ pendingDeletionAt: new Date() }), false);
});

test('staff help recipients exclude accounts pending deletion and non-staff users', () => {
  const users = [
    { _id: 'active-staff', staffRole: 'support', pendingDeletionAt: null },
    { _id: 'deleting-staff', staffRole: 'support', pendingDeletionAt: new Date() },
    { _id: 'regular-user', staffRole: 'user', pendingDeletionAt: null }
  ];
  const roles = new Map([
    ['active-staff', 'support'],
    ['deleting-staff', 'support'],
    ['regular-user', 'user']
  ]);
  const authorized = getAuthorizedStaffUsers(users, userId => roles.get(userId));
  assert.deepEqual(authorized.map(user => user._id), ['active-staff']);
});
