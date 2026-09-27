# ScoreHUB — static client

A pure static front end for ScoreHUB. It builds to plain HTML, JS and CSS that
any static host serves, and talks to your existing Next.js API and Socket.IO
server over the network.

Nothing was removed from the product: real accounts, saved scorecards and
three-judge live sync all still work, because the backend still exists. What
changed is that the **front end** no longer needs a Node server.

```bash
npm install
cp .env.example .env.local     # point at your API and realtime server
npm run dev                    # http://localhost:5173
npm run typecheck
npm run build                  # → dist/
npm run build:docs             # → docs/, for GitHub Pages "deploy from a branch"
```

## Configuration

Both URLs are **baked in at build time** — a static site has no server to read
environment variables at runtime, so changing a URL means rebuilding.

| Variable           | Example                                   |
| ------------------ | ----------------------------------------- |
| `VITE_API_URL`     | `https://scorehub-web.onrender.com`       |
| `VITE_SOCKET_URL`  | `https://scorehub-socket.onrender.com`    |

## What the backend needs

Three changes on the ScoreHUB repo. The static client cannot work without the
first two. Ready-to-paste files are in `backend-patch/`.

**1. CORS** — `backend-patch/middleware.ts` → repo root as `middleware.ts`.
Every call from another origin is blocked by the browser until this exists, and
the failure looks exactly like the API being down.

**2. Cross-site cookie** — `backend-patch/auth-cookie.diff` applied to
`src/lib/auth.ts`. The session cookie is currently `SameSite=Lax`, which browsers
do not send on cross-origin requests; the site would show a sign-in that never
sticks. Widening it to `SameSite=None; Secure` is what makes CORS load-bearing,
so do not apply this one without the middleware.

**3. An officials list** — `backend-patch/officials-route.ts` →
`src/app/api/auth/officials/route.ts`. The sign-in screen needs the list of
officials *before* a session exists, and `GET /api/users` requires one. Until
this route is added the sign-in screen still works, but falls back to pasting a
user id by hand.

Then set on the API host:

```
CROSS_SITE_COOKIE=true
ALLOWED_ORIGINS=https://<your-static-site>
```

and on the realtime host:

```
ALLOWED_ORIGINS=https://<your-static-site>
```

Both must be **https** in production: `SameSite=None` requires `Secure`, and a
page served over https cannot call an http API.

## Screens

| Route                             | Screen                                     |
| --------------------------------- | ------------------------------------------ |
| `/login`                          | Pick your name (passwordless, as before)   |
| `/`                               | Dashboard tiles                            |
| `/leagues/upcoming` · `/past`     | League lists                               |
| `/leagues/new` · `/:id/edit`      | Create / edit league                       |
| `/leagues/:id`                    | League summary                             |
| `/leagues/:id/fighters`           | Fighter list, add and edit                 |
| `/leagues/:id/bouts`              | Bout card, add and edit                    |
| `/leagues/:id/officials`          | Judge seats and referee across the card    |
| `/users`                          | Officials admin                            |
| `/bouts/:boutId/score`            | Memory Sheet — the judge scoring station   |
| `/bouts/:boutId/scoreboard`       | Combined scorecard, live                   |

Routing uses `HashRouter`, so deep links work on any static host with no
rewrite rules and no 404 fallback page.

## How it maps to the original

- `src/lib/scoring.ts`, `src/lib/cards.ts` and `src/lib/format.ts` are **copied
  verbatim** from the ScoreHUB repo. The marks-to-10-point-must engine, the
  category weights and the decision logic are byte-identical, so the number the
  scoreboard shows and the number the API writes cannot drift apart.
- `src/components/ScoreSheet.tsx` and `RoundTimer.tsx` are ports: `router.refresh()`
  became an `onChanged` callback, and `fetch('/api/…')` became the typed client.
- `src/lib/useBoutSocket.ts` speaks the same room protocol — `bout:join`,
  `bout:start`, `round:submitted`, `round:locked`, `bout:finished`.
- Server components that queried Prisma became `useApi(() => api.x.y())` calls.
- Role checks in the UI mirror the server's, but the server remains the only
  thing enforcing them. Hiding a button is a courtesy, not a control.

## Verified

Built and walked end-to-end against a mock implementing the API contract, and
against the repo's real `src/server/socket.ts`:

- three judges signing in on separate browser contexts and joining one bout
- the waiting gate clearing at 3 / 3, then a round start from one judge putting
  every judge's clock at `00:01` together
- marks tallying (`1,+,`) and the suggestion reading
  `Overwhelming round for Blue (5.5 – 0.0 weighted)` — 1×1.0 + 3×1.0 standup
  plus 1×1.5 takedown, matching `CATEGORY_WEIGHTS`
- the scoreboard totalling `10 – 9 / 10 – 9 / 9 – 10` from submitted rounds

## Deploying

`vite.config.ts` sets `base: './'`, so the build works from a subpath such as
`https://user.github.io/scorehub/`. For GitHub Pages either add a workflow that
runs `npm run build` and publishes `dist/`, or run `npm run build:docs`, commit
`docs/`, and set Pages to deploy from `main` / `/docs`.

Set `VITE_API_URL` and `VITE_SOCKET_URL` as build-time variables in whichever
you use — a build without them points at localhost and the app will not load
data.
