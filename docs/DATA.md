# Events, fighters and photos

All the event data lives in **one file**:

```
client/public/data/wds-roster.json
```

The MongoDB seed reads it, and the client's offline demo mode reads the very
same file. Change it once and both follow.

---

## What is real and what is not

Everything in ScoreHub now comes from wdsmma.com. Nothing is invented.

| | Status |
|---|---|
| **All 7 events** — names, dates, venues | Real, from `/pages/events.html` |
| **WDS Fight Night 19** — 15 bouts, 29 fighters | Real, from `/pages/wds-fight-night-19.html` |
| **Fighter photos** | Real, hotlinked from `wdsmma.com/assets/images/<event>/` |
| **The other 6 events' cards** | **Not imported.** See below. |

### Why six cards are missing

Their fight cards cannot be read by any fetcher:

- **WDS Rising Star 8** — `/pages/wds-rising-star-8.html` now redirects to
  `/pages/event.html?e=…`, which builds its card with JavaScript. Fetching it
  returns "Loading the fight card…" and nothing else.
- **The five ended events** — results live on `warriorsdreamseries.com`, which
  is fully client-rendered. Fetching returns an empty shell.

Those events appear in ScoreHub with their real name, date and venue and an
empty card, marked `cardImported: false`. They are deliberately left empty
rather than filled with plausible-looking fighters.

To fill them: add the bouts to `tools/wds-source.mjs` by hand, or publish a
JSON feed (below) and the sync picks them up on its own.

> One thing to check: your site lists **WDS Rising Star 8** (24–25 Oct 2026)
> under *Upcoming*, but that date has passed, so ScoreHub files it under Past
> League. If the date is wrong, fix it in the JSON.

---

## Fighter photos

Photos are **hotlinked from wdsmma.com**, so there is nothing to copy and
nothing to keep in sync:

```
https://wdsmma.com/assets/images/fight-night-19/adnan-khan.webp
```

Update a photo on the main site and ScoreHub shows the new one. If an image is
missing or fails to load, the UI falls back to the fighter's initials on a
corner-tinted tile rather than a broken image.

To use your own files instead, put them in `client/public/fighters/` and set
`photo` to a relative path like `fighters/adnan-khan.jpg`. Both forms work —
absolute URLs resolve as-is, relative ones resolve against the site.

---

## Editing the data

### By hand

Open `client/public/data/wds-roster.json` and edit. The shape:

```jsonc
{
  "leagues":  [{ "id", "name", "series", "date", "time", "location", "promoter", "bouts" }],
  "fighters": [{ "id", "league", "name", "team", "weightClass", "record", "photo" }],
  "officials":[{ "id", "league", "kind", "name", "contactNo", "bloodGroup" }],
  "bouts":    [{ "id", "league", "boutNo", "boutName", "boutType", "discipline",
                 "totalRounds", "roundDurationSec", "blueFighter", "redFighter",
                 "judges", "referee", "result" }]
}
```

`league`, `blueFighter`, `redFighter`, `judges` and `referee` hold **ids** from
the other arrays. `npm test` checks every one of those references resolves, so
a typo fails the build rather than producing an empty screen.

### By regenerating

Edit the `EVENTS` and `CARDS` tables at the top of `tools/build-roster.mjs`,
then:

```bash
npm run roster      # rewrites client/public/data/wds-roster.json
npm test            # verifies the references still line up
```

### Loading it into MongoDB

**The server seeds itself.** On boot, if the database has zero leagues, it loads
the roster automatically and logs that it did. That is deliberate: Render's free
tier gives you no shell, so there is otherwise no way to populate a fresh Atlas
cluster, and the site comes up looking functional but empty.

It only ever touches a database with no leagues in it, so it cannot overwrite
real data. Turn it off with `AUTO_SEED=false`.

To load it by hand instead:

```bash
npm run seed                                  # local
MONGO_URI="mongodb+srv://…" npm run seed      # Atlas
```

Unlike auto-seed, `npm run seed` **wipes first** and reloads from scratch.

Past events are seeded as `completed` bouts carrying their result, so Past
League shows real outcomes rather than empty cards.

---

## Past vs upcoming

Nothing marks an event as past or upcoming. `GET /api/leagues?scope=past|upcoming`
compares the event **date** with today, and the demo backend does the same. So an
event moves from Upcoming League to Past League on its own, the morning after it
runs.

---

## Demo mode

With no `API_URL` set, the client serves the browsing screens from this JSON and
shows an orange banner saying so.

| | Demo mode | With a backend |
|---|---|---|
| Browse events, fighters, bouts | ✅ | ✅ |
| Fighter photos | ✅ | ✅ |
| Past / upcoming split | ✅ | ✅ |
| Add or edit anything | ❌ reports it needs a backend | ✅ |
| Judge memory sheet | ❌ | ✅ |
| Live stats & scoring engine | ❌ | ✅ |

Demo mode is a legitimate way to publish — the site says what it is rather than
appearing broken. To connect a real backend, set the `API_URL` repository
variable (see the Deploying section of the README).
