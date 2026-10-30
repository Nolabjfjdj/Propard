const test = require('node:test');
const assert = require('node:assert/strict');
const { createSocketRateLimiter } = require('../services/socketRateLimit');

test('limits an event for one user during its time window', () => {
  const limiter = createSocketRateLimiter();

  assert.equal(limiter.allow('user-a', 'sendMessage', 2, 1000, 100), true);
  assert.equal(limiter.allow('user-a', 'sendMessage', 2, 1000, 200), true);
  assert.equal(limiter.allow('user-a', 'sendMessage', 2, 1000, 300), false);
  assert.equal(limiter.allow('user-a', 'sendMessage', 2, 1000, 1100), true);
});

test('keeps users and event types independent', () => {
  const limiter = createSocketRateLimiter();

  assert.equal(limiter.allow('user-a', 'sendMessage', 1, 1000, 100), true);
  assert.equal(limiter.allow('user-a', 'sendGroupMessage', 1, 1000, 100), true);
  assert.equal(limiter.allow('user-b', 'sendMessage', 1, 1000, 100), true);
});

test('cleans expired buckets', () => {
  const limiter = createSocketRateLimiter();

  limiter.allow('user-a', 'sendMessage', 1, 1000, 100);
  limiter.cleanup(1100);

  assert.equal(limiter.allow('user-a', 'sendMessage', 1, 1000, 1100), true);
});
