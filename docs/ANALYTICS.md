# Fight Analytics — Engine A & Engine B

This module adds MMA live fight statistics and estimated round scoring to ScoreHub.
It sits **beside** the three-judge memory sheet and never touches it.

---

## Three things that are never mixed

| | What it is | Where it lives | Who writes it |
|---|---|---|---|
| **A. What happened** | Recorded fight statistics | `FightEvent`, `ControlInterval` | Statistician |
| **B. How it may be scored** | Analytical estimate | computed by `fightScoring.js` | The engine, never stored as truth |
| **C. What the officials decided** | Official result, fouls, deductions | `FightSession.officialResult`, `FoulRecord` | A human administrator |

Engine B reads A and never writes to it. Nothing in A or B can produce C.

---

## How the estimate works

### The hierarchy

```
Plan A   Effective striking + effective grappling
            │ even?
Plan B   Effective aggressiveness
            │ even?
Plan C   Control of the fighting area
```

Plans B and C are consulted **only** when the plan above them cannot separate the
corners. A fighter is never credited for walking forwards or standing in the centre.

### The margin rule

Winning a round is **10-9**. Widening to 10-8 or 10-7 is a claim about impact,
dominance and duration — not about counts.

**The engine will not widen a margin on statistics alone.** Escalation requires
qualitative evidence that somebody recorded: a knockdown, visible damage, a cut,
swelling, or an opponent forced into sustained defence. With none on file the estimate
caps at 10-9 and says so in its limitations.

This is tested directly. 60 significant strikes to 30 — the spec's own example —
returns 10-9:

```
✓ counts alone never produce 10-8
✓ even a huge statistical gap stays 10-9 without impact evidence
```

| Margin | Requires |
|---|---|
| 10-10 | No criterion separates the corners |
| 10-9 | Any round winner |
| 10-8 | Winner holds impact **and** (dominance or duration), with recorded impact evidence |
| 10-7 | All three, plus either 2+ knockdowns or a knockdown against an opponent with essentially no offence. Flagged as exceptional |

### Control time is not effective grappling

Control counts toward effective grappling **only** for intervals marked as having
offensive output. An operator holding somebody down for three minutes with nothing
recorded gets the control time reported but no grappling credit, and the UI says why.

### Confidence

Confidence describes **how complete the evidence is**, not how likely the official
judges are to agree. There is no validated predictive model here, so no percentage is
invented.

| Level | Meaning |
|---|---|
| High | 25+ events, control intervals tracked, observations present, round complete |
| Medium | 12+ events with either control or observations |
| Low | Fewer than 12 events |
| Insufficient | Nothing recorded, or an analyst flagged the round |

---

## Recording semantics

**One tap per action.** `*_landed` when it connects, `*_attempted` when it misses — the
UI labels these "landed" and "missed". Attempts are derived as misses + landed, so
accuracy is well defined and nothing is counted twice.

Statistics are **never stored as running totals**. Every number is aggregated from the
event log on read (`fightStats.aggregate`). Undo soft-deletes the event with a required
reason; the totals follow automatically, with no counter left behind.

---

## Integration with the existing app

Nothing in the judge path was modified. The two layers are separated at every level:

| | Judges (existing) | Analytics (new) |
|---|---|---|
| REST | `/api/bouts` | `/api/fights` |
| Socket room | `bout:<id>` | `analytics:<id>` |
| Socket events | `bout:* round:* score:*` | `fight:* stat:* clock:* control:* foul:* assess:*` |
| Collections | `scorecards` | `fightevents`, `fightsessions`, `controlintervals`, `foulrecords`, `roundassessments`, `auditlogs` |
| Clock | in memory | persisted in MongoDB |

A test asserts there are **zero** socket event-name collisions between the two.

Only three existing files were touched, each by a few lines:

- `server/src/app.js` — mount `/api/fights`
- `server/src/sockets/index.js` — register the analytics handlers
- `client/src/App.jsx`, `client/src/pages/BoutList.jsx` — add routes and links

### The fight clock

The judge memory sheet keeps its round timer in process. The analytics clock is stored
in `FightSession` and elapsed time is derived from a `runningSince` timestamp, so a
browser refresh, a redeploy or a Render cold start all resume at the right second.

---

## Screens

| Route | Purpose |
|---|---|
| `/bouts/:boutId/analytics` | Statistician and analyst workspace (6 tabs) |
| `/bouts/:boutId/live` | Public read-only live page |

Tabs: Live recording · Statistics · Round scoring intelligence · Estimated scorecard ·
Fouls & deductions · Official result.

---

## Where this deviates from the build spec

Three deliberate departures, each with a reason.

### 1. MongoDB, not Supabase

The spec asks for Supabase. ScoreHub already runs Express + Socket.IO + MongoDB on
Render, and you chose to extend that rather than migrate. Everything the spec wanted
from Supabase — normalised relations, realtime, indexing, validation, audit trail — is
implemented on the existing stack. The table list maps across directly:

| Spec table | Here |
|---|---|
| events / fights / fighters | existing `League`, `Bout`, `Fighter` |
| fight_rounds | `FightSession.roundLog` |
| fight_events | `FightEvent` |
| fight_statistics | derived, not stored (by design) |
| control_intervals | `ControlInterval` |
| foul_records + point_deductions | `FoulRecord` |
| round_assessments + estimated_scorecards | `RoundAssessment` |
| audit_logs | `AuditLog` |
| users / rulesets / ruleset_versions | not implemented — see below |

### 2. Roles are a console selector, not enforced permissions

The spec asks for role-based permissions enforced on the backend. **This app has no
authentication** — you removed it deliberately so the site could be public, and asked
not to change the deployment or auth architecture.

So the role picker on the analytics screen is a **UI convenience, not a security
boundary**. The one thing enforced server-side is that a socket joined as `public`
cannot emit recording events. Everything else is open, exactly like the rest of
ScoreHub.

If you later need real roles, that means reintroducing authentication: a user model, a
login route, `protect`/`restrictTo` middleware on `/api/fights`, and a socket handshake
check. The structure is ready for it — every service call already takes an `actor`
string that currently comes from the console selector and would come from a verified
session instead.

### 3. The Unified Rules PDF was not available

The spec says to read the attached *Unified MMA Rules — Revised July 2024* PDF. It was
not attached to this session, so the engine implements the criteria **exactly as the
build spec itself describes them** in sections 6A–6D: the 10-point must system, the
Plan A/B/C hierarchy, and impact/dominance/duration.

Nothing was invented from memory about the text of the rules. Before using this at a
real event, check `COMPARISON`, `GRAPPLING_WEIGHTS` and `IMPACT_WEIGHTS` at the top of
`fightScoring.js` against the governing document for your commission — they are
exported constants, grouped and commented so they can be audited and retuned without
touching the control flow.

### Also not yet built

The first drop covers the core engines and dashboards. Still open from the spec:

- Multi-event admin dashboard with aggregate counts (events, fighters, live fights)
- Configurable ruleset module with jurisdiction versioning
- Data export
- Extended fighter profile fields (reach, stance, DOB, coach, KO/sub/decision splits)
- Audit log viewer UI — the API (`GET /api/fights/:id/audit`) and the writes exist

---

## Testing

```bash
npm test          # 72 checks, no database needed
npm run test:e2e  # full server + sockets, needs MongoDB
```

| Suite | Covers |
|---|---|
| `logic.test.mjs` (25) | Existing judge scoring, unchanged |
| `fight-stats.test.mjs` (21) | Counting rules: no double counting, accuracy, control time, undo |
| `scoring-engine.test.mjs` (26) | Spec scenarios A–J, the hierarchy, margin guards, deductions, confidence |

The scenario suite maps to spec section 16. Two bugs were caught by writing it: the
10-7 threshold was initially too loose, and the attempted/landed relationship was
ambiguous enough to produce accuracies above 100%.

---

## API

```
GET    /api/fights/meta                        event types, foul list, criteria
GET    /api/fights/:boutId/snapshot            everything a dashboard needs
GET    /api/fights/:boutId/stats?round=        derived statistics
GET    /api/fights/:boutId/clock
POST   /api/fights/:boutId/clock/:action       start|pause|reset|set|next-round
GET    /api/fights/:boutId/events?round=
POST   /api/fights/:boutId/events
POST   /api/fights/:boutId/events/:id/void     reason required
GET    /api/fights/:boutId/control?round=
POST   /api/fights/:boutId/control/start|stop|mark-active
GET    /api/fights/:boutId/fouls?round=
POST   /api/fights/:boutId/fouls
POST   /api/fights/:boutId/fouls/:id/void      reason required
GET    /api/fights/:boutId/estimate/:roundNo
GET    /api/fights/:boutId/scorecard
GET    /api/fights/:boutId/assessment/:roundNo
PUT    /api/fights/:boutId/assessment/:roundNo analyst overrides
POST   /api/fights/:boutId/result              official result, human only
GET    /api/fights/:boutId/audit
```
