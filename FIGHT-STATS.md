# Strike Sheet

A live sheet for **stat counters**, alongside the judges' Memory Sheet. While a bout
is live, the counters assigned to it record every strike, takedown, submission
attempt, reversal and knockdown, and run a control clock. All counters on a bout
share **one tally**, so they can split the work (for example, one counter per
corner). Every tablet sees the same numbers in real time.

The numbers give each fighter a **stats share** for the bout, and that share is now
part of the **WDS ranking score**. The judges' cards still decide every bout.

## Setup (once)

1. **Database.** Supabase → project **zxqaolyckzgaqohpiwtk** → SQL Editor. Run these in order:
   - `config/migrations/002_fight_stats.sql`
   - `config/migrations/003_strike_sheet_and_rankings.sql`
   - `config/migrations/004_strike_sheet_links.sql`

   Both are safe to run again.
2. **ScoreHUB repo** (`candies-studios/scoreHUB`), root folder: `index.html`,
   `strike-sheet.html`, `fight-stats.js`, `supabase-bridge.js`, `FIGHT-STATS.md`,
   plus the two SQL files in `config/migrations/`.
3. **WDS website repo** (`candies-studios/warriors-dream-series`):
   `pages/rankings.html`, `admin-dashboard.html`, `js/admin-dashboard.js`.

## Who does what

| Person | Where | What they can do |
| --- | --- | --- |
| Management (Admin / Promoter) | `strike-sheet.html` | Add stat counters, assign them to bouts, record and correct stats |
| Stat Counter (new role) | `strike-sheet.html` | Record on the bouts assigned to them, while the bout is live |
| Judges, referees | ScoreHUB → Memory Sheet → **Strike Sheet** button | View the stats |

**Adding a counter:** on the Strike Sheet page, use *Add a stat counter* (name and
email), or the WDS dashboard → Officials → role *Stat Counter*. The counter signs in
on the Strike Sheet page with their name. The first time, the PIN they choose
becomes theirs.

**Assigning counters:** on the Strike Sheet page, tap **Counters** on a bout and tick
the people. You can assign someone before their first sign-in.

## Share link (no sign-in on fight night)

Management can share the Strike Sheet with someone who has no account. Tap
**Share link** in either of these places:

- on an event in the Strike Sheet page's bout list, or
- in the top bar of any bout's sheet (the same button inside ScoreHUB).

You get two links to copy and send (WhatsApp, SMS…):

- **This bout**: `…/strike-sheet.html#/t/<code>/bout/<bout id>` opens that bout's sheet
  directly.
- **Whole event**: `…/strike-sheet.html#/t/<code>` lists the event's bouts, live ones
  first, and the recorder taps one.

The link opens **the same sheet as inside ScoreHUB** and records into **the same
tally**. Taps from a link, from signed-in counters and from management all show on
every screen within a couple of seconds. Like a counter, a link can record only
while a bout is live. *Undo last* undoes that phone's own last tap.

The link works until **06:00 IST the morning after the event** (at least 24 hours
from when you made it). **New link** replaces it, so the old link stops working.
**Turn off link** stops it straight away. Anyone holding the link can record, so
share it only with your recorders.

## Getting to the sheet

- `https://candies-studios.github.io/scoreHUB/strike-sheet.html`: sign in, then pick
  a bout. Live bouts are listed first.
- In ScoreHUB's bout list, each bout has a **Strike Sheet** link under *Memory Sheet*.
- On a Memory Sheet or Scoreboard, use the **Strike Sheet** button in the bottom-right
  corner.

## Recording (one tap = one event)

For each corner:

- **Striking.** Pick the target (Head / Body / Leg) and the position (Distance /
  Clinch / Ground) once; they stay selected. Then tap:
  - **Sig. strike landed**: counts sig. landed + attempted, total landed + attempted,
    the target and the position
  - **Sig. strike missed**: counts sig. attempted + total attempted
  - **Other strike landed / missed**: non-significant strikes (counted in the totals only)
- **Knockdown**: counts the KD and a significant strike to the selected target.
- **Takedown landed / missed**, **Sub. attempt**, **Reversal**.
- **Control**: tap Start / Stop. Only one fighter can be in control at a time. The
  clock stops by itself when the round clock stops or runs out. Use −10s / +10s to
  correct it.
- **Undo last** undoes your own last tap.

The sheet records into the live round. Tap a round tab to correct an earlier round.

## What the sheet shows

**1 · Striking statistics**: SIG. STR. (landed of attempted), SIG. STR. %, TOTAL STR.,
HEAD, BODY, LEG, DISTANCE, CLINCH, GROUND

**2 · Grappling statistics**: TD (landed of attempted), TD %, SUB. ATT, REV, CTRL

**3 · Fight performance statistics**: knockdowns, sig. strikes landed and attempted,
total strikes landed and attempted, takedowns landed and attempted, submission
attempts, fight duration, control time

You can view the whole fight or a single round. The sheet also shows each fighter's
performance score and a projected 10-point card from the stats (for information only).

## Scoring and rankings

**Stat points** (editable in WDS dashboard → Rankings → Stat Points):

| Stat | Points |
| --- | --- |
| Significant strike landed | 1 |
| + to the head / body / leg | +0.5 / +0.25 / +0 |
| Other (non-significant) strike landed | 0.25 |
| Knockdown | 10 |
| Takedown landed | 3 |
| Submission attempt | 3 |
| Reversal | 2 |
| Control time | 2 per minute |

**Stats share** in a bout = the fighter's points ÷ both fighters' points × 100.
For example, 30 points to 10 gives 75 and 25. A share of 50 means an even fight.

**Ranking score** (editable in WDS dashboard → Rankings → Ranking Formula):

```
Score = (Win% × 0.6 + Win Method Weight × 0.3 + Stats × 0.1) × √(total fights)
```

- **Stats** is the fighter's average stats share over their finalized fights that
  have strike stats.
- A fighter with no recorded stats counts as **50** (even), so older fights neither
  help nor hurt.
- Only finalized results count, as before. Rankings recalculate automatically when a
  result is finalized or a weight changes.
- To go back to the committee formula, set the weights to 0.7 / 0.3 / 0.

## Data

- `bout_stats`: one row per bout × round × corner (running totals and the control clock).
- `bout_stat_events`: every tap (who, when, what), used for undo and audit.
- `bout_stat_counters`: who counts on which bout (by email).
- `strike_sheet_links`: share links (event, code, expiry, turned off). Taps made
  through a link are logged with the phone's device id instead of an account.
- `stat_score_weights`, `ranking_formula`: the editable weights.
- `public_bout_stats`: public stats of finalized bouts (website).
- `fighter_rankings.stats_score`, `bout_points.stats_share`: the stats part of the rankings.
- `reset_bout` also clears a bout's stats.
