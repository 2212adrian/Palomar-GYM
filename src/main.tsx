// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Register Service Worker in BOTH dev and production
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] Out of date version detected - refreshing page to load latest version...');
    // Trigger service worker activation and page refresh
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[PWA] Application cached and ready for offline use.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
