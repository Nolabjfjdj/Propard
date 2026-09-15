const webpush = require('web-push');
const User = require('../models/User');

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

async function sendPushNotification(userId, payload) {
  if (!pushConfigured || !userId) return;

  const user = await User.findById(userId).select('pushSubscriptions');
  if (!user?.pushSubscriptions?.length) return;

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
          {
            TTL: 60 * 60
          }
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
      { _id: userId },
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

module.exports = {
  getPublicKey,
  sendPushNotification
};
