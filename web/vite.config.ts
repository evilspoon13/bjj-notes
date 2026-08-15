import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // import.meta.dirname, not __dirname: the native config loader Vite is
    // moving to does not provide the CJS global.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // In production FastAPI serves this build, so the API is same-origin.
    // In dev it lives on another port; proxying keeps the paths identical.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
