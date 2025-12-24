import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/cvanvlack/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Family Ledger',
        short_name: 'Ledger',
        description: 'Chores & spending requests with parent approval',
        start_url: '/cvanvlack/',
        scope: '/cvanvlack/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/cvanvlack/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/cvanvlack/pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
