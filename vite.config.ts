import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Query Quilt',
        short_name: 'Query Quilt',
        description: 'Local, reversible data workflows backed by DuckDB SQL.',
        display: 'standalone',
        theme_color: '#f4f5ef',
        background_color: '#f4f5ef',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,json,csv,parquet}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    sourcemap: true,
  },
});
