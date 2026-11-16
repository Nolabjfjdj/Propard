const crypto = require('crypto');

const PREFIX = 'enc:v1:';

const getKey = () => {
  const raw = process.env.PROPARD_AI_ENCRYPTION_KEY;
  if (!raw) throw new Error('PROPARD_AI_ENCRYPTION_KEY is required to access Propard AI conversations.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PROPARD_AI_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
};

const decryptPayload = value => {
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted Propard AI conversation value.');
  const [ivHex, tagHex, encrypted] = parts;
  if (!/^[a-f0-9]{24}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(tagHex) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encrypted)) {
    throw new Error('Invalid encrypted Propard AI conversation metadata.');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
};

const isEncrypted = value => {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return false;
  try {
    decryptPayload(value);
    return true;
  } catch {
    return false;
  }
};

const encryptText = value => {
  if (typeof value !== 'string' || isEncrypted(value)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + encrypted.toString('base64');
};

const decryptText = value => {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  return decryptPayload(value);
};

module.exports = { encryptText, decryptText, isEncrypted };
