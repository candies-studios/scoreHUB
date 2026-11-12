/**
 * Roster integrity.
 *
 * The same JSON feeds the MongoDB seed and the client's offline demo, so a
 * broken reference here breaks both at once — and only at runtime. These
 * checks catch it at test time instead.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROSTER = path.resolve(__dirname, '../../client/public/data/wds-roster.json');

const pass = [];
const t = (name, fn) => {
  try {
    fn();
    pass.push(name);
  } catch (e) {
    console.log('   ✗', name, '—', e.message);
    process.exitCode = 1;
  }
};

assert.ok(fs.existsSync(ROSTER), `roster missing at ${ROSTER} — run node tools/build-roster.mjs`);
const data = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));

const leagueIds = new Set(data.leagues.map((l) => l.id));
const fighterIds = new Set(data.fighters.map((f) => f.id));
const officialIds = new Set(data.officials.map((o) => o.id));

/* ---------- shape ---------- */

t('roster has leagues, fighters, officials and bouts', () => {
  for (const k of ['leagues', 'fighters', 'officials', 'bouts']) {
    assert.ok(Array.isArray(data[k]) && data[k].length > 0, `${k} is empty`);
  }
});

t('every id is unique', () => {
  for (const [k, ids] of [['leagues', leagueIds], ['fighters', fighterIds], ['officials', officialIds]]) {
    assert.equal(ids.size, data[k].length, `duplicate id in ${k}`);
  }
  const boutIds = new Set(data.bouts.map((b) => b.id));
  assert.equal(boutIds.size, data.bouts.length, 'duplicate bout id');
});

/* ---------- referential integrity ---------- */

t('every fighter belongs to a real league', () => {
  for (const f of data.fighters) {
    assert.ok(leagueIds.has(f.league), `${f.name} -> unknown league ${f.league}`);
  }
});

t('every official belongs to a real league', () => {
  for (const o of data.officials) {
    assert.ok(leagueIds.has(o.league), `${o.name} -> unknown league ${o.league}`);
  }
});

t('every bout references a real league and two real fighters', () => {
  for (const b of data.bouts) {
    assert.ok(leagueIds.has(b.league), `${b.id} -> unknown league`);
    assert.ok(fighterIds.has(b.blueFighter), `${b.id} -> unknown blue fighter`);
    assert.ok(fighterIds.has(b.redFighter), `${b.id} -> unknown red fighter`);
    assert.notEqual(b.blueFighter, b.redFighter, `${b.id} -> fighter faces themselves`);
  }
});

t('every bout has a panel of real officials and a referee', () => {
  for (const b of data.bouts) {
    assert.ok(b.judges.length >= 1, `${b.id} -> no judges`);
    for (const j of b.judges) assert.ok(officialIds.has(j), `${b.id} -> unknown judge ${j}`);
    assert.ok(officialIds.has(b.referee), `${b.id} -> unknown referee`);
  }
});

t("a bout's fighters belong to the same league as the bout", () => {
  const byId = new Map(data.fighters.map((f) => [f.id, f]));
  for (const b of data.bouts) {
    assert.equal(byId.get(b.blueFighter).league, b.league, `${b.id} blue corner is from another event`);
    assert.equal(byId.get(b.redFighter).league, b.league, `${b.id} red corner is from another event`);
  }
});

/* ---------- past / upcoming split ---------- */

t('every league date is a valid ISO date', () => {
  for (const l of data.leagues) {
    assert.match(l.date, /^\d{4}-\d{2}-\d{2}$/, `${l.name} has a bad date`);
    assert.ok(!Number.isNaN(Date.parse(`${l.date}T${l.time}:00`)), `${l.name} will not parse`);
  }
});

t('the dataset splits into both past and upcoming leagues', () => {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.leagues.filter((l) => l.date >= today);
  const past = data.leagues.filter((l) => l.date < today);
  assert.ok(upcoming.length > 0, 'nothing would show under Upcoming League');
  assert.ok(past.length > 0, 'nothing would show under Past League');
});

t('an event has bouts if and only if its card was imported', () => {
  const withBouts = new Set(data.bouts.map((b) => b.league));
  for (const l of data.leagues) {
    if (l.cardImported) {
      assert.ok(withBouts.has(l.id), `${l.name} claims an imported card but has no bouts`);
    } else {
      assert.ok(!withBouts.has(l.id), `${l.name} has bouts but is not marked as imported`);
    }
  }
});

t('at least one real fight card is present', () => {
  const imported = data.leagues.filter((l) => l.cardImported);
  assert.ok(imported.length > 0, 'no fight card has been imported at all');
  assert.ok(data.bouts.length >= 10, `only ${data.bouts.length} bouts imported`);
});

t('every event records where it came from', () => {
  for (const l of data.leagues) {
    assert.match(l.sourceUrl || '', /^https?:\/\//, `${l.name} has no source URL`);
  }
});

t('upcoming events have no results yet', () => {
  const today = new Date().toISOString().slice(0, 10);
  const futureIds = new Set(data.leagues.filter((l) => l.date >= today).map((l) => l.id));
  const futureBouts = data.bouts.filter((b) => futureIds.has(b.league));
  assert.ok(futureBouts.every((b) => !b.result), 'an upcoming bout already has a result');
});

t('a result names a corner that exists', () => {
  for (const b of data.bouts.filter((x) => x.result)) {
    assert.ok(['blue', 'red', 'draw', 'nc'].includes(b.result.winnerCorner), `${b.id} bad winner`);
    assert.ok(b.result.endedRound >= 1 && b.result.endedRound <= b.totalRounds, `${b.id} bad end round`);
  }
});

/* ---------- photos ---------- */

t('every fighter has a usable photo', () => {
  for (const f of data.fighters) {
    assert.ok(f.photo, `${f.name} has no photo`);
    const ok = /^https:\/\/wdsmma\.com\/assets\/images\/.+\.(webp|jpg|png|svg)$/.test(f.photo)
      || /^fighters\/[a-z0-9-]+\.(jpg|png|webp)$/.test(f.photo);
    assert.ok(ok, `${f.name} has an odd photo path: ${f.photo}`);
  }
});

t('photos are never served from the API host', () => {
  // A leading slash would be resolved against the API, which does not hold these.
  for (const f of data.fighters) {
    assert.ok(!f.photo.startsWith('/'), `${f.name} photo must not start with /`);
  }
});

t('real fighters are hotlinked from wdsmma.com', () => {
  const real = data.fighters.filter((f) => !f.tba);
  const hosted = real.filter((f) => f.photo.startsWith('https://wdsmma.com/'));
  assert.ok(hosted.length > 0, 'no photos point at the live WDS site');
});

/**
 * A fighter can appear on more than one card, and gets a separate record per
 * event (ids are scoped by league). Those records SHOULD share one photo file —
 * it is the same person. What must never happen is two different people
 * pointing at the same image.
 */
t('a photo file maps to exactly one person', () => {
  // TBA shares one placeholder image by design.
  const byPhoto = new Map();
  for (const f of data.fighters) {
    if (f.tba) continue;
    if (!byPhoto.has(f.photo)) byPhoto.set(f.photo, new Set());
    byPhoto.get(f.photo).add(f.name);
  }
  for (const [photo, names] of byPhoto) {
    assert.equal(names.size, 1, `${photo} is shared by: ${[...names].join(', ')}`);
  }
});

t('the same person reuses one photo across events', () => {
  const byName = new Map();
  for (const f of data.fighters) {
    if (!byName.has(f.name)) byName.set(f.name, new Set());
    byName.get(f.name).add(f.photo);
  }
  for (const [name, photos] of byName) {
    assert.equal(photos.size, 1, `${name} points at ${photos.size} different photos`);
  }

});

/* ---------- bout settings ---------- */

t('round counts and durations are sane', () => {
  for (const b of data.bouts) {
    assert.ok(b.totalRounds >= 1 && b.totalRounds <= 5, `${b.id} has ${b.totalRounds} rounds`);
    assert.ok(b.roundDurationSec >= 60 && b.roundDurationSec <= 600, `${b.id} round length`);
    assert.ok(['Professional', 'Amateur'].includes(b.boutType), `${b.id} bad bout type`);
    assert.ok(['MMA', 'BJJ', 'K1'].includes(b.discipline), `${b.id} bad discipline`);
  }
});

t('bout numbers run 1..n within each event', () => {
  const byLeague = {};
  for (const b of data.bouts) (byLeague[b.league] ||= []).push(b.boutNo);
  for (const [lid, nums] of Object.entries(byLeague)) {
    const sorted = [...nums].sort((a, b) => a - b);
    assert.deepEqual(sorted, sorted.map((_, i) => i + 1), `${lid} bout numbers are not 1..n`);
  }
});

t('the roster records where its data came from', () => {
  assert.ok(data.source?.events, 'missing provenance for events');
  assert.ok(data.source?.fighters, 'missing provenance for fighters');
});

console.log(`\n✅ ${pass.length} roster checks passed`);
pass.forEach((p) => console.log('   ✓', p));
