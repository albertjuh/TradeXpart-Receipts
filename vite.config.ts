import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon-source.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'TradeXparts',
          short_name: 'TradeXparts',
          description: 'Receipts, shipments, and sales tracking for TradeXparts',
          theme_color: '#0A0A0A',
          background_color: '#0A0A0A',
          display: 'standalone',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App shell only — no runtime caching of Supabase requests, so data
          // always comes from the network fresh (installable, not offline).
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Activate a new service worker as soon as it's installed instead of
          // waiting for every open tab to close — otherwise deploys can appear
          // to "not work" even after a hard refresh.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // Proxy /api to the local Express server (port 3000) when running vite dev standalone.
      // When using `npm run dev` (tsx server.ts), vite runs as middleware and this proxy
      // is not active — it only applies to `vite dev` / `vercel dev`.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
