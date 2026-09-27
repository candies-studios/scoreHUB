# ScoreHUB + Supabase — Quick Start (TL;DR)

## 1. Create Supabase Project (5 min)

Go to [supabase.com](https://supabase.com) → New Project

After setup, grab from **Settings → API**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

## 3. Create Database Schema

In Supabase dashboard:
1. **SQL Editor** → **New Query**
2. Copy/paste entire contents of `supabase/migrations/001_init_schema.sql`
3. Click **Run**

## 4. Setup Environment Variables

Create `.env.local` in your repo root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Add to `.gitignore`:
```
.env.local
```

## 5. Copy Files Into Your Repo

From the files provided:

```bash
# Copy library
cp src/lib/supabase.ts /path/to/your/repo/src/lib/

# Copy config
mkdir -p supabase/migrations
cp supabase/config.toml /path/to/your/repo/supabase/
cp supabase/migrations/001_init_schema.sql /path/to/your/repo/supabase/migrations/

# Copy example components (optional)
cp src/components/*.tsx /path/to/your/repo/src/components/
cp src/hooks/useBoutState.ts /path/to/your/repo/src/hooks/

# Copy setup docs
cp SUPABASE_SETUP.md /path/to/your/repo/
```

## 6. Update Your Components

Replace any `fetch()` calls to your old API:

**Before:**
```typescript
const response = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues`);
const leagues = await response.json();
```

**After:**
```typescript
import { getLeagues } from "@/lib/supabase";

const { data: leagues, error } = await getLeagues();
```

For real-time updates, replace Socket.IO listeners:

**Before:**
```typescript
socket.on("bout:updated", (state) => setRoundState(state));
```

**After:**
```typescript
import { subscribeToBoutState } from "@/lib/supabase";

useEffect(() => {
  const unsubscribe = subscribeToBoutState(boutId, (state) => {
    setRoundState(state);
  });
  return unsubscribe;
}, [boutId]);
```

## 7. Test Locally

```bash
npm run dev
```

Visit `http://localhost:5173` and test creating leagues/fighters/bouts.

## 8. Deploy

### To GitHub Pages:
```bash
npm run build:docs
git add .
git commit -m "Deploy with Supabase"
git push
```

Then set **Settings → Pages → Source** to `main / /docs`

### To Netlify/Vercel:
```bash
npm run build
```

Set build command to `npm run build`, deploy `dist/` folder.

**Important:** Add environment variables in hosting platform settings:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

## 9. Enable CORS in Supabase

In Supabase **Settings → API → CORS**, add your deployed URL:
```
https://yourusername.github.io
https://yourapp.netlify.app
```

---

## File List Provided

```
✓ src/lib/supabase.ts              — Main client + helpers
✓ src/components/LeagueList.tsx    — Example: list leagues
✓ src/components/BoutList.tsx      — Example: list bouts with real-time
✓ src/components/JudgeScorecard.tsx— Example: judge scoring
✓ src/hooks/useBoutState.ts        — Real-time bout state hook
✓ supabase/config.toml             — Project config
✓ supabase/migrations/001_init_schema.sql — Database schema
✓ .env.example                     — Env template
✓ .github/workflows/deploy.yml     — Auto-deploy workflow
✓ SUPABASE_SETUP.md                — Detailed guide
✓ QUICK_START.md                   — This file
```

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "CORS error" | Add your domain to Supabase CORS settings |
| Real-time not updating | Ensure subscription unsubscribe is called on unmount |
| ".env.local not loading" | Restart `npm run dev`, prefix variables with `VITE_` |
| "Table doesn't exist" | Run the SQL migration in Supabase SQL Editor |
| "Can't find module @supabase/supabase-js" | Run `npm install @supabase/supabase-js` |

---

## Next: Tighten Security (Optional)

Once working, update RLS policies in `supabase/migrations/002_auth.sql`:

```sql
-- Only judges can see their own scorecards
CREATE POLICY "Judge sees own cards" 
ON judge_scorecards 
FOR SELECT 
USING (judge_id = auth.user_id());
```

Then run that migration in Supabase SQL Editor.

---

Good to go! Questions? Check `SUPABASE_SETUP.md` for detailed guide.
