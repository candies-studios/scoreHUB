# ScoreHub

Real-time combat sports league management and multi-judge live scoring for MMA, BJJ and K1.

Build a league — fighters, referees, judges, bouts — and on fight night three judges open
the same bout on their own devices. Nobody starts until the whole panel is connected. A
single synchronized clock runs the round for everyone, each judge taps their own memory
sheet, and the round only closes when all three cards are in. Finishes (KO, TKO,
submission, DQ) end the bout instantly on every screen, and the supervised combined
scoreboard shows all three cards side by side with the decision.

**There are no accounts and no passwords.** Every screen is open. A judge identifies
themselves at the cage by picking their name from the bout's panel, which is all the
scoring engine needs to keep three separate scorecards.

> ⚠️ Because everything is public, anyone who can reach the server can create, edit and
> delete leagues and score live bouts. That's the intended design for a demo or a trusted
> venue LAN. Don't put an event you care about on a public URL without putting something
> in front of it — see [Locking it down](#locking-it-down).

## Stack

| Layer     | Choice |
|-----------|--------|
| Client    | React 18, Vite, React Router 6, Axios, socket.io-client |
| Server    | Node 18+, Express 4, Socket.IO 4 |
| Database  | MongoDB with Mongoose 8 |
| Layout    | npm workspaces monorepo (`client` + `server`) |

## Quick start

```bash
git clone https://github.com/<you>/scorehub.git
cd scorehub

cp .env.example .env          # set MONGO_URI if yours isn't on localhost
npm install                   # installs both workspaces
npm run seed                  # demo league, 3 judges, 2 bouts
npm run dev                   # API on :5000, client on :5173
```

Open http://localhost:5173 and go straight in — no sign-in step.

To put it on a public URL instead, see [Deploying](#deploying).

To watch the live sync, open the same bout in three browser windows and pick a different
judge in each. The seat you pick is remembered per bout on that device; **Switch** in the
header lets you change it.

## How a fight night runs

1. **Create League** — name, date, time, location, promoter, logo, and the number of
   amateur/pro MMA, BJJ and K1 bouts.
2. **Fighter list / Judge list / Referee list** — populate the league. Judges added here
   become selectable when building a bout panel.
3. **Bout list → Add Bout** — bout number, weight class, type, rounds, round duration,
   the two corners, three judges and a referee.
4. **Each judge opens the bout** and picks their name (or *Watch as supervisor*). The
   header shows `x/3 judges connected`; **Start** unlocks only at 3/3.
5. **Round scoring.** Four categories per corner — Strikes & Kicks (Stand Up),
   Takedowns, Strikes on Ground, Grappling & Submissions. Each has three keys:

   | Key | Meaning |
   |-----|---------|
   | `1` | Effective / landed action |
   | `0` | Attempted but blocked or missed |
   | `+` | Dominant or significant action |

   Taps append to that category's log (`1,1,0,+,`), exactly like a paper memory sheet.
   A running tally (1 → 1pt, `+` → 2pts) sits under each corner as an aid — it never
   overrides the judge.
6. **End of round** — each judge picks their 10-point-must scores and submits. Anyone who
   submits early sees *"Please wait for other judges"*. When the last card lands the round
   closes and the clock resets for the next one.
7. **Finish** — Head KO, KO Body, TKO, RNC, Submission, DQ or No Contest ends the bout for
   the whole panel at once and locks every card.
8. **Supervised Combined Scoreboard** — all three judges' rounds and totals, the decision
   (unanimous / split / majority / draw), and the winner banner. Printable.

## Roles without logins

Role is decided entirely by what you pick when you open a bout:

| Choice | Can do |
|--------|--------|
| A judge on the panel | Score their own card, submit rounds, call a finish |
| Watch as supervisor | See every judge's tokens live, drive the clock, call a finish — but never score |

A judge only ever sees their own card. Supervisors get the full panel feed. Picking an id
that isn't on the bout's panel is rejected by the server, so a stale saved seat can't leak
into someone else's card.

One honest limitation: nothing stops two people picking the same judge seat. The presence
list shows names as people join, so a collision is visible immediately, and **Switch**
fixes it. If you need that enforced, add PINs — see below.

## Scoring rules

Rounds use the **10-point must system**. The winner is decided by majority of judges'
cards. If judges split evenly the aggregate point total breaks the tie; a genuine tie is a
draw. Any finish overrides the cards entirely.

```
Unanimous Decision  all judges agree
Split Decision      2–1
Majority Decision   2 agree, 1 scored it even
Draw                cards cancel out
```

## Project layout

Every file in the repo — 68 in total. `package-lock.json` is generated by `npm install`
and should be committed; `node_modules/`, `client/dist/` and `.env` are gitignored.

```
scorehub/
├── .env.example                    template for your local .env
├── .gitignore
├── LICENSE                         MIT
├── README.md                       this file
├── package.json                    workspace root: scripts for dev/build/test/seed
├── render.yaml                     Render blueprint for the API
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  lint + tests + build on every push and PR
│       └── deploy-pages.yml        builds the client and publishes it to GitHub Pages
│
├── client/                         React app (Vite)
│   ├── .eslintrc.cjs
│   ├── index.html                  HTML shell, fonts, icon links
│   ├── package.json
│   ├── vite.config.js              base path, API URL injection, dev proxy
│   ├── public/                     copied to the site root as-is
│   │   ├── favicon.svg             scalable icon, modern browsers
│   │   ├── favicon.ico             16/32/48 multi-resolution, legacy + Windows
│   │   ├── apple-touch-icon.png    180x180, iOS home screen
│   │   ├── icon-192.png            PWA / Android
│   │   ├── icon-512.png            PWA / Android, high-res
│   │   ├── icon-maskable-512.png   Android adaptive icon (safe-zone inset)
│   │   └── site.webmanifest        app name, theme colour, icon list
│   └── src/
│       ├── main.jsx                entry point; sets the router basename
│       ├── App.jsx                 all routes
│       │
│       ├── api/
│       │   ├── client.js           axios instance, API_URL, error helper
│       │   ├── resources.js        league / fighter / official / bout calls
│       │   └── socket.js           socket.io singleton + event name constants
│       │
│       ├── components/
│       │   ├── Brand.jsx           wordmark and swoosh
│       │   ├── Field.jsx           TextField, SelectField, Stepper
│       │   ├── Layout.jsx          top bar + page shell
│       │   ├── Modal.jsx           Modal, WaitingModal, ResultModal
│       │   ├── PillTable.jsx       the pill-style table used by every list screen
│       │   ├── SeatPicker.jsx      "who are you" — the login replacement
│       │   └── TopBar.jsx          header and hamburger menu
│       │
│       ├── hooks/
│       │   └── useBoutSocket.js    presence, synchronized clock, round state
│       │
│       ├── pages/
│       │   ├── Dashboard.jsx       the three tiles
│       │   ├── LeagueList.jsx      upcoming / past league tables
│       │   ├── LeagueForm.jsx      create and edit a league
│       │   ├── FighterList.jsx     fighters with photos
│       │   ├── OfficialList.jsx    judge list and referee list (shared)
│       │   ├── BoutList.jsx        bouts with corner colours and filters
│       │   ├── BoutForm.jsx        bout builder: corners, panel, referee
│       │   ├── LiveScoring.jsx     the memory sheet — the core screen
│       │   └── Scoreboard.jsx      supervised combined scoreboard
│       │
│       ├── styles/
│       │   ├── global.css          design tokens, layout, tables, forms
│       │   └── scoring.css         memory sheet and scoreboard
│       │
│       └── utils/
│           └── format.js           categories, tokens, finish methods, date/clock
│
└── server/
    ├── package.json
    ├── src/
    │   ├── index.js                boots DB, HTTP server and sockets
    │   ├── app.js                  express app, middleware, route mounting
    │   │
    │   ├── config/
    │   │   ├── db.js               mongoose connection
    │   │   └── env.js              env parsing, CORS origin handling
    │   │
    │   ├── middleware/
    │   │   ├── error.js            notFound, errorHandler, asyncHandler
    │   │   └── upload.js           multer disk storage for logos and photos
    │   │
    │   ├── models/
    │   │   ├── League.js
    │   │   ├── Fighter.js
    │   │   ├── Official.js         judges and referees
    │   │   ├── Bout.js             corners, panel, rounds, result
    │   │   └── Scorecard.js        per-judge token logs and round scores
    │   │
    │   ├── routes/
    │   │   ├── league.routes.js
    │   │   ├── fighter.routes.js
    │   │   ├── official.routes.js
    │   │   └── bout.routes.js      CRUD + scorecards + summary + reset
    │   │
    │   ├── sockets/
    │   │   ├── events.js           event name constants
    │   │   ├── boutRoom.js         in-memory room state: presence and clock
    │   │   └── index.js            all socket handlers
    │   │
    │   └── utils/
    │       ├── scoring.js          tokens, round submission, decisions, summary
    │       └── seed.js             demo league, fighters, judges, bouts
    │
    ├── test/
    │   ├── logic.test.mjs          25 checks, no database needed
    │   └── integration.test.mjs    full server + 3 sockets, needs MongoDB
    │
    └── uploads/
        └── .gitkeep                keeps the folder in git; contents ignored
```

### Verify your copy

After unzipping or cloning, this should print `68`:

```bash
find . -type f \
  -not -path "./node_modules/*" -not -path "./.git/*" \
  -not -path "*/dist/*" -not -name "package-lock.json" | wc -l
```

On Windows PowerShell:

```powershell
(Get-ChildItem -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch 'node_modules|\\.git\\|dist' -and $_.Name -ne 'package-lock.json' }).Count
```

Note the dotfiles: `.gitignore`, `.env.example`, `.github/`, `client/.eslintrc.cjs` and
`server/uploads/.gitkeep`. Finder on macOS and File Explorer on Windows hide these by
default — press `Cmd+Shift+.` or tick **Hidden items** in the View ribbon to see them.

## Icons

The browser tab, bookmark and home-screen icons live in `client/public/` and are a
white Poppins **S** on the brand indigo gradient (`#3b23c9` → `#6366f1`), matching the
ScoreHub wordmark in the header.

Everything is generated from one 512px vector, with each `.ico` size rendered
separately from the source rather than downscaled, so the 16px tab icon stays crisp.
The maskable variant insets the S so Android's circular crop does not clip it.

The `<link>` tags in `client/index.html` use Vite's `%BASE_URL%` placeholder:

```html
<link rel="icon" href="%BASE_URL%favicon.ico" sizes="48x48" />
<link rel="icon" href="%BASE_URL%favicon.svg" type="image/svg+xml" sizes="any" />
```

That matters on GitHub Pages. A hardcoded `/favicon.svg` resolves to the domain root
and 404s on a project site — `%BASE_URL%` makes it `/scoreHUB/favicon.svg` instead.

**To change the artwork**, replace the files in `client/public/`. Keep the filenames and
no other change is needed. Browsers cache favicons aggressively, so after deploying do a
hard refresh (`Ctrl/Cmd + Shift + R`), or open `/<repo>/favicon.svg` directly to confirm
the new file is live.

## Data model

- **League** — event, with per-discipline bout counts and a logo.
- **Fighter** — belongs to a league; team, weight class, record, photo.
- **Official** — a judge or referee on a league. This is the identity a judge picks.
- **Bout** — two corners, a panel of up to three judges, a referee, rounds and duration,
  plus the final `result` (winner, method, round, time).
- **Scorecard** — one per judge per bout. Holds a `rounds[]` array; each round stores the
  four token logs per corner and that judge's 10-point scores. Unique on `(bout, judge)`.

## Realtime protocol

All events are namespaced per bout room (`bout:<id>`). The connection needs no credentials;
identity is established by the `judgeId` sent with `bout:join`.

**Client → server**

| Event | Payload | Notes |
|-------|---------|-------|
| `bout:join` | `{ boutId, judgeId }` | `judgeId` is an Official id on the panel; omit or send `null` to join as a supervisor |
| `bout:ready` | `{ ready }` | Judge signals they're at the sheet |
| `round:start` | `{ roundNo }` | Refused for judges until the full panel is present |
| `round:stop` | `{}` | Pauses the shared clock |
| `score:token` | `{ roundNo, corner, category, token }` | Appends one token |
| `score:undo` | `{ roundNo, corner, category }` | Pops the last token |
| `round:submit` | `{ roundNo, blueScore, redScore }` | Locks that judge's round |
| `round:next` | `{}` | Manual round advance |
| `bout:finish` | `{ method, winnerCorner }` | KO/TKO/Sub/DQ/NC |
| `bout:sync` | `{}` | Re-sync after a reconnect |

**Server → client**

| Event | Meaning |
|-------|---------|
| `bout:state` | Full state on join: presence, clock, seat, round |
| `bout:presence` | Panel changed — `{ joined, expected, allJoined, judges[] }` |
| `round:timer` | Authoritative clock, with `serverNow` for drift correction |
| `score:update` | Token echo (own card, or any card if you're a supervisor) |
| `round:waiting` | `{ submitted, total, message }` |
| `round:complete` | Round closed, next round armed |
| `bout:finished` | Full summary payload |
| `bout:error` | Human-readable failure |

The server holds the clock, not the browsers. Each client ticks locally for smoothness but
corrects against every `round:timer`, so a judge who reloads mid-round rejoins at the right
second.

## REST API

Every route is open — no headers required.

```
GET    /api/health

GET    /api/leagues?scope=upcoming|past|all
GET    /api/leagues/:id
POST   /api/leagues                multipart (logo)
PUT    /api/leagues/:id
DELETE /api/leagues/:id            cascades to bouts, fighters, officials

GET    /api/fighters?league=
POST   /api/fighters               multipart (photo)
PUT    /api/fighters/:id
DELETE /api/fighters/:id

GET    /api/officials?league=&kind=judge|referee
POST   /api/officials
PUT    /api/officials/:id
DELETE /api/officials/:id

GET    /api/bouts?league=&type=&discipline=
GET    /api/bouts/:id
POST   /api/bouts
PUT    /api/bouts/:id
DELETE /api/bouts/:id
GET    /api/bouts/:id/scorecards?judge=
GET    /api/bouts/:id/summary
POST   /api/bouts/:id/reset
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/scorehub` | Database |
| `CLIENT_ORIGIN` | `*` | CORS allowlist, comma-separated. Origin only — no path or trailing slash |
| `VITE_API_URL` | `http://localhost:5000` | API base the client calls. Baked in at build time |
| `BASE_PATH` | `/` | Sub-path the client is served from. Pages needs `/<repo>/`; the workflow sets it |

No secrets are needed to run this, so `.env` is mostly about pointing at your database.

## Scripts

```bash
npm run dev          # server + client together
npm run dev:server   # API only, with --watch
npm run dev:client   # Vite only
npm run build        # production client bundle -> client/dist
npm start            # run the API (serve client/dist behind nginx or similar)
npm run seed         # reset and populate demo data
npm test             # scoring + realtime logic checks, no DB needed
npm run test:e2e     # full server + socket run (needs MONGO_TEST_URI or mongodb-memory-server)
npm run lint         # eslint the client
```

## Deploying

The client is a static bundle and the server is a long-running Node process, so they
go to two different places. **GitHub Pages cannot host the server** — it only serves
static files, and the judge sync needs a live WebSocket server. The split below keeps
everything on free tiers.

```
GitHub Pages  ──>  client (static React bundle)
Render        ──>  server (Express + Socket.IO)
MongoDB Atlas ──>  database
```

### 1. Database — MongoDB Atlas

1. Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user with a password you note down.
3. **Network Access** → allow `0.0.0.0/0`. Render's free tier has no fixed outbound IP,
   so an allowlist of specific addresses will not work.
4. Copy the connection string; it looks like
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/scorehub`.
   Add the `/scorehub` database name before the `?` — without it you land in `test`.

Seed it once from your machine:

```bash
MONGO_URI="mongodb+srv://..." npm run seed
```

### 2. Server — Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. It reads `render.yaml` and
   creates the `scorehub-api` service.
3. Set the two environment variables it asks for:

   | Variable | Value |
   |----------|-------|
   | `MONGO_URI` | Your Atlas connection string |
   | `CLIENT_ORIGIN` | `https://yourname.github.io` — **origin only**, no `/scorehub`, no trailing slash |

4. Wait for the deploy, then check `https://scorehub-api.onrender.com/api/health`
   returns `{"status":"ok"}`.

### 3. Client — GitHub Pages

1. **Settings → Pages → Source → GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:

   | Name | Value |
   |------|-------|
   | `API_URL` | `https://scorehub-api.onrender.com` — your Render URL, **https**, no trailing slash |

3. Push to `main`. The `Deploy client to GitHub Pages` workflow builds and publishes.
   Your site is at `https://yourname.github.io/scorehub/`.

The workflow fails loudly if `API_URL` is missing rather than publishing a site that
silently calls `localhost` and shows no data.

### What the workflow handles for you

- **Sub-path.** A project site lives at `/<repo>/`, so the workflow passes
  `BASE_PATH=/scorehub/` to Vite and the router reads it back from `import.meta.env.BASE_URL`.
  Rename the repo and it follows automatically.
- **Deep links.** Pages 404s on client-side routes, so `index.html` is copied to
  `404.html` — refreshing on `/bouts/<id>/score` then still works.
- **Jekyll.** A `.nojekyll` file stops Pages mangling the build output.

### Free-tier realities

Worth knowing before you demo this to anyone:

- **Render sleeps.** The free instance spins down after ~15 minutes idle, and the next
  request takes **around 50 seconds** to wake it. Open the site once before a fight
  night, or upgrade to a paid instance.
- **Uploads vanish.** Render's disk is ephemeral, so league logos and fighter photos in
  `server/uploads/` are wiped on every deploy and restart. For anything lasting, swap
  `server/src/middleware/upload.js` for S3, Cloudinary or Render's paid persistent disk.
- **One instance only.** Bout presence and the clock live in memory. That is fine on the
  free tier, which runs a single instance, but scaling out needs the Socket.IO Redis
  adapter and a shared clock store.
- **HTTPS both sides.** Pages is always HTTPS, so `API_URL` must be too — a browser
  blocks an HTTPS page calling an HTTP API as mixed content.

### Other hosts

Nothing here is Render- or Pages-specific. Any static host (Netlify, Vercel, Cloudflare
Pages, nginx) serves `client/dist` given `VITE_API_URL` at build time, and any Node host
(Railway, Fly.io, a VPS) runs the server given `MONGO_URI` and `CLIENT_ORIGIN`. Leave
`BASE_PATH` unset when serving from a domain root.

## Locking it down

If you later need this to survive a public URL, in rough order of effort:

- **Put it behind HTTP basic auth** at the reverse proxy. One nginx block, no code change,
  and the whole app is private.
- **Give judges seat PINs.** Add a `pin` field to `Official` and check it in the
  `bout:join` handler — a ~15-line change that stops seat collisions and impersonation
  without introducing accounts.
- **Restore full accounts.** Roles and JWT middleware were removed in favour of the open
  model; reintroducing them means a `User` model, an auth route, an Express `protect`
  middleware and a socket handshake check.

## Known limits

- Anyone who can reach the app can change anything. By design — see the warning at the top.
- Two people can pick the same judge seat; the presence list makes it visible but nothing
  blocks it.
- Bout room state (presence and the clock) lives in memory, so a single API instance is
  assumed. Add the Socket.IO Redis adapter plus a shared clock store to scale out.
- Local disk uploads are not durable on ephemeral hosts.

## License

MIT
