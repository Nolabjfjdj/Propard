const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedPushEndpoint } = require('../services/pushEndpoint');

test('accepts known browser push service endpoints', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true);
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true);
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/example'), true);
  assert.equal(isAllowedPushEndpoint('https://wns2-example.notify.windows.com/w/?token=example'), true);
});

test('rejects endpoints that could target untrusted or local destinations', () => {
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/example'), false);
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1/'), false);
  assert.equal(isAllowedPushEndpoint('https://localhost/'), false);
  assert.equal(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isAllowedPushEndpoint('https://attacker.example/push'), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.example/push'), false);
  assert.equal(isAllowedPushEndpoint('https://user@fcm.googleapis.com/push'), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/push'), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/push#fragment'), false);
});

test('rejects malformed and oversized endpoints', () => {
  assert.equal(isAllowedPushEndpoint('not-a-url'), false);
  assert.equal(isAllowedPushEndpoint(''), false);
  assert.equal(isAllowedPushEndpoint('x'.repeat(2049)), false);
  assert.equal(isAllowedPushEndpoint(null), false);
});
