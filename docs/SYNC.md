# Keeping ScoreHub in step with wdsmma.com

ScoreHub reads its events from the main site, so adding an event there makes it
appear in the dashboard without touching this repo.

---

## How it runs

`.github/workflows/sync-wds.yml` runs **daily at 07:30 IST** and on demand from
the Actions tab. Each run:

1. Reads `https://wdsmma.com/pages/events.html`
2. Reads each readable fight card page
3. Reports what differs from the committed data
4. Regenerates `client/public/data/wds-roster.json` and runs the tests
5. **Opens a pull request** if anything changed

It opens a PR rather than pushing to `main` on purpose. A scraper that silently
rewrites your event data is worse than one you approve once a day, and the PR
shows exactly what changed before it ships.

Run it yourself any time:

```bash
npm run sync:check    # report only, writes nothing
npm run sync          # update the data
```

---

## What it can and cannot read

| Page | Readable | Why |
|---|---|---|
| `/pages/events.html` | ✅ | Static HTML |
| `/pages/wds-fight-night-19.html` | ✅ | Static HTML with fighter images |
| `/pages/event.html?e=…` | ❌ | Card is built by JavaScript |
| `warriorsdreamseries.com/…` | ❌ | Fully client-rendered |

A page it cannot read is reported as *card unavailable* and the event's
existing bouts are **left alone** — it never wipes a card that was entered by
hand, and never invents one.

If the events index parses to **zero** events, the tool writes nothing and
exits non-zero, so a markup change on wdsmma.com shows up as a failed Action
rather than as quietly deleted events.

---

## The robust alternative: a JSON feed

Scraping breaks whenever markup changes. Because you own wdsmma.com, there is a
much better option: publish a small JSON file there and ScoreHub reads that
instead, skipping HTML parsing entirely.

Set the `WDS_FEED_URL` environment variable (or a repository variable of the
same name) to its address, e.g. `https://wdsmma.com/assets/data/events.json`.

### Format

```jsonc
{
  "events": [
    {
      "name": "WDS Fight Night 19",
      "date": "2026-12-12",          // ISO, first day for multi-day events
      "time": "17:00",               // 24-hour, optional
      "venue": "CIDCO Exhibition, Vashi, Navi Mumbai",
      "url":  "https://wdsmma.com/pages/wds-fight-night-19.html",
      "ended": false,
      "bouts": [
        {
          "weightClass": "Welterweight",
          "position": "Main Event",   // optional
          "blue": {
            "name": "Adnan Khan",
            "country": "India",
            "weightKg": 77.1,
            "photo": "https://wdsmma.com/assets/images/fight-night-19/adnan-khan.webp"
          },
          "red": { "name": "Pratik Shetty", "country": "India", "weightKg": 77.1,
                   "photo": "…/pratik-shetty.webp" },
          "result": {                 // omit until the bout is over
            "winnerCorner": "blue",
            "method": "Unanimous Decision",
            "endedRound": 3,
            "endedAtSec": 300
          }
        }
      ]
    }
  ]
}
```

Only `name` and `date` are required. With a feed in place every event syncs,
including the six whose cards cannot currently be scraped, and results flow
through to Past League automatically.

---

## Where the data lands

```
wdsmma.com
    │  sync-wds.mjs
    ▼
tools/wds-source.mjs          the captured data, in version control
    │  build-roster.mjs
    ▼
client/public/data/wds-roster.json
    ├──► the client reads it directly in read-only mode
    └──► the server seeds MongoDB from it on first boot
```

One file feeds both, so the database and the no-backend site can never disagree.

---

## If the sync breaks

The parsers are tested against fixtures (`server/test/sync-parsers.test.mjs`),
but fixtures only prove the date, time, link and pairing logic — **not** that
the selectors still match the live markup. A redesign of wdsmma.com will need
the parser updated.

When that happens the Action fails loudly with the page it could not parse.
Update `parseEventsIndex` or `parseFightCard` in `tools/sync-wds.mjs`, add a
fixture for the new markup, and the tests cover it from then on.

Switching to the JSON feed above removes this failure mode entirely.
