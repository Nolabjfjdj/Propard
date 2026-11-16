const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PROPARD_AI_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const { encryptText, decryptText, isEncrypted } = require('./aiConversationCrypto');

test('encrypts plaintext beginning with the ciphertext prefix', () => {
  const plaintext = 'enc:v1:ceci est un texte utilisateur';
  const encrypted = encryptText(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(isEncrypted(encrypted), true);
  assert.equal(decryptText(encrypted), plaintext);
});

test('does not classify malformed prefix text as ciphertext', () => {
  const plaintext = 'enc:v1:not-a-ciphertext';
  assert.equal(isEncrypted(plaintext), false);
  const encrypted = encryptText(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptText(encrypted), plaintext);
});

test('rejects ciphertext modified after encryption', () => {
  const encrypted = encryptText('private conversation');
  const modified = encrypted.slice(0, -1) + (encrypted.endsWith('A') ? 'B' : 'A');
  assert.equal(isEncrypted(modified), false);
  assert.throws(() => decryptText(modified));
});
