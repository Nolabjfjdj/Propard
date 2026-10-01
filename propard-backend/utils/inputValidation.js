const MAX_ENCRYPTED_MESSAGE_LENGTH = 20000;
const MAX_SIGNAL_DESCRIPTION_LENGTH = 100000;
const MAX_ICE_CANDIDATE_LENGTH = 20000;
const MAX_AVATAR_LENGTH = 1000000;
const MAX_DISPLAY_NAME_LENGTH = 32;
const MAX_GROUP_NAME_LENGTH = 50;

function isEncryptedMessagePayload(content) {
  if (
    typeof content !== 'string' ||
    content.length === 0 ||
    content.length > MAX_ENCRYPTED_MESSAGE_LENGTH
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(content);
    return !!payload &&
      payload.v === 1 &&
      typeof payload.iv === 'string' &&
      payload.iv.length > 0 &&
      payload.iv.length <= 100 &&
      typeof payload.ct === 'string' &&
      payload.ct.length > 0 &&
      payload.ct.length <= MAX_ENCRYPTED_MESSAGE_LENGTH;
  } catch {
    return false;
  }
}

function isSessionDescription(value, expectedType) {
  return !!value &&
    typeof value === 'object' &&
    value.type === expectedType &&
    typeof value.sdp === 'string' &&
    value.sdp.length > 0 &&
    value.sdp.length <= MAX_SIGNAL_DESCRIPTION_LENGTH;
}

function isIceCandidate(value) {
  if (!value || typeof value !== 'object') return false;

  if (value.candidate !== undefined) {
    if (
      typeof value.candidate !== 'string' ||
      value.candidate.length > MAX_ICE_CANDIDATE_LENGTH
    ) {
      return false;
    }
  }

  if (value.sdpMid !== undefined && typeof value.sdpMid !== 'string') {
    return false;
  }

  if (
    value.sdpMLineIndex !== undefined &&
    (!Number.isInteger(value.sdpMLineIndex) || value.sdpMLineIndex < 0)
  ) {
    return false;
  }

  return true;
}

module.exports = {
  MAX_ENCRYPTED_MESSAGE_LENGTH,
  MAX_SIGNAL_DESCRIPTION_LENGTH,
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_AVATAR_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  isEncryptedMessagePayload,
  isSessionDescription,
  isIceCandidate
};
