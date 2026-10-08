import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from './api';


let nativeNotificationActionListener = null;
const NATIVE_PUSH_TOKEN_STORAGE_KEY = 'propard_native_push_token';

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

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function getWebServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Les notifications Push ne sont pas disponibles sur cet appareil.');
  }

  let registration;

  try {
    registration = await withTimeout(
      navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      }),
      10000,
      'Le Service Worker de Propard ne répond pas. Recharge la page puis réessaie.'
    );
  } catch (error) {
    if (error?.name === 'SecurityError') {
      throw new Error('Les notifications Push nécessitent une connexion HTTPS.');
    }

    throw error;
  }

  if (registration.active) {
    return registration;
  }

  return withTimeout(
    navigator.serviceWorker.ready,
    10000,
    'Le Service Worker de Propard n’a pas pu démarrer. Recharge la page puis réessaie.'
  );
}

function isIosBrowserOutsideStandaloneMode() {
  const userAgent = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIos) return false;

  const standalone =
    navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;

  return !standalone;
}

async function enableNativePushNotifications(token) {
  if (!token) {
    throw new Error('Session Propard invalide.');
  }

  const permission = await withTimeout(
    PushNotifications.requestPermissions(),
    15000,
    'Délai dépassé lors de la demande de permission de notification.'
  );

  if (permission.receive !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  const registrationPromise = new Promise((resolve, reject) => {
    let settled = false;
    let registrationListener;
    let registrationErrorListener;

    const cleanup = async () => {
      try {
        await registrationListener?.remove();
      } catch {}

      try {
        await registrationErrorListener?.remove();
      } catch {}
    };

    const finish = async value => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve(value);
    };

    const fail = async error => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(error);
    };

    Promise.all([
      PushNotifications.addListener('registration', tokenData => {
        finish(tokenData.value);
      }),
      PushNotifications.addListener('registrationError', error => {
        fail(new Error(error?.error || 'Impossible d’enregistrer les notifications.'));
      })
    ])
      .then(([registrationHandle, registrationErrorHandle]) => {
        registrationListener = registrationHandle;
        registrationErrorListener = registrationErrorHandle;
      })
      .catch(fail);
  });

  await withTimeout(
    PushNotifications.register(),
    15000,
    'Délai dépassé lors du démarrage des notifications.'
  );

  const nativeToken = await withTimeout(
    registrationPromise,
    15000,
    'Délai dépassé lors de l’enregistrement des notifications.'
  );

  await withTimeout(
    api.post(
      '/api/push/native/subscribe',
      {
        platform: Capacitor.getPlatform(),
        token: nativeToken
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 15000
      }
    ),
    15000,
    'Le serveur Propard ne répond pas pour l’enregistrement des notifications.'
  );

  try {
    localStorage.setItem(
      NATIVE_PUSH_TOKEN_STORAGE_KEY,
      nativeToken
    );
  } catch {}

  return true;
}

async function disableNativePushNotifications(token) {
  if (!token) return;

  let nativeToken = '';

  try {
    nativeToken =
      localStorage.getItem(
        NATIVE_PUSH_TOKEN_STORAGE_KEY
      ) || '';
  } catch {}

  try {
    if (nativeToken) {
      await withTimeout(
        api.delete('/api/push/native/subscribe', {
          data: {
            platform: Capacitor.getPlatform(),
            token: nativeToken
          },
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 10000
        }),
        10000,
        'Le serveur Propard ne répond pas pour la désactivation des notifications.'
      );
    }
  } finally {
    try {
      localStorage.removeItem(
        NATIVE_PUSH_TOKEN_STORAGE_KEY
      );
    } catch {}

    try {
      await withTimeout(
        PushNotifications.unregister(),
        10000,
        'Délai dépassé lors de la désactivation des notifications.'
      );
    } catch {}
  }
}

export async function enablePushNotifications(token) {
  if (Capacitor.isNativePlatform()) {
    return enableNativePushNotifications(token);
  }

  if (!token) {
    throw new Error('Session Propard invalide.');
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Les notifications Push ne sont pas disponibles sur cet appareil.');
  }

  if (!('Notification' in window)) {
    throw new Error('Les notifications ne sont pas disponibles dans ce navigateur.');
  }

  if (isIosBrowserOutsideStandaloneMode()) {
    throw new Error('Sur iPhone ou iPad, ajoute Propard à l’écran d’accueil puis ouvre-le depuis son icône pour activer les notifications.');
  }

  const permission = await withTimeout(
    Notification.requestPermission(),
    15000,
    'Délai dépassé lors de la demande de permission de notification.'
  );

  if (permission !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  const registration = await getWebServiceWorkerRegistration();

  let data;

  try {
    const response = await withTimeout(
      api.get('/api/push/public-key', {
        headers: {
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      }),
      15000,
      'Le serveur Propard ne répond pas pour la configuration des notifications.'
    );

    data = response.data;
  } catch (error) {
    if (error?.response?.status === 503) {
      throw new Error('Les notifications Push ne sont pas configurées sur le serveur Propard.');
    }

    throw error;
  }

  if (!data?.publicKey) {
    throw new Error('Le serveur de notifications n’est pas configuré.');
  }

  let subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    10000,
    'Impossible de vérifier l’abonnement aux notifications.'
  );

  if (!subscription) {
    subscription = await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      }),
      15000,
      'Le navigateur n’a pas pu créer l’abonnement aux notifications.'
    );
  }

  await withTimeout(
    api.post(
      '/api/push/subscribe',
      { subscription: subscription.toJSON() },
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 15000
      }
    ),
    15000,
    'Le serveur Propard ne répond pas pour l’enregistrement des notifications.'
  );

  return true;
}

export async function disablePushNotifications(token) {
  if (Capacitor.isNativePlatform()) {
    return disableNativePushNotifications(token);
  }

  if (!token || !('serviceWorker' in navigator)) return;

  const registration = await getWebServiceWorkerRegistration();
  const subscription = await withTimeout(
    registration.pushManager?.getSubscription(),
    10000,
    'Impossible de vérifier l’abonnement aux notifications.'
  );

  if (!subscription) return;

  try {
    await withTimeout(
      api.delete('/api/push/subscribe', {
        data: { endpoint: subscription.endpoint },
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 10000
      }),
      10000,
      'Le serveur Propard ne répond pas pour la désactivation des notifications.'
    );
  } finally {
    await withTimeout(
      subscription.unsubscribe(),
      10000,
      'Le navigateur n’a pas pu désactiver les notifications.'
    ).catch(() => {});
  }
}

export async function isPushEnabled() {
  if (Capacitor.isNativePlatform()) {
    try {
      const permissions = await withTimeout(
        PushNotifications.checkPermissions(),
        5000,
        'Délai dépassé lors de la vérification des notifications.'
      );

      return permissions.receive === 'granted';
    } catch {
      return false;
    }
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await getWebServiceWorkerRegistration();
    const subscription = await withTimeout(
      registration.pushManager?.getSubscription(),
      5000,
      'Délai dépassé lors de la vérification des notifications.'
    );

    return Boolean(subscription);
  } catch {
    return false;
  }
}
