import api from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export async function enablePushNotifications(token) {
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
