# ScoreHUB × Supabase Integration Guide

This guide walks through integrating Supabase as the backend for your ScoreHUB React app.

## Overview

Instead of a separate Next.js API + Socket.IO server, you'll use Supabase for:
- **PostgreSQL database** - all data storage
- **Realtime** - live updates across judges' devices (replaces Socket.IO)
- **REST API** - built-in endpoints for CRUD operations

Your React frontend talks directly to Supabase (no separate server).

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **New Project**
3. Fill in:
   - **Name**: ScoreHUB (or your choice)
   - **Database Password**: Create a strong password (you'll need this)
   - **Region**: Choose closest to your users
4. Wait for project to initialize (2-3 minutes)
5. Once ready, go to **Project Settings** → **API**
6. **Copy these values** (you'll need them for `.env.local`):
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **Anon Key** (public key, safe for frontend)
   - **Service Role Key** (SECRET, keep it private)

---

## Step 2: Create Database Schema

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `supabase/migrations/001_init_schema.sql` in this repo
4. **Copy the entire SQL** and paste it into the Supabase SQL Editor
5. Click **Run**
6. You should see all tables created successfully

Verify in **Table Editor** (left sidebar) — you should see these tables:
- officials
- leagues
- fighters
- bouts
- bout_judges
- rounds
- judge_scorecards
- bout_outcomes
- bout_states

---

## Step 3: Install Dependencies

In your ScoreHUB repo root:

```bash
npm install @supabase/supabase-js
```

---

## Step 4: Setup Environment Variables

1. Copy `.env.example` to `.env.local` in your repo root:

```bash
cp .env.example .env.local
```

2. Edit `.env.local` and fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get the values from **Project Settings → API** in Supabase.

3. Add to `.gitignore` (it should already be there):

```
.env.local
```

---

## Step 5: Copy Library Files

Copy these files into your repo:

- `src/lib/supabase.ts` → your `src/lib/` folder
- `supabase/config.toml` → your `supabase/` folder
- `supabase/migrations/001_init_schema.sql` → your `supabase/migrations/` folder

---

## Step 6: Update Your Components

### Before (using fetch + separate backend):

```typescript
const response = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues`);
const leagues = await response.json();
```

### After (using Supabase):

```typescript
import { getLeagues } from "@/lib/supabase";

const { data: leagues, error } = await getLeagues();
```

### Example: Update a component that lists leagues

Replace this:

```typescript
useEffect(() => {
  async function load() {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues`);
    const data = await response.json();
    setLeagues(data);
  }
  load();
}, []);
```

With this:

```typescript
import { getLeagues } from "@/lib/supabase";

useEffect(() => {
  async function load() {
    const { data, error } = await getLeagues();
    if (error) {
      console.error("Error:", error.message);
    } else {
      setLeagues(data || []);
    }
  }
  load();
}, []);
```

---

## Step 7: Use Real-time Updates (replaces Socket.IO)

### Before (Socket.IO):

```typescript
socket.on("bout:updated", (state) => {
  setRoundState(state);
});
```

### After (Supabase Realtime):

```typescript
import { subscribeToBoutState } from "@/lib/supabase";

useEffect(() => {
  const unsubscribe = subscribeToBoutState(boutId, (state) => {
    setRoundState(state);
  });
  return unsubscribe; // Clean up subscription on unmount
}, [boutId]);
```

---

## Step 8: Test Locally

```bash
npm run dev
```

Visit `http://localhost:5173` and try:
1. Creating a league
2. Adding fighters
3. Creating a bout
4. Joining as a judge (open DevTools → Network to see real-time updates)

If data appears and real-time updates work, you're good to deploy!

---

## Step 9: Deploy

### Frontend

Choose one of:

**Option A: GitHub Pages**

```bash
npm run build:docs
git add docs/
git commit -m "Deploy to GitHub Pages"
git push
```

Then go to repo **Settings → Pages → Source** and set to `main / /docs`.

**Option B: Netlify**

```bash
npm run build
```

Connect your GitHub repo to Netlify, set build command to `npm run build`, deploy `dist/` folder.

**Option C: Vercel**

```bash
npm run build
```

Connect GitHub repo to Vercel, it auto-detects Vite config.

### Important: Set environment variables

On your hosting platform, set:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

These are **build-time** variables in Vite, so they must be set before the build runs.

### Configure CORS in Supabase

In Supabase dashboard → **Project Settings → API → CORS**:

Add your deployed site URL:

```
https://yourusername.github.io
https://yourapp.netlify.app
https://yourapp.vercel.app
```

Do NOT use `*` — be specific about which domains can access your database.

---

## API Reference

All these functions are in `src/lib/supabase.ts`:

### Officials

- `getOfficials()` — Get all judges/referees
- `createOfficial(official)` — Add a new judge/referee
- `updateOfficial(id, updates)` — Edit a judge/referee
- `deleteOfficial(id)` — Remove a judge/referee

### Leagues

- `getLeagues()` — Get all leagues
- `getLeagueById(id)` — Get one league
- `createLeague(league)` — Create a new league
- `updateLeague(id, updates)` — Edit a league
- `deleteLeague(id)` — Delete a league

### Fighters

- `getFighters(leagueId)` — Get fighters in a league
- `createFighter(fighter)` — Add a fighter
- `updateFighter(id, updates)` — Edit a fighter
- `deleteFighter(id)` — Remove a fighter

### Bouts

- `getBouts(leagueId)` — Get bouts in a league
- `getBoutById(id)` — Get one bout with all details
- `createBout(bout)` — Schedule a new bout
- `updateBout(id, updates)` — Edit a bout
- `deleteBout(id)` — Delete a bout

### Rounds & Scoring

- `getRounds(boutId)` — Get all rounds for a bout
- `createRound(round)` — Start a new round
- `updateRound(id, updates)` — Update round status
- `getScorecards(roundId)` — Get judge scorecards for a round
- `submitScorecard(scorecard)` — Judge submits their score
- `updateScorecard(id, updates)` — Judge updates their live tally

### Real-time Subscriptions

- `subscribeToBoutState(boutId, callback)` → unsubscribe function
- `subscribeToScorecards(roundId, callback)` → unsubscribe function
- `subscribeToRounds(boutId, callback)` → unsubscribe function

Each subscription returns an unsubscribe function — call it on component unmount to clean up.

---

## Troubleshooting

### "CORS error" when calling Supabase

**Solution**: Add your site URL to Supabase CORS settings (Project Settings → API → CORS)

### Real-time updates not working

**Solution**: Make sure:
1. Realtime is enabled in Supabase (it is by default)
2. You're calling `unsubscribe()` properly on unmount
3. Check browser console for errors

### Can't see data in tables

**Solution**:
1. Check **Supabase SQL Editor** → Run: `SELECT COUNT(*) FROM officials;`
2. If count is 0, data wasn't inserted. Check your React component for errors.
3. Check **Supabase Realtime Inspector** (if enabled) to see live events.

### Environment variables not loading

**Solution**:
1. Make sure you're using `VITE_` prefix (Vite requirement)
2. Restart `npm run dev`
3. Check that `.env.local` is in `.gitignore`

---

## Next Steps

Once working, consider:

1. **Add Supabase Auth** for passwordless sign-in (instead of manually entering names)
2. **Tighten RLS policies** so judges can only see/edit their own scorecards
3. **Add indexes** on frequently-queried columns for better performance
4. **Set up automated backups** in Supabase Settings

---

## File Manifest

These files come with this setup:

```
supabase/
├── config.toml                         # Supabase project config
└── migrations/
    └── 001_init_schema.sql            # Database schema (run in SQL Editor)

src/
├── lib/
│   └── supabase.ts                    # Supabase client + helpers
└── components/
    ├── LeagueList.tsx                 # Example: list leagues
    ├── BoutList.tsx                   # Example: list bouts + real-time state
    └── JudgeScorecard.tsx             # Example: submit scores

.env.example                           # Template for environment variables
SUPABASE_SETUP.md                      # This file
```

---

## Questions?

Check the Supabase docs:
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)
- [Realtime](https://supabase.com/docs/guides/realtime)
- [Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)
