const crypto = require('crypto');

function payload(announcement) {
  return JSON.stringify([
    'propard-announcement-v1',
    String(announcement._id),
    announcement.title,
    announcement.message,
    new Date(announcement.createdAt).toISOString()
  ]);
}

function signAnnouncement(announcement) {
  const secret = process.env.ANNOUNCEMENT_HMAC_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ANNOUNCEMENT_HMAC_SECRET must contain at least 32 bytes');
  }
  return crypto.createHmac('sha256', secret).update(payload(announcement)).digest('hex');
}

function verifyAnnouncement(announcement) {
  try {
    if (!announcement || typeof announcement.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(announcement.signature)) {
      return false;
    }
    const expected = Buffer.from(signAnnouncement(announcement), 'hex');
    const given = Buffer.from(announcement.signature, 'hex');
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

module.exports = { signAnnouncement, verifyAnnouncement };
