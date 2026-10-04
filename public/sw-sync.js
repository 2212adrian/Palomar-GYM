// public/sw-sync.js
// Background Sync & ServiceWorker Handler for Supabase Offline Operations

self.addEventListener('sync', (event) => {
  if (
    event.tag === 'supabase-background-sync' ||
    event.tag === 'supabase-offline-sync'
  ) {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'TRIGGER_OFFLINE_SYNC',
              tag: event.tag,
              timestamp: Date.now(),
            });
          });
        })
        .catch((err) => {
          console.warn('[SW Background Sync] Error notifying clients:', err);
        })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'supabase-periodic-sync') {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: 'window' })
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'TRIGGER_OFFLINE_SYNC',
              tag: event.tag,
              timestamp: Date.now(),
            });
          });
        })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'QUEUE_TRANSACTION') {
    if (self.registration && 'sync' in self.registration) {
      self.registration.sync
        .register('supabase-background-sync')
        .catch(() => {});
    }
  }
});
