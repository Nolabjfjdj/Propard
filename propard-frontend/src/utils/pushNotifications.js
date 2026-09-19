import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from './api';


let nativeNotificationActionListener = null;

export async function setupNotificationNavigation() {
  if (!Capacitor.isNativePlatform()) return;
  if (nativeNotificationActionListener) return;

  nativeNotificationActionListener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    action => {
      const data =
        action?.notification?.data || {};

      let target =
        typeof data.url === 'string'
          ? data.url
          : '';

      if (
        (!target || target === '/') &&
        data.type === 'private-message' &&
        data.senderId
      ) {
        target =
          `/chat/${data.senderId}`;
      } else if (
        (!target || target === '/') &&
        data.type === 'group-message' &&
        data.groupId
      ) {
        target =
          `/group/${data.groupId}`;
      }

      if (
        typeof target !== 'string' ||
        !target.startsWith('/')
      ) {
        target = '/';
      }

      const currentPath =
        `${window.location.pathname}${window.location.search}`;

      if (currentPath === target) {
        window.dispatchEvent(
          new PopStateEvent('popstate')
        );
        return;
      }

      window.history.pushState(
        {},
        '',
        target
      );

      window.dispatchEvent(
        new PopStateEvent('popstate')
      );
    }
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function enableNativePushNotifications(token) {
  if (!token) {
    throw new Error('Session Propard invalide.');
  }

  const permission = await PushNotifications.requestPermissions();

  if (permission.receive !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  await PushNotifications.addListener('registrationError', error => {
    console.error('Propard APNs registration error:', error);
  });

  const registrationPromise = new Promise((resolve, reject) => {
    let settled = false;

    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    PushNotifications.addListener('registration', tokenData => {
      finish(tokenData.value);
    }).catch(fail);

    PushNotifications.addListener('registrationError', error => {
      fail(new Error(error?.error || 'Impossible d’enregistrer les notifications.'));
    }).catch(fail);
  });

  await PushNotifications.register();

  const nativeToken = await Promise.race([
    registrationPromise,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error('Délai dépassé lors de l’enregistrement des notifications.')),
        15000
      );
    })
  ]);

  await api.post(
    '/api/push/native/subscribe',
    {
      platform: Capacitor.getPlatform(),
      token: nativeToken
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return true;
}

async function disableNativePushNotifications(token) {
  if (!token) return;

  try {
    await PushNotifications.unregister();
  } finally {
    await api.delete('/api/push/native/subscribe', {
      data: {
        platform: Capacitor.getPlatform()
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }
}

export async function enablePushNotifications(token) {
  if (Capacitor.isNativePlatform()) {
    return enableNativePushNotifications(token);
  }

  if (!token || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Les notifications Push ne sont pas disponibles sur cet appareil.');
  }

  if (!('Notification' in window)) {
    throw new Error('Les notifications ne sont pas disponibles dans ce navigateur.');
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  const registration = await navigator.serviceWorker.ready;
  const { data } = await api.get('/api/push/public-key');

  if (!data?.publicKey) {
    throw new Error('Le serveur de notifications n’est pas configuré.');
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    });
  }

  await api.post(
    '/api/push/subscribe',
    { subscription: subscription.toJSON() },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return true;
}

export async function disablePushNotifications(token) {
  if (Capacitor.isNativePlatform()) {
    return disableNativePushNotifications(token);
  }

  if (!token || !('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  try {
    await api.delete('/api/push/subscribe', {
      data: { endpoint: subscription.endpoint },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } finally {
    await subscription.unsubscribe().catch(() => {});
  }
}

export async function isPushEnabled() {
  if (Capacitor.isNativePlatform()) {
    const permissions = await PushNotifications.checkPermissions();
    return permissions.receive === 'granted';
  }

  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager?.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}
