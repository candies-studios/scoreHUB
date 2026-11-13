/**
 * Where the backend lives.
 *
 * Resolved in this order:
 *   1. `config.js` beside index.html — editable on the deployed site, no rebuild
 *   2. Vite build-time variables (VITE_API_URL / VITE_SOCKET_URL)
 *   3. localhost, for `npm run dev`
 *
 * Runtime config comes first deliberately. A static site has no server to read
 * environment variables, so anything baked in at build time can only be changed
 * by rebuilding — which is the wrong shape when the site is deployed by
 * committing files.
 */

declare global {
  interface Window {
    __SCOREHUB_CONFIG__?: { apiUrl?: string; socketUrl?: string; demo?: boolean };
  }
}

function clean(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

function resolve(runtime: string | undefined, buildTime: string | undefined): {
  url: string;
  configured: boolean;
} {
  const fromRuntime = clean(runtime);
  if (fromRuntime) return { url: fromRuntime, configured: true };

  const fromBuild = clean(buildTime);
  if (fromBuild) return { url: fromBuild, configured: true };

  return { url: 'http://localhost:3000', configured: false };
}

const runtimeConfig = typeof window !== 'undefined' ? window.__SCOREHUB_CONFIG__ : undefined;

const apiResolved = resolve(runtimeConfig?.apiUrl, import.meta.env.VITE_API_URL);
const socketResolved = resolve(
  runtimeConfig?.socketUrl,
  import.meta.env.VITE_SOCKET_URL,
);

export const API_URL = apiResolved.url;
export const SOCKET_URL = socketResolved.configured
  ? socketResolved.url
  : 'http://localhost:4000';

/** True when neither config.js nor a build variable named a backend. */
export const IS_UNCONFIGURED = !apiResolved.configured;

/**
 * Demo mode: everything is answered from memory by src/lib/demoBackend.ts.
 *
 * On by default when no backend is configured, so the site is presentable the
 * moment it is deployed rather than showing connection errors. Set
 * `demo: false` in config.js to get the real connection errors back.
 */
export const IS_DEMO =
  runtimeConfig?.demo === true || (runtimeConfig?.demo !== false && IS_UNCONFIGURED);
