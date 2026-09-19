const webpush = require('web-push');
const User = require('../models/User');
const { configured: apnsConfigured, sendApnsNotification } = require('./apns');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:support@propard.site';

const pushConfigured = Boolean(publicKey && privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('🔔 Web Push désactivé : VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquantes.');
}

function getPublicKey() {
  return publicKey || null;
}

async function sendWebPush(user, payload) {
  if (!pushConfigured || !user?.pushSubscriptions?.length) return;

  const body = JSON.stringify({
    title: payload.title || 'Propard',
    body: payload.body || 'Nouvelle notification',
    icon: '/propard.png',
    badge: '/propard.png',
    url: payload.url || '/',
    tag: payload.tag || 'propard-message',
    data: payload.data || {}
  });

  const staleEndpoints = [];

  await Promise.all(
    user.pushSubscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          body,
          { TTL: 60 * 60 }
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          staleEndpoints.push(subscription.endpoint);
          return;
        }

        console.error('🔔 Web Push error:', error.statusCode || error.message);
      }
    })
  );

  if (staleEndpoints.length) {
    await User.updateOne(
      { _id: user._id },
      {
        $pull: {
          pushSubscriptions: {
            endpoint: { $in: staleEndpoints }
          }
        }
      }
    );
  }
}

async function sendApnsPush(user, payload) {
  if (!apnsConfigured || !user?.apnsTokens?.length) return;

  const staleTokens = [];

  await Promise.all(
    user.apnsTokens.map(async subscription => {
      try {
        const result = await sendApnsNotification(subscription.token, payload);

        if (!result.ok) {
          if (result.status === 400 || result.status === 410 || result.reason === 'BadDeviceToken' || result.reason === 'Unregistered') {
            staleTokens.push(subscription.token);
            return;
          }

          console.error('🔔 APNs error:', result.status || result.reason);
        }
      } catch (error) {
        console.error('🔔 APNs request error:', error.message);
      }
    })
  );

  if (staleTokens.length) {
    await User.updateOne(
      { _id: user._id },
      {
        $pull: {
          apnsTokens: {
            token: { $in: staleTokens }
          }
        }
      }
    );
  }
}

async function sendPushNotification(userId, payload) {
  if (!userId) return;

  const user = await User.findById(userId).select('pushSubscriptions apnsTokens');
  if (!user) return;

  await Promise.all([
    sendWebPush(user, payload),
    sendApnsPush(user, payload)
  ]);
}

module.exports = {
  getPublicKey,
  sendPushNotification
};
