import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('./package.json')

// The version is stamped at build time (ADR 0014): major.minor from
// package.json, then the UTC build date, e.g. 1.0.20261017. Nothing commits a
// version bump to main, so main can be fully protected.
const [major, minor] = version.split('.')
const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const appVersion = `${major}.${minor}.${buildDate}`

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    // Short commit of the build, so the exact build running on a device can be
    // told apart even when the version number hasn't changed. Vercel sets this.
    __APP_BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'),
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'BeckfieldBistro',
        short_name: 'BeckfieldBistro',
        description: 'From plan to plate. Yes, chef.',
        theme_color: '#111111',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png',            sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
