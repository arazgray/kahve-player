import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'Kahve Player',
        short_name: 'Kahve',
        description: 'A quiet place to watch local video and streams.',
        start_url: './',
        launch_handler: { client_mode: 'focus-existing' },
        file_handlers: [{
          action: './',
          launch_type: 'single-client',
          accept: {
            'video/mp4': ['.mp4', '.m4v'],
            'video/webm': ['.webm'],
            'video/x-matroska': ['.mkv'],
            'video/quicktime': ['.mov'],
            'video/mpeg': ['.mpg', '.mpeg'],
            'video/mp2t': ['.ts'],
            'video/ogg': ['.ogv'],
            'video/x-msvideo': ['.avi'],
            'audio/mpeg': ['.mp3'],
            'audio/mp4': ['.m4a'],
            'audio/aac': ['.aac'],
            'audio/flac': ['.flac'],
            'audio/vnd.wave': ['.wav'],
            'audio/x-wav': ['.wav'],
            'audio/ogg': ['.ogg', '.oga'],
            'audio/x-vorbis+ogg': ['.ogg', '.oga'],
            'audio/opus': ['.opus'],
            'audio/x-opus+ogg': ['.opus'],
            'image/jpeg': ['.jpg', '.jpeg', '.jfif'],
            'image/png': ['.png'],
            'image/apng': ['.apng'],
            'image/webp': ['.webp'],
            'image/avif': ['.avif'],
            'image/gif': ['.gif'],
            'image/bmp': ['.bmp'],
            'image/svg+xml': ['.svg'],
          },
        }],
        display_override: ['window-controls-overlay'],
        display: 'standalone',
        background_color: '#11100f',
        theme_color: '#171412',
        icons: [
          { src: 'kahve-app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'kahve-app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'kahve-app-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        inlineWorkboxRuntime: true,
        globPatterns: ['**/*'],
        // VitePWA adds the manifest separately; Chrome stores the worker itself.
        globIgnores: ['manifest.webmanifest', 'sw.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
