const CACHE_NAME = 'propard-offline-v1';

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