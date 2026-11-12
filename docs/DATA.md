# Events, fighters and photos

All the event data lives in **one file**:

```
client/public/data/wds-roster.json
```

The MongoDB seed reads it, and the client's offline demo mode reads the very
same file. Change it once and both follow.

---

## What is real and what is not

| | Source |
|---|---|
| **Events** — names, dates, venues | Real. Taken from [wdsmma.com](https://www.wdsmma.com) on 12 Nov 2026. |
| **Fighters** — names, teams, records | **Placeholder.** WDS does not publish a roster, so these carry over from the previous ScoreHUB demo data and are extended in the same style. |
| **Results** on past cards | **Placeholder**, invented so the Past League screens have outcomes to show. |

Replace the fighters and results with the real cards before showing this to
anyone who might take it as a record of what happened.

> One thing to check: your site lists **WDS Rising Star 8** (24–25 Oct 2026)
> under *Upcoming*, but that date has passed, so ScoreHub files it under Past
> League. If the date is wrong, fix it in the JSON.

---

## Adding fighter photos

1. Put a JPG in `client/public/fighters/`
2. Name it exactly as listed in `client/public/fighters/FILENAMES.txt`

That's it. No code change, no data change. The photo appears on the fighter
list, the bout builder and the public fight page.

```
client/public/fighters/
├── FILENAMES.txt          every filename the roster expects
├── arjun-rane.jpg
├── kabir-shaikh.jpg
└── …
```

**Until a file exists** the UI shows the fighter's initials on a corner-tinted
tile rather than a broken image, so a half-finished photo set still looks
deliberate.

Square images, at least 400×400, under about 200 KB each.

A fighter who appears on more than one card shares one photo file — the roster
gives them a separate record per event but the same image.

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

```bash
npm run seed                                  # local
MONGO_URI="mongodb+srv://…" npm run seed      # Atlas
```

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
