import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'OnCall Platform',
        short_name: 'OnCall',
        description: 'Incident Management Dashboard',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // Runtime caching for API (per user decision: offline view cached)
        runtimeCaching: [
          {
            // Cache incident list for offline viewing
            urlPattern: /\/api\/incidents(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'incidents-list-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 3, // Fall back to cache if network slow
            },
          },
          {
            // Cache individual incidents
            urlPattern: /\/api\/incidents\/[^/]+$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'incidents-detail-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 5 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Cache timeline data
            urlPattern: /\/api\/incidents\/[^/]+\/timeline$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'timeline-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache user/team data (changes less frequently)
            urlPattern: /\/api\/(users|teams)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'users-teams-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 60, // 30 minutes
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // Enable in dev for testing
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
