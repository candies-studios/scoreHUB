# Tournaments (Smoothcomp-style events)

ScoreHub's original features run a **fight night**: one league, a card of bouts, three
judges per bout. The tournament module adds the other half of combat-sports software —
**open-entry events** in the style of Smoothcomp: athletes register into divisions, the
software draws brackets, spreads matches across mats, runs a live scoreboard per mat, and
turns results into medal tables and rankings.

Both halves share the same server, database and Socket.IO connection, but nothing in this
module touches leagues, bouts or the judges' scorecards.

## The flow

| Step | Who | Where |
|---|---|---|
| 1. Create the event — dates, venue, fee, registration window, number of mats | Organiser | `/events/new` |
| 2. Create divisions — tick genders × age groups × belts × weight classes (IBJJF classes built in) | Organiser | `/events/:id/manage` → Divisions |
| 3. Athletes register — new profile or existing one; academy is created/matched by name | Athlete | `/events/:id?tab=register` |
| 4. Approve, mark paid, check in, weigh in (over-limit weigh-ins are flagged), seed | Organiser | Manage → Registrations |
| 5. Draw brackets — one division or all at once | Organiser | Manage → Brackets & mats |
| 6. Auto-schedule mats — divisions balanced across mats, early rounds first | Organiser | same |
| 7. Score each match live on the mat; open a TV display beside it | Table worker | `/matches/:id/scoreboard`, `/matches/:id/display` |
| 8. Follow along — brackets, mat queues, live matches | Public | `/events/:id?tab=brackets`, `?tab=schedule`, `/events/:id/mats/:n` |
| 9. Results, academy medal table, athlete and academy rankings | Public | `?tab=results`, `/rankings`, `/athletes/:id`, `/academies/:id` |

## Brackets

`server/src/utils/brackets.js` is pure and unit-tested (`server/test/brackets.test.mjs`).

- **Single elimination** with standard seed order (1 and 2 can only meet in the final).
  Byes go to the top seeds and auto-advance. Both beaten semi-finalists take bronze
  (IBJJF style, no third-place match).
- **Team-mates are kept apart**: unseeded entrants are dealt out one academy at a time, so
  athletes from the same academy land in different halves/quarters.
- **Round robin** for small divisions. On `Auto`, 3–4 athletes get a round robin, 2 or 5+
  get elimination. Standings: wins → wins by submission → points difference → head-to-head.
- **Redraw protection**: once a real match has been played, redrawing needs an explicit
  confirmation (`force`).
- Reopening a result is allowed until the winner has started their next match; it pulls
  them back out of the next match.

## Scoreboard

BJJ scoring: +2 / +3 / +4 points, advantages, penalties, and a server-side clock, so any
number of screens show the same second. The winner by scoreboard is points → advantages →
fewer penalties; a level scoreboard requires a referee's decision. Finishes: submission
(with type), DQ, walkover, injury.

Keyboard on the table controller: `Space` start/pause, `1/2/3` = +2/+3/+4 top athlete,
`8/9/0` = +2/+3/+4 bottom athlete.

Socket channel (separate from the judge `bout:*` and analytics `fight:*` channels):

| client → server | server → client |
|---|---|
| `match:join {matchId}` | `match:state` (full match view) |
| `match:score {matchId, side, field, delta}` | `mat:update {mat, matchId}` |
| `match:clock {matchId, action: start\|pause\|reset\|set, value}` | `match:error` |
| `match:finish {matchId, winner?, method, submissionType?}` | |
| `match:reopen {matchId}` · `mat:watch {tournamentId, mat}` | |

## Rankings

Every finished division awards **9 / 3 / 1** points for gold / silver / bronze. The athlete
ranking sums these across events (filter by sport, gender, belt); the academy ranking sums
its athletes. The per-event academy medal table uses the same points.

## API

```
GET/POST        /api/tournaments                ?scope=upcoming|past|all&q=&sport=
GET/PUT/DELETE  /api/tournaments/:id
GET/POST        /api/tournaments/:id/divisions
POST            /api/tournaments/:id/divisions/generate
GET/POST        /api/tournaments/:id/registrations
POST            /api/tournaments/:id/brackets   draw all open divisions
GET/POST        /api/tournaments/:id/schedule   GET mats (?mat=n) / POST auto-schedule
GET             /api/tournaments/:id/results

PUT/DELETE      /api/divisions/:id
GET/POST/DELETE /api/divisions/:id/bracket
PATCH/DELETE    /api/registrations/:id

GET             /api/matches/:id
POST            /api/matches/:id/result | /reopen | /score | /clock

GET/POST        /api/athletes        GET/PUT/DELETE /api/athletes/:id   (GET = full profile)
GET/POST        /api/academies       GET/PUT/DELETE /api/academies/:id
GET             /api/rankings/athletes   /api/rankings/academies
```

## Try it

```bash
npm run seed:events   # 6 academies, 48 athletes, one finished event, one open for registration
npm run dev
```

Open http://localhost:5173/events.

Tests:

```bash
npm test                                              # includes the bracket engine
MONGO_TEST_URI=mongodb://127.0.0.1:27017/scorehub_events_test npm run test:events
```

## Not built (yet)

Smoothcomp also has payments, athlete accounts and logins, team/federation memberships,
livestream recording and a native app. ScoreHub stays login-free like the rest of the app
(see *Locking it down* in the README): the organiser panel is open to anyone who can reach
the server. Entry fees are tracked with a "paid" tick, not collected.
