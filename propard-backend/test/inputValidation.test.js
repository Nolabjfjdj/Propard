const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_ENCRYPTED_MESSAGE_LENGTH,
  isEncryptedMessagePayload,
  isSessionDescription,
  isIceCandidate
} = require('../utils/inputValidation');

test('accepts a valid encrypted message payload', () => {
  const payload = JSON.stringify({
    v: 1,
    iv: 'a'.repeat(16),
    ct: 'b'.repeat(64)
  });

  assert.equal(isEncryptedMessagePayload(payload), true);
});

test('rejects oversized encrypted message payloads', () => {
  const payload = JSON.stringify({
    v: 1,
    iv: 'a'.repeat(16),
    ct: 'b'.repeat(MAX_ENCRYPTED_MESSAGE_LENGTH)
  });

  assert.equal(isEncryptedMessagePayload(payload), false);
});

test('validates WebRTC session descriptions', () => {
  assert.equal(
    isSessionDescription({ type: 'offer', sdp: 'v=0' }, 'offer'),
    true
  );
  assert.equal(
    isSessionDescription({ type: 'answer', sdp: 'v=0' }, 'offer'),
    false
  );
});

test('validates WebRTC ICE candidates', () => {
  assert.equal(
    isIceCandidate({ candidate: 'candidate:1', sdpMLineIndex: 0 }),
    true
  );
  assert.equal(
    isIceCandidate({ candidate: 'a'.repeat(20001) }),
    false
  );
});
