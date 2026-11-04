import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base works on GitHub Pages under any repo name, on a custom domain, and in Capacitor.
export default defineConfig(() => ({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['fonts/*.woff2', 'icons/*.png', 'characters/**/*', 'privacy.html'],
      manifest: {
        name: "Lucas' Balloon Ride",
        short_name: 'Balloon Ride',
        description: 'Blow to fly! A breath-controlled balloon game for kids. By RV AppStudios.',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        background_color: '#c9f0ff',
        theme_color: '#6cc7ff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
}));
