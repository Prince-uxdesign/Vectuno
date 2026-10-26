import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-v2.svg', 'logo-mark.svg', 'app-icon.svg', 'vectuno-apple-touch-v2.png', 'vectuno-pwa-192-v2.png', 'vectuno-pwa-512-v2.png'],
      manifest: {
        id: '/',
        name: 'Vectuno — Image to Vector',
        short_name: 'Vectuno',
        description: 'Turn PNG, JPG, or WebP images into scalable SVG vectors — converted entirely in your browser.',
        theme_color: '#fffcfa',
        background_color: '#fffcfa',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['design', 'utilities', 'graphics', 'productivity'],
        icons: [
          {
            src: '/vectuno-pwa-192-v2.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/vectuno-pwa-512-v2.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/vectuno-pwa-maskable-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
})

