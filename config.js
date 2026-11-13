/**
 * ScoreHUB static client — runtime configuration.
 *
 * Edit this file directly on the deployed site (docs/config.js in the repo).
 * It is read at page load, so changing a URL here takes effect on refresh with
 * NO REBUILD. That is the point: the bundle stays the same whichever host the
 * backend lives on.
 *
 * Leave a value empty and the app will say so on screen instead of failing
 * silently.
 */
window.__SCOREHUB_CONFIG__ = {
  // The ScoreHUB Next.js API. No trailing slash. Must be https in production.
  apiUrl: '',

  // The ScoreHUB Socket.IO realtime server. No trailing slash.
  socketUrl: '',
};
