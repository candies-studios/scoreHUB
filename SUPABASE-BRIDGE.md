# ScoreHUB × WDS shared database

ScoreHUB now reads and writes the WDS Supabase project — the same database as the
WDS website, admin dashboard and Rankings. The ScoreHUB app itself is **not rebuilt**:
the bundled app in `index.html` is byte-for-byte unchanged.

## What changed
| File | Change |
| --- | --- |
| `index.html` | config block gains `supabaseUrl` + `supabaseAnonKey`; two script tags load the bridge before the app |
| `supabase-bridge.js` | **new** — answers ScoreHUB's own API (`/api/leagues`, `/api/bouts/:id/rounds`, …) and its live-sync socket from Supabase |
| `vendor/supabase.js` | **new** — supabase-js 2.117.2 (served locally, no CDN dependency at the venue) |
| `config/migrations/001_init_schema.sql` | superseded; do not run (see header) |

Remove the two config keys to return ScoreHUB to its in-browser mode.

## How it maps
- **League** = WDS event. ScoreHUB-created leagues start as *Draft*; management
  announces them in the WDS admin dashboard.
- **Fighter** = a global WDS fighter on that league's roster. Adding someone who has
  fought before reuses their identity, so record and ranking follow them.
  Date of birth and phone are stored privately (management only).
- **Bout / scores / finish** go through database functions that check the official's
  seat or role, lock the bout, and apply ScoreHUB's decision rules.
  Results are saved as **provisional**; management finalizes them for the website
  and rankings.
- **Live sync** (who joined, round clock, round lock, finish) runs on Supabase
  Realtime, with a database heartbeat as fallback when venue Wi-Fi blocks websockets.

## Signing in
The "Welcome to ScoreHUB" screen gets one extra field, **PIN**. Officials are added by
management (WDS dashboard → Officials, or ScoreHUB → Officials). On their first sign-in
the PIN they choose becomes theirs. Someone who is not registered for the chosen role
cannot sign in, so nobody can pick "Admin" and change results.
