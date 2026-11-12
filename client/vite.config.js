import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Read VITE_* vars from the repo root as well as the client folder,
  // with real environment variables (CI) taking priority over .env files.
  const rootEnv = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
  const localEnv = loadEnv(mode, process.cwd(), '');
  const env = { ...rootEnv, ...localEnv };

  /**
   * An EXPLICITLY EMPTY VITE_API_URL means "no backend — run read-only",
   * which is a real deployment state, not a mistake. So distinguish "unset"
   * from "set to empty": `||` would collapse the two and quietly point a read-only
   * build at localhost, which looks to the user like a broken site.
   */
  const explicit = process.env.VITE_API_URL ?? env.VITE_API_URL;
  const apiUrl = explicit === undefined ? 'http://localhost:5000' : explicit;

  // GitHub Pages serves a project site from /<repo>/, so the bundle needs that
  // prefix. Left unset (local dev, Netlify, Vercel, nginx) it stays at the root.
  const base = process.env.BASE_PATH || env.BASE_PATH || '/';

  return {
    base,
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    css: {
      /**
       * Pin PostCSS to an empty config.
       *
       * Vite otherwise searches upward from this folder for postcss.config.*,
       * so an unrelated config at the repo root gets applied to this build —
       * and fails it outright if that config requires a plugin (Tailwind, say)
       * that this workspace does not install. This app uses plain CSS, so
       * there is nothing to configure and nothing to inherit.
       */
      postcss: {},
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
