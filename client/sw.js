// ══ ZYRA SERVICE WORKER v2.0 ══
const CACHE_NAME = 'zyra-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap'
];

// Instalar y cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http') || url.includes('fonts')));
    }).catch(err => console.warn('Cache install error:', err))
  );
  self.skipWaiting();
});

// Limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Estrategia: Network first para API, Cache first para assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API calls: siempre red (no cachear)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets estáticos: cache first, red como fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback offline para páginas HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Push notifications (para recordatorios)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Zyra', {
      body: data.body || 'Tienes un mensaje de Zyra',
      icon: '/Imagenes/1000154669.png',
      badge: '/Imagenes/1000154669.png',
      tag: 'zyra-notification',
      requireInteraction: false,
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
