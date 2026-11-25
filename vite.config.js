import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kahve Player',
        short_name: 'Kahve',
        description: 'A quiet place to watch local video and streams.',
        start_url: './',
        display_override: ['window-controls-overlay'],
        display: 'standalone',
        background_color: '#11100f',
        theme_color: '#171412',
        icons: [
          { src: 'kahve-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'kahve-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'kahve-logo-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,wasm}'],
        globIgnores: ['**/hls-*.js', '**/shaka-player.dash-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
