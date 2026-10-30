const ALLOWED_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
]);

const ALLOWED_PUSH_SUFFIXES = [
  '.push.services.mozilla.com',
  '.notify.windows.com'
];

function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
    return false;
  }

  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();

    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password ||
      url.hash ||
      !hostname ||
      hostname.endsWith('.')
    ) {
      return false;
    }

    if (ALLOWED_PUSH_HOSTS.has(hostname)) {
      return true;
    }

    return ALLOWED_PUSH_SUFFIXES.some(suffix => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

module.exports = {
  isAllowedPushEndpoint
};
