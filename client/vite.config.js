import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Read VITE_* vars from the repo root as well as the client folder,
  // with real environment variables (CI) taking priority over .env files.
  const rootEnv = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
  const localEnv = loadEnv(mode, process.cwd(), '');
  const env = { ...rootEnv, ...localEnv };

  const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL || 'http://localhost:5000';

  // GitHub Pages serves a project site from /<repo>/, so the bundle needs that
  // prefix. Left unset (local dev, Netlify, Vercel, nginx) it stays at the root.
  const base = process.env.BASE_PATH || env.BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
        '/uploads': { target: apiUrl, changeOrigin: true },
        '/socket.io': { target: apiUrl, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
