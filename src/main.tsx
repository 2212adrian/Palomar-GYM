// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Register Service Worker only in production; unregister & clean in dev
import { registerSW } from 'virtual:pwa-register';

if (import.meta.env.DEV) {
  // ── Development Mode (localhost) ──
  // Proactively unregister any active service worker and purge all cache storage on localhost
  // so updates to your code reflect immediately without requiring manual storage clearance.
  if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then(() => {
            console.log('[PWA Dev] Unregistered stale localhost service worker.');
          });
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key).then(() => {
            console.log(`[PWA Dev] Purged cache: ${key}`);
          });
        }
      });
    }
  }
} else {
  // ── Production Mode (Web / PWA) ──
  // Register service worker with non-intrusive background updates.
  // With NetworkFirst HTML navigation in vite.config.ts, users always get the freshest version directly
  // from the network on open, preventing the delayed reload flash.
  registerSW({
    immediate: true,
    onNeedReload() {
      console.log('[PWA] Updated service worker active in background.');
    },
    onOfflineReady() {
      console.log('[PWA] Application cached and ready for offline use.');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
