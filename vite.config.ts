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
        // A helyi OSM-csempék (public/osm, ~8000 fájl) nem kerülnek az előtöltésbe, hanem használatkor tárolódnak
        globIgnores: ['osm/**'],
        runtimeCaching: [
          {
            // Helyi OSM-jegyzék: mindig a legfrissebbet kérjük, offline a tároltat használjuk
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/osm/index.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'osm-index', networkTimeoutSeconds: 3 },
          },
          {
            // Helyi OSM-csempék: a címben verzió van, így a tárolt csempe sosem elavult
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/osm\/\d+\/\d+\/\d+\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 3000, maxAgeSeconds: 90 * 24 * 3600 } },
          },
          {
            // Térképcsempék és stílus (OpenFreeMap)
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 4000, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            // Domborzati csempék (AWS Open Data, Terrarium)
            urlPattern: ({ url }) => url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'terrain-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
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
