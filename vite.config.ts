// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {

  console.log('======================');
  console.log('Vite Mode:', mode);
  console.log('VITE_APP_URL:', 'http://localhost:3000');
  console.log('======================');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Palomar GYM',
          short_name: 'Wolf GYM',
          description:
            'Gym Management System with members, attendance logbook, sales, and scanner.',
          theme_color: '#123c73',
          background_color: '#d1020c',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['fitness', 'business', 'utilities'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,webmanifest,woff,woff2}'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages-cache',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Critical App Data: Member Lists, Attendance Logs, Products, Sales, Receipts, Subscriptions, Cards & Settings
              urlPattern: ({ url }) =>
                url.pathname.includes('/rest/v1/members') ||
                url.pathname.includes('/rest/v1/attendance') ||
                url.pathname.includes('/rest/v1/products') ||
                url.pathname.includes('/rest/v1/sales') ||
                url.pathname.includes('/rest/v1/rates_config') ||
                url.pathname.includes('/rest/v1/gym_profile') ||
                url.pathname.includes('/rest/v1/receipts') ||
                url.pathname.includes('/rest/v1/subscriptions') ||
                url.pathname.includes('/rest/v1/cards') ||
                url.pathname.includes('/rest/v1/member_cards') ||
                url.pathname.includes('/rest/v1/membership_settings') ||
                url.pathname.includes('/rest/v1/cash_sessions') ||
                url.pathname.includes('/rest/v1/profiles'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'palomar-critical-data-cache',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
                },
              },
            },
            {
              // Product Images & Public Storage Assets for Offline Viewing
              urlPattern: ({ url }) =>
                url.pathname.includes('/storage/v1/object/public/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'palomar-product-images-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              // General Supabase REST API queries (excluding live security access config)
              urlPattern: ({ url }) =>
                url.pathname.includes('/rest/v1/') &&
                !url.pathname.includes('/rest/v1/system_config') &&
                !url.pathname.includes('/rest/v1/rpc/get_security_access_config'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'palomar-api-cache',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
              },
            },
            {
              // External Web Fonts
              urlPattern: /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true, // Enables service worker in development and AI Studio preview for offline testing
          type: 'module',
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
    },
  };
});