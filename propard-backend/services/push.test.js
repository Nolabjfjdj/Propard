const test = require('node:test');
const assert = require('node:assert/strict');

const staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
process.env.STAFF_SUPPORT_IDS = staffId;

const allowlistPath = require.resolve('../utils/staffAllowlist');
delete require.cache[allowlistPath];
const User = require('../models/User');
delete require.cache[allowlistPath];
const pushPath = require.resolve('./push');
delete require.cache[pushPath];
const { canReceivePush, sendStaffHelpNotification } = require('./push');

test('push eligibility excludes accounts pending deletion', () => {
  assert.equal(canReceivePush(null), false);
  assert.equal(canReceivePush({ pendingDeletionAt: null }), true);
  assert.equal(canReceivePush({ pendingDeletionAt: undefined }), true);
  assert.equal(canReceivePush({ pendingDeletionAt: new Date() }), false);
});

test('staff help notifications recheck account deletion status before sending', async t => {
  const originalFind = User.find;
  const originalFindById = User.findById;
  let lookedUpId = null;
  let selectedFields = '';

  User.find = () => ({
    select: async () => [{
      _id: staffId,
      staffRole: 'support',
      staffNotificationPreferences: { support: true }
    }]
  });

  User.findById = id => ({
    select: async fields => {
      lookedUpId = id.toString();
      selectedFields = fields;
      return {
        pendingDeletionAt: new Date(),
        pushSubscriptions: [{
          endpoint: 'https://fcm.googleapis.com/test',
          keys: { p256dh: 'test', auth: 'test' }
        }],
        apnsTokens: []
      };
    }
  });

  t.after(() => {
    User.find = originalFind;
    User.findById = originalFindById;
  });

  await sendStaffHelpNotification({
    kind: 'support',
    username: 'test',
    requestId: 'request-1'
  });

  assert.equal(lookedUpId, staffId);
  assert.match(selectedFields, /pendingDeletionAt/);
});
