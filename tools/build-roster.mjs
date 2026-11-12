/**
 * Builds client/public/data/wds-roster.json from tools/wds-source.mjs.
 *
 *   node tools/build-roster.mjs
 *
 * The JSON is the single source of truth: the MongoDB seed reads it and so
 * does the client's offline demo, so the database and the no-backend site can
 * never disagree.
 *
 * Everything here is REAL data from wdsmma.com. Events whose fight card could
 * not be read get no bouts rather than invented ones — see wds-source.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS, CARDS, JUDGES, REFEREES, PHOTO_BASE } from './wds-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../client/public/data/wds-roster.json');

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Round settings differ by series; amateur cards run shorter rounds. */
const seriesDefaults = (series) =>
  series === 'Rising Star Series'
    ? { boutType: 'Amateur', totalRounds: 3, roundDurationSec: 180 }
    : { boutType: 'Professional', totalRounds: 3, roundDurationSec: 300 };

const leagues = [];
const fighters = [];
const officials = [];
const bouts = [];

for (const event of EVENTS) {
  const leagueId = slug(event.name);
  const card = event.card ? CARDS[event.card] || [] : [];
  const defaults = seriesDefaults(event.series);

  const counts = { amateurMMA: 0, amateurBJJ: 0, amateurK1: 0, proMMA: 0, proBJJ: 0, proK1: 0 };
  counts[`${defaults.boutType === 'Amateur' ? 'amateur' : 'pro'}MMA`] = card.length;

  leagues.push({
    id: leagueId,
    name: event.name,
    series: event.series,
    date: event.date,
    time: event.time,
    location: event.location,
    promoter: 'Warriors Dream Series',
    sourceUrl: event.page,
    cardImported: Boolean(event.card),
    bouts: counts,
  });

  // Judges and a referee per event, so a card can be scored the moment it lands.
  const panel = JUDGES.map((j) => ({
    id: `${leagueId}-judge-${slug(j.name)}`, league: leagueId, kind: 'judge', ...j,
  }));
  const ref = { id: `${leagueId}-ref`, league: leagueId, kind: 'referee', ...REFEREES[0] };
  officials.push(...panel, ref);

  if (!card.length) continue;

  /**
   * A corner can be TBA. The bout still exists on the announced card, so it is
   * kept with a single shared TBA record per event rather than dropped.
   */
  const seen = new Map();
  const mk = (f) => {
    const isTba = f.name === 'TBA';
    const id = isTba ? `${leagueId}-tba` : `${leagueId}-${slug(f.name)}`;
    if (!seen.has(id)) {
      seen.set(id, true);
      fighters.push({
        id,
        league: leagueId,
        name: f.name,
        team: '',
        country: f.country || '',
        weightClass: f.weightClass || '',
        weightKg: f.weightKg || 0,
        gender: f.gender || 'male',
        record: { wins: 0, losses: 0, draws: 0 },
        // Absolute URL on wdsmma.com — the real photo, no files to copy.
        photo: f.photo ? `${PHOTO_BASE}${f.photo}` : '',
        tba: isTba || undefined,
      });
    }
    return id;
  };

  card.forEach((b, i) => {
    const blue = mk({ ...b.blue, weightClass: b.weightClass });
    const red = mk({ ...b.red, weightClass: b.weightClass });

    bouts.push({
      id: `${leagueId}-bout-${i + 1}`,
      league: leagueId,
      boutNo: i + 1,
      boutName: b.weightClass,
      position: b.position || null,
      boutType: defaults.boutType,
      discipline: 'MMA',
      boutDate: event.date,
      ringNo: 1,
      totalRounds: b.position ? 5 : defaults.totalRounds,
      roundDurationSec: defaults.roundDurationSec,
      blueFighter: blue,
      redFighter: red,
      judges: panel.map((p) => p.id),
      referee: ref.id,
      result: null,
    });
  });

  // Fill in the weight class on the shared TBA record if it is still blank.
  const tba = fighters.find((f) => f.id === `${leagueId}-tba`);
  if (tba && !tba.weightClass) tba.weightClass = 'TBA';
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    events: 'Real — https://wdsmma.com/pages/events.html',
    fighters: 'Real — read from each event fight-card page on wdsmma.com',
    photos: 'Real — hotlinked from wdsmma.com/assets/images/<event>/',
    gaps:
      'Events with cardImported: false have no bouts yet. Their fight cards are '
      + 'rendered by JavaScript or hosted on warriorsdreamseries.com, neither of which '
      + 'serves markup a fetcher can read. Nothing is invented to fill the gap.',
  },
  leagues,
  fighters,
  officials,
  bouts,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

const today = new Date().toISOString().slice(0, 10);
const upcoming = leagues.filter((l) => l.date >= today);
const withCards = leagues.filter((l) => l.cardImported);

console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  leagues   ${leagues.length}  (${upcoming.length} upcoming, ${leagues.length - upcoming.length} past)`);
console.log(`  fighters  ${fighters.length}`);
console.log(`  bouts     ${bouts.length}`);
console.log(`  cards     ${withCards.length}/${leagues.length} imported: ${withCards.map((l) => l.name).join(', ') || 'none'}`);
console.log(`  upcoming  ${upcoming.map((l) => `${l.name} (${l.date})`).join(', ') || 'none'}`);
