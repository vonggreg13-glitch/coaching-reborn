const CACHE = 'gvc-v8';

// Ne met RIEN en cache — toujours réseau
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Supprime TOUS les anciens caches
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Toujours le réseau, jamais le cache
  e.respondWith(fetch(e.request));
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'GREGVONG COACHING', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(wins => {
    const existing = wins.find(w => w.url.includes(url));
    if (existing) { existing.focus(); return; }
    clients.openWindow(url);
  }));
});
