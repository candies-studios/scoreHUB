/**
 * ScoreHUB static client — runtime configuration.
 *
 * Edit this file on the deployed site (docs/config.js or config.js in the
 * repo). It is read at page load, so a change takes effect on refresh with
 * NO REBUILD.
 *
 * DEMO MODE
 * ---------
 * With `apiUrl` empty the app runs a complete in-browser demo: sample leagues,
 * fighters, bouts and officials, a working judge sheet and scoreboard. Nothing
 * is saved — a refresh restores the sample data. This is what to present when
 * the backend is not deployed yet.
 *
 * GOING LIVE
 * ----------
 * Fill in both URLs below. The app then talks to the real ScoreHUB API and
 * realtime server, and the demo turns itself off.
 */
window.__SCOREHUB_CONFIG__ = {
  // The ScoreHUB Next.js API. No trailing slash. Must be https in production.
  apiUrl: '',

  // The ScoreHUB Socket.IO realtime server. No trailing slash.
  socketUrl: '',

  // Leave undefined to decide automatically from apiUrl.
  // true  = always demo, even with URLs set
  // false = never demo; show real connection errors instead
  // demo: false,
};
