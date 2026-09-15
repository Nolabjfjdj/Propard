const CACHE_NAME = 'propard-offline-v2';

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
      data = {
        title: 'Propard',
        body: 'Nouvelle notification'
      };
    }

    // On regarde les fenêtres Propard actuellement visibles.
    // Pour un message privé ou de groupe, on ne supprime la notification
    // que si la conversation concernée est réellement ouverte.
    // Ainsi, un message reçu dans une autre conversation continue de
    // générer une notification même si Propard est affiché à l'écran.
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const notificationType = data.data?.type;
    const conversationId =
      notificationType === 'private-message'
        ? data.data?.senderId?.toString()
        : notificationType === 'group-message'
          ? data.data?.groupId?.toString()
          : null;

    const hasMatchingVisibleConversation = clients.some(client => {
      if (client.visibilityState !== 'visible') {
        return false;
      }

      // Les anciennes notifications sans type gardent le comportement
      // précédent : pas de doublon lorsqu'une fenêtre Propard est visible.
      if (!notificationType || !conversationId) {
        return true;
      }

      try {
        const url = new URL(client.url);
        const parts = url.pathname.split('/').filter(Boolean);

        if (notificationType === 'private-message') {
          return (
            parts.length === 2 &&
            parts[0] === 'chat' &&
            parts[1] === conversationId
          );
        }

        if (notificationType === 'group-message') {
          return (
            parts.length === 2 &&
            parts[0] === 'group' &&
            parts[1] === conversationId
          );
        }
      } catch {
        return false;
      }

      return false;
    });

    if (hasMatchingVisibleConversation) return;

    const title = data.title || 'Propard';
    const options = {
      body: data.body || 'Nouvelle notification',
      icon: data.icon || '/propard.png',
      badge: data.badge || '/propard.png',
      tag: data.tag || 'propard-message',
      renotify: true,
      data: {
        url: data.url || '/',
        ...(data.data || {})
      }
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl = new URL(
      event.notification.data?.url || '/',
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
});
