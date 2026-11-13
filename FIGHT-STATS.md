# Fight Stats Sheet

A second live sheet next to the judges' **Memory Sheet**. While a bout is live, an
official records every strike, takedown, submission attempt, reversal and knockdown,
and runs a control clock. Every tablet sees the same numbers in real time, and the
sheet turns them into a **performance score** for each fighter and a **projected
10-point card**.

The ScoreHUB app bundle is not rebuilt. Like `supabase-bridge.js`, the sheet is a
separate script that adds a **Fight Stats** button to the Memory Sheet
(`#/bouts/:id/score`) and the Scoreboard (`#/bouts/:id/scoreboard`).

## Setup (once)

1. Open the WDS Supabase project → **SQL Editor**.
2. Paste and run `config/migrations/002_fight_stats.sql`. It is safe to run again.
3. Push this repo. GitHub Pages serves the new `fight-stats.js`.

Until step 2 is done, the sheet opens but shows "Fight stats are not set up in the
database yet".

## Files

| File | What it does |
| --- | --- |
| `fight-stats.js` | The sheet: button, recording pads, stats table, scoring. |
| `index.html` | Loads `fight-stats.js` right after `supabase-bridge.js`. |
| `config/migrations/002_fight_stats.sql` | Tables `bout_stats` and `bout_stat_events`, the RPCs, security, Realtime. |

## Who can record

The same people who can run the bout: **management (Admin/Promoter)**, the bout's
**referee**, and the **judges seated on it**. Officials record while the bout is
**LIVE**. Management can also correct a finished bout until its result is made
**final**. Every signed-in official can view. Writes go only through database
functions, so nobody can edit the tables directly.

## Recording (one tap = one event)

For each corner:

- **Striking**: pick the target (Head / Body / Leg) and the position (Distance /
  Clinch / Ground) once; they stay selected. Then tap
  - **Sig. strike landed**: counts sig. landed + attempted, total landed + attempted,
    the target and the position
  - **Sig. strike missed**: counts sig. attempted + total attempted
  - **Other strike landed / missed**: non-significant strikes (total only)
- **Knockdown**: counts the KD and a significant strike to the selected target.
- **Takedown landed / missed**, **Sub. attempt**, **Reversal**.
- **Control**: Start / Stop. Only one fighter can be in control: starting one corner
  stops the other. The clock stops by itself when the round clock stops or runs out.
  Use −10s / +10s to correct it.
- **Undo last** undoes your own last tap (any corner), on every tablet.

The sheet records into the live round and follows the round automatically. Tap a
round tab to correct an earlier round.

Discipline: **BJJ** shows only grappling pads; **K1** shows striking and knockdowns.

## What the sheet shows

**1 · Striking statistics**: SIG. STR. (landed of attempted), SIG. STR. %, TOTAL STR.,
HEAD, BODY, LEG, DISTANCE, CLINCH, GROUND

**2 · Grappling statistics**: TD (landed of attempted), TD %, SUB. ATT, REV, CTRL

**3 · Fight performance statistics**: knockdowns, sig. strikes landed and attempted,
total strikes landed and attempted, takedowns landed and attempted, submission
attempts, fight duration, control time

You can view the whole fight or any round. The leading number in each row is in bold.

## Scoring

Performance score per fighter (per round, and the whole fight):

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

**Projected 10-point card**, per round: the higher score wins 10-9. Within 1 point it
is 10-10. It is 10-8 when the gap is 20+ points and the winner has at least double the
score, or the winner has 2+ more knockdowns in the round. The round cards add up to a
bout card (for example 30-27).

These numbers **do not change the judges' decision**. The official result still comes
from the judges' cards and the referee's finish.

### Tuning the formula

Add this to the config block in `index.html`. No rebuild is needed:

```js
fightStats: {
  weights: { sigLanded: 1, headBonus: 0.5, bodyBonus: 0.25, legBonus: 0, otherLanded: 0.25,
             kd: 10, tdLanded: 3, subAtt: 3, rev: 2, ctrlPerMinute: 2 },
  round:   { evenMargin: 1, dominantMargin: 20, kdLeadFor108: 2 },
  // enabled: false,   // hides the sheet
},
```

## Data

- `bout_stats`: one row per bout × round × corner, with running totals and the
  control clock (`ctrl_started_at`). Realtime is on.
- `bout_stat_events`: every tap (who, when, what), used for undo and audit.
- `reset_bout` also clears the bout's stats. Deleting a bout deletes its stats.
- RPCs: `bout_stats_record`, `bout_stats_undo`, `bout_stats_control`,
  `bout_stats_adjust_control`, `bout_stats_can_record`.
