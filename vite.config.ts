/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relatív útvonal, hogy GitHub Pages / Cloudflare Pages alkönyvtárban is működjön
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'KreszPass – forgalmi vizsga gyakorló',
        short_name: 'KreszPass',
        description: 'Vizsgaútvonal-szimulátor a helyzetfelismerés gyakorlására',
        lang: 'hu',
        theme_color: '#1d4ed8',
        background_color: '#f7f7f5',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Térképcsempék és stílus (OpenFreeMap)
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 4000, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            // Mapillary utcaképek
            urlPattern: ({ url }) => /(^|\.)fbcdn\.net$|(^|\.)mapillary\.com$/.test(url.hostname) && !url.pathname.includes('graph'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'street-images',
              expiration: { maxEntries: 1500, maxAgeSeconds: 14 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // A MapLibre térképmotor önmagában ~800 kB; a service worker gyorsítótárazza, így csak az első betöltéskor számít
    chunkSizeWarningLimit: 1700,
  },
  worker: {
    // A MapLibre worker ES-modul (import-ot használ)
    format: 'es',
  },
  test: {
    environment: 'node',
  },
})
