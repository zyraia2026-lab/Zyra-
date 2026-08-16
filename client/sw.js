// ══ ZYRA SERVICE WORKER v5.4 ══
const CACHE_NAME = 'zyra-v5.4';
const STATIC_ASSETS = [
  '/', '/index.html', '/styles.css', '/manifest.json',
  '/Imagenes/1000154669.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS))
      .catch(err => console.warn('SW install cache error:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => {
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Solo interceptar requests del mismo origen — dejar pasar todo lo externo (YouTube, Kaspersky, etc.)
  if (url.origin !== self.location.origin) return;

  // API calls — siempre red, nunca caché
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // App shell (HTML/CSS): la app entera vive en index.html + styles.css, así que
  // servir una copia vieja en caché mientras hay conexión es lo que dejaba a
  // usuarios reales corriendo versiones de días atrás sin saberlo (sin ver los
  // arreglos ya subidos). Red primero siempre que haya conexión; caché solo
  // como respaldo si está offline.
  const isAppShell = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/styles.css';
  if (isAppShell) {
    e.respondWith(
      fetch(request).then(res => {
        // clone() debe llamarse aqui, de forma sincrona, apenas llega la respuesta —
        // si se llama dentro del .then() de caches.open() (async), para cuando corre
        // el navegador ya empezo a consumir el body de "res" para pintar la pagina,
        // y clone() truena con "Response body is already used".
        if (res.ok) {
          const resToCache = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, resToCache));
        }
        return res;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Resto de assets estáticos (imágenes, manifest) — casi no cambian, stale-while-revalidate está bien.
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const network = fetch(request).then(res => {
          if (res.ok && request.method === 'GET') {
            cache.put(request, res.clone());
          }
          return res;
        }).catch(() => null);

        // Si hay caché, devolver inmediatamente; si no, esperar red con fallback a /index.html
        if (cached) return cached;
        return network.then(res => res || caches.match('/index.html'));
      })
    )
  );
});

// ── Push notifications ──
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch(_) {}
  const ICON = '/Imagenes/1000154669.png';
  e.waitUntil(
    self.registration.showNotification(data.title || 'Zyra ✦', {
      body:    data.body  || 'Tienes un mensaje de Zyra',
      icon:    data.icon  || ICON,
      badge:   data.badge || ICON,
      tag:     data.tag   || ('zyra-' + Date.now()),
      vibrate: [100, 50, 100],
      data:    { url: data.data?.url || data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
