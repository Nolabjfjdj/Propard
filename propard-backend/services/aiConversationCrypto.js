const crypto = require('crypto');

const PREFIX = 'enc:v1:';

const getKey = () => {
  const raw = process.env.PROPARD_AI_ENCRYPTION_KEY;
  if (!raw) throw new Error('PROPARD_AI_ENCRYPTION_KEY is required to access Propard AI conversations.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PROPARD_AI_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
};

const isEncrypted = value => typeof value === 'string' && value.startsWith(PREFIX);

const encryptText = value => {
  if (typeof value !== 'string' || isEncrypted(value)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + encrypted.toString('base64');
};

const decryptText = value => {
  if (typeof value !== 'string' || !isEncrypted(value)) return value;
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted Propard AI conversation value.');
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted Propard AI conversation metadata.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
};

module.exports = { encryptText, decryptText, isEncrypted };
