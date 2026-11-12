import axios from 'axios';
import { demoRequest } from './demoBackend.js';

export const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Demo mode: no API configured, so the browsing screens are served from the
 * bundled roster instead. This is what lets the GitHub Pages site show real
 * events, fighters and bouts before any backend exists.
 *
 * Set VITE_API_URL (the deploy workflow does it from the API_URL repository
 * variable) and every request goes to the real server instead.
 */
export const DEMO_MODE = !API_URL;

export const api = axios.create({
  baseURL: `${API_URL}/api`,
});

/**
 * In demo mode, answer from the roster before a request ever leaves the
 * browser. Implemented as an axios adapter so every call site — pages, hooks,
 * resource helpers — keeps working unchanged.
 */
if (DEMO_MODE) {
  api.defaults.adapter = async (config) => {
    const url = (config.url || '').replace(/^\/+/, '');
    try {
      const data = await demoRequest(config.method || 'get', url, config);
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    } catch (err) {
      // Preserve the shape axios errors have, so errMsg() still reads it.
      const status = err?.response?.status || 500;
      const payload = err?.response?.data || { message: err.message };
      const wrapped = new Error(payload.message || 'Demo request failed');
      wrapped.response = { status, data: payload, headers: {}, config };
      wrapped.config = config;
      wrapped.isAxiosError = true;
      throw wrapped;
    }
  };
}

export const errMsg = (err) =>
  err?.response?.data?.message || err?.message || 'Something went wrong';

/**
 * Resolve an image path to a URL.
 *
 * Two kinds of path exist and they live in different places:
 *   "/uploads/123-photo.jpg"  an operator upload, served by the API
 *   "fighters/arjun-rane.jpg" a file shipped in client/public, served by the
 *                             site itself — which is what makes photos work on
 *                             GitHub Pages with no backend at all.
 */
export const mediaUrl = (p) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return `${API_URL}${p}`;
  return `${import.meta.env.BASE_URL}${p}`;
};

export default api;
