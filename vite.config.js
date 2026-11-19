import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative URLs so the app works on a GitHub Pages project site.
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}']
      },
      manifest: {
        name: 'Prayers',
        short_name: 'Prayers',
        description: 'Prayers you can open offline',
        theme_color: '#1f3a8a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: './icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: './icon-maskable.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})
