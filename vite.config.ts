import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/kid_chore_app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Family Ledger',
        short_name: 'Ledger',
        description: 'Chores & spending requests with parent approval',
        start_url: '/kid_chore_app/',
        scope: '/kid_chore_app/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/kid_chore_app/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/kid_chore_app/pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
