const CACHE_NAME = 'propard-offline-v3';

const APP_SHELL = [
  '/',
  '/index.html',
  '/propard.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  /*
   * On ne met JAMAIS les API en cache.
   *
   * C'est volontaire : App.jsx doit pouvoir détecter que le
   * backend est réellement inaccessible.
   */
  if (
    url.origin === self.location.origin &&
    (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/socket.io/')
    )
  ) {
    return;
  }

  /*
   * Navigation vers absolument n'importe quelle URL :
   *
   * /chat/123
   * /profile/123
   * /privacy
   * /terms
   * /help
   * /truc/qui/nexiste/pas
   *
   * Si Internet fonctionne -> vraie page.
   * Si Internet est coupé -> index.html depuis le cache.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (
            response &&
            response.ok &&
            response.type === 'basic'
          ) {
            const copy = response.clone();

            caches
              .open(CACHE_NAME)
              .then(cache => {
                cache.put('/index.html', copy);
              })
              .catch(() => {});
          }

          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached => {
            return (
              cached ||
              new Response(
                `
                <!doctype html>
                <html lang="fr">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1">
                    <title>Propard — Hors ligne</title>
                  </head>
                  <body>
                    <div id="root"></div>
                  </body>
                </html>
                `,
                {
                  headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                  }
                }
              )
            );
          })
        )
    );

    return;
  }

  /*
   * Pour les fichiers frontend :
   * cache-first, avec récupération réseau si absent.
   */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          return cached;
        }

        return fetch(request)
          .then(response => {
            if (
              response &&
              response.ok &&
              response.type === 'basic'
            ) {
              const copy = response.clone();

              caches
                .open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, copy);
                })
                .catch(() => {});
            }

            return response;
          })
          .catch(() => {
            return new Response('', {
              status: 503,
              statusText: 'Offline'
            });
          });
      })
    );
  }
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};

    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = {};
    }

    const notificationData = data.data || {};

    /*
     * Une notification Push ne doit être masquée que si la conversation
     * concernée est réellement ouverte dans une fenêtre Propard visible.
     *
     * Avant, on masquait la notification dès qu'une fenêtre Propard était
     * visible. Cela supprimait donc aussi les notifications provenant
     * d'autres conversations/groupes.
     */
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const normalize = value =>
      value === undefined || value === null
        ? ''
        : String(value);

    const senderId = normalize(notificationData.senderId);
    const groupId = normalize(notificationData.groupId);
    const type = normalize(notificationData.type);

    const isSameOpenConversation = clients.some(client => {
      if (client.visibilityState !== 'visible') return false;

      let url;

      try {
        url = new URL(client.url);
      } catch {
        return false;
      }

      const parts = url.pathname
        .split('/')
        .filter(Boolean);

      if (type === 'private-message' && senderId) {
        return parts.length === 2 &&
          parts[0] === 'chat' &&
          parts[1] === senderId;
      }

      if (type === 'group-message' && groupId) {
        return parts.length === 2 &&
          parts[0] === 'group' &&
          parts[1] === groupId;
      }

      return false;
    });

    if (isSameOpenConversation) return;

    const title = data.title || 'Propard';
    const options = {
      body: data.body || 'Nouvelle notification',
      icon: data.icon || '/propard.png',
      badge: data.badge || '/propard.png',
      tag: data.tag || 'propard-message',
      renotify: true,
      data: {
        url: data.url || '/',
        ...notificationData
      }
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const notificationData =
      event.notification.data || {};

    let targetPath =
      notificationData.url || '';

    if (
      (!targetPath || targetPath === '/') &&
      notificationData.type === 'private-message' &&
      notificationData.senderId
    ) {
      targetPath =
        `/chat/${notificationData.senderId}`;
    }

    if (
      (!targetPath || targetPath === '/') &&
      notificationData.type === 'group-message' &&
      notificationData.groupId
    ) {
      targetPath =
        `/group/${notificationData.groupId}`;
    }

    const targetUrl = new URL(
      targetPath || '/',
      self.location.origin
    ).href;

    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
      }

      if ('navigate' in client && client.url !== targetUrl) {
        await client.navigate(targetUrl).catch(() => {});
      }

      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});     const notificationData =
       event.notification.data || {};

     let targetPath =
       notificationData.url || '';

     if (
       (!targetPath || targetPath === '/') &&
       notificationData.type === 'private-message' &&
       notificationData.senderId
     ) {
       targetPath =
         `/chat/${notificationData.senderId}`;
     }

     if (
       (!targetPath || targetPath === '/') &&
       notificationData.type === 'group-message' &&
       notificationData.groupId
     ) {
       targetPath =
         `/group/${notificationData.groupId}`;
     }

     const targetUrl = new URL(
       targetPath || '/',
       self.location.origin
     ).href;


