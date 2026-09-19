const http2 = require('http2');
const jwt = require('jsonwebtoken');

const keyId = process.env.APNS_KEY_ID;
const teamId = process.env.APNS_TEAM_ID;
const bundleId = process.env.APNS_BUNDLE_ID || 'site.propard';
const privateKey = process.env.APNS_PRIVATE_KEY_BASE64
  ? Buffer.from(process.env.APNS_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  : process.env.APNS_PRIVATE_KEY;
const environment = process.env.APNS_ENVIRONMENT || 'development';

const configured = Boolean(keyId && teamId && privateKey);

if (!configured) {
  console.warn('🔔 APNs désactivé : APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY manquants.');
}

function getApnsHost() {
  return environment === 'development'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com';
}

function createProviderToken() {
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    expiresIn: '50m'
  });
}

async function sendApnsNotification(deviceToken, payload) {
  if (!configured || !deviceToken) return { ok: false, reason: 'not-configured' };

  const client = http2.connect(`https://${getApnsHost()}`);
  const providerToken = createProviderToken();

  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.title || 'Propard',
        body: payload.body || 'Nouvelle notification'
      },
      sound: 'default',
      badge: Number.isFinite(payload.badge) ? payload.badge : undefined
    },
    ...payload.data
  });

  return new Promise((resolve, reject) => {
    let responseBody = '';

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      ':authority': getApnsHost(),
      'authorization': `bearer ${providerToken}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json'
    });

    request.setEncoding('utf8');
    request.on('data', chunk => {
      responseBody += chunk;
    });

    request.on('response', headers => {
      const status = Number(headers[':status']);

      request.on('end', () => {
        client.close();

        if (status >= 200 && status < 300) {
          resolve({ ok: true });
          return;
        }

        let error = null;
        try {
          error = responseBody ? JSON.parse(responseBody) : null;
        } catch {
          error = null;
        }

        resolve({
          ok: false,
          status,
          reason: error?.reason || 'APNs error'
        });
      });
    });

    request.on('error', error => {
      client.close();
      reject(error);
    });

    request.end(body);
  });
}

module.exports = {
  configured,
  sendApnsNotification
};
