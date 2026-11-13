# File Manifest — What to Copy Where

This document shows every file you need to add to your ScoreHUB repo for Supabase integration.

---

## Directory Structure

After copying all files, your repo should look like this:

```
ScoreHUB/
├── .env.example                    ← Copy: .env.example
├── .env.local                      ← Create new (ignored in git)
├── .gitignore                      ← Update: add .env.local
├── SUPABASE_SETUP.md               ← Copy: Detailed setup guide
├── QUICK_START.md                  ← Copy: TL;DR version
├── FILE_MANIFEST.md                ← Copy: This file
├── package.json                    ← Update: add @supabase/supabase-js dependency
│
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Copy: GitHub Actions workflow
│
├── supabase/
│   ├── config.toml                 ← Copy: Supabase project config
│   └── migrations/
│       └── 001_init_schema.sql     ← Copy: Database schema
│
├── src/
│   ├── lib/
│   │   ├── supabase.ts             ← Copy: Main Supabase client
│   │   └── (existing files...)
│   │
│   ├── hooks/
│   │   ├── useBoutState.ts         ← Copy: Real-time state hook
│   │   └── (existing files...)
│   │
│   ├── components/
│   │   ├── LeagueList.tsx          ← Copy: Example league listing
│   │   ├── BoutList.tsx            ← Copy: Example bout listing + real-time
│   │   ├── JudgeScorecard.tsx      ← Copy: Example judge scoring
│   │   └── (existing files...)
│   │
│   └── (rest of your src...)
│
└── (rest of your repo files...)
```

---

## Copy Instructions

### Step 1: Copy Library Files

Copy the Supabase client and helpers:

```bash
# From the files provided to your repo:
cp src/lib/supabase.ts <your-repo>/src/lib/supabase.ts
```

### Step 2: Copy Configuration Files

```bash
# Create supabase folder if it doesn't exist
mkdir -p <your-repo>/supabase/migrations

# Copy config
cp supabase/config.toml <your-repo>/supabase/config.toml

# Copy schema migration
cp supabase/migrations/001_init_schema.sql <your-repo>/supabase/migrations/001_init_schema.sql
```

### Step 3: Copy Hook

```bash
# Create hooks folder if it doesn't exist
mkdir -p <your-repo>/src/hooks

# Copy the state management hook
cp src/hooks/useBoutState.ts <your-repo>/src/hooks/useBoutState.ts
```

### Step 4: Copy Example Components

These are optional — they show how to use Supabase in your UI:

```bash
cp src/components/LeagueList.tsx <your-repo>/src/components/LeagueList.tsx
cp src/components/BoutList.tsx <your-repo>/src/components/BoutList.tsx
cp src/components/JudgeScorecard.tsx <your-repo>/src/components/JudgeScorecard.tsx
```

### Step 5: Copy Environment Template

```bash
cp .env.example <your-repo>/.env.example
```

### Step 6: Create `.env.local`

This file is NOT copied — you create it locally:

```bash
# In your repo root, create .env.local with your Supabase credentials:
cat > <your-repo>/.env.local << 'EOF'
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
EOF
```

Then add to `.gitignore`:

```bash
echo ".env.local" >> <your-repo>/.gitignore
```

### Step 7: Copy GitHub Actions Workflow

```bash
# Create .github/workflows folder if it doesn't exist
mkdir -p <your-repo>/.github/workflows

# Copy the deployment workflow
cp .github/workflows/deploy.yml <your-repo>/.github/workflows/deploy.yml
```

### Step 8: Copy Documentation

```bash
cp SUPABASE_SETUP.md <your-repo>/SUPABASE_SETUP.md
cp QUICK_START.md <your-repo>/QUICK_START.md
cp FILE_MANIFEST.md <your-repo>/FILE_MANIFEST.md
```

### Step 9: Update package.json

Add these dependencies to your existing `package.json`:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

Then install:

```bash
npm install @supabase/supabase-js
```

---

## File Descriptions

### Core Library

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Main Supabase client initialization and all API helper functions |

### Configuration

| File | Purpose |
|------|---------|
| `supabase/config.toml` | Supabase project configuration (optional, for CLI) |
| `supabase/migrations/001_init_schema.sql` | Database schema to run in Supabase SQL Editor |

### Hooks (State Management)

| File | Purpose |
|------|---------|
| `src/hooks/useBoutState.ts` | React hook for managing bout real-time state |

### Example Components

| File | Purpose | Use Case |
|------|---------|----------|
| `src/components/LeagueList.tsx` | List leagues from Supabase | Reference for GET + DELETE patterns |
| `src/components/BoutList.tsx` | List bouts with real-time updates | Reference for JOIN queries + real-time subscriptions |
| `src/components/JudgeScorecard.tsx` | Judge scoring interface | Reference for INSERT/UPDATE + real-time callbacks |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables (commit this) |
| `.github/workflows/deploy.yml` | Auto-deploy to GitHub Pages on push |

### Documentation

| File | Purpose |
|------|---------|
| `SUPABASE_SETUP.md` | Detailed 9-step integration guide |
| `QUICK_START.md` | TL;DR version for quick reference |
| `FILE_MANIFEST.md` | This file — what goes where |

---

## Checklist

After copying everything:

- [ ] Copied `src/lib/supabase.ts`
- [ ] Copied `supabase/config.toml` and `supabase/migrations/001_init_schema.sql`
- [ ] Copied `src/hooks/useBoutState.ts`
- [ ] Copied example components (LeagueList, BoutList, JudgeScorecard)
- [ ] Created `.env.local` with your Supabase credentials
- [ ] Added `.env.local` to `.gitignore`
- [ ] Copied GitHub Actions workflow to `.github/workflows/deploy.yml`
- [ ] Copied documentation files (SUPABASE_SETUP.md, QUICK_START.md)
- [ ] Updated package.json to include `@supabase/supabase-js`
- [ ] Ran `npm install @supabase/supabase-js`
- [ ] Ran the SQL migration in Supabase SQL Editor
- [ ] Updated your existing components to use Supabase helpers instead of fetch()

---

## What NOT to Commit to Git

These files contain secrets or local config — **DO NOT COMMIT**:

```
.env.local
.env.*.local
node_modules/
.DS_Store
```

Your `.gitignore` should already have these covered.

---

## Questions?

- **"Where do I find my Supabase credentials?"** → See SUPABASE_SETUP.md Step 1
- **"How do I replace my API calls?"** → See SUPABASE_SETUP.md Step 6
- **"How do real-time subscriptions work?"** → See SUPABASE_SETUP.md Step 7
- **"I just want a quick overview"** → Read QUICK_START.md

All docs are in the root of this file bundle.
