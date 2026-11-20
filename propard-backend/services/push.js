const webpush = require('web-push');
const User = require('../models/User');
const { configured: apnsConfigured, sendApnsNotification } = require('./apns');
const { isAllowedPushEndpoint } = require('./pushEndpoint');
const { effectiveStaffRole } = require('../utils/staffAllowlist');

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
  if (!pushConfigured || !user?.pushSubscriptions?.length) return 0;

  let delivered = 0;

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
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        staleEndpoints.push(subscription.endpoint);
        console.warn('🔔 Web Push ignoré : endpoint non autorisé.');
        return;
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          body,
          { TTL: 60 * 60 }
        );
        delivered += 1;
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

  return delivered;
}

async function sendApnsPush(user, payload) {
  if (!apnsConfigured || !user?.apnsTokens?.length) return 0;

  let delivered = 0;

  const staleTokens = [];

  await Promise.all(
    user.apnsTokens.map(async subscription => {
      try {
        const result = await sendApnsNotification(subscription.token, payload);

        if (result.ok) {
          delivered += 1;
        } else {
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

  return delivered;
}

function canReceivePush(user) {
  return Boolean(user && !user.pendingDeletionAt);
}

async function sendPushNotification(userId, payload) {
  if (!userId) return { delivered: 0 };

  const user = await User.findById(userId).select('pushSubscriptions apnsTokens pendingDeletionAt');
  if (!canReceivePush(user)) return { delivered: 0 };

  const results = await Promise.all([
    sendWebPush(user, payload),
    sendApnsPush(user, payload)
  ]);
  return { delivered: results.reduce((total, count) => total + count, 0) };
}

async function sendStaffHelpNotification({ kind, username, requestId }) {
  if (!['password_reset', 'support'].includes(kind)) return;

  const preferenceKey = kind === 'password_reset' ? 'passwordReset' : 'support';
  const staffRoles = ['support', 'junior_moderator', 'moderator', 'senior_moderator', 'admin', 'owner'];
  const staffUsers = await User.find({
    staffRole: { $in: staffRoles },
    [`staffNotificationPreferences.${preferenceKey}`]: { $ne: false }
  }).select('_id staffRole staffNotificationPreferences');
  const authorizedStaffUsers = staffUsers.filter(
    user => effectiveStaffRole(user._id, user.staffRole) !== 'user'
  );

  const requestLabel = kind === 'password_reset' ? 'Mot de passe oublié' : 'Support';
  const payload = {
    title: 'Nouvelle demande Propard',
    body: `${requestLabel} · @${username}`,
    url: '/staff',
    tag: `account-help-${String(requestId)}`,
    data: {
      type: 'account-help',
      kind,
      requestId: String(requestId),
      url: '/staff'
    }
  };

  await Promise.all(authorizedStaffUsers.map(async user => {
    try {
      await sendPushNotification(user._id, payload);
    } catch (error) {
      console.error('🔔 Account-help push error:', error.statusCode || error.message);
    }
  }));
}

module.exports = {
  getPublicKey,
  sendPushNotification,
  sendStaffHelpNotification,
  canReceivePush
};
