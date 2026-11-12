/**
 * Generates client/public/data/wds-roster.json — the single dataset used by
 * BOTH the MongoDB seed and the client's offline demo mode.
 *
 * Run with:  node tools/build-roster.mjs
 *
 * EVENTS are real: names, dates and venues taken from wdsmma.com.
 * FIGHTERS are placeholder — WDS does not publish a fighter roster, so the
 * names carried over from the previous ScoreHUB demo data are reused and
 * extended. Replace them with the real cards when you have them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../client/public/data/wds-roster.json');

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ *
 * Officials — carried over from the previous ScoreHUB data
 * ------------------------------------------------------------------ */
const JUDGES = [
  { name: 'Poonam Deshmukh', contactNo: '9876543212', bloodGroup: 'B+' },
  { name: 'Ayush Kulkarni', contactNo: '9876543213', bloodGroup: 'O+' },
  { name: 'Sandeep Rawat', contactNo: '9876543214', bloodGroup: 'A+' },
  { name: 'Sushil Chandanshive', contactNo: '9876543210', bloodGroup: 'B+' },
  { name: 'Ashutosh Malgaonkar', contactNo: '9876543211', bloodGroup: 'AB+' },
];
const REFEREES = [
  { name: 'Deepak Salvi', contactNo: '9876543215', bloodGroup: 'O+' },
  { name: 'Nitin Bhosale', contactNo: '9876543216', bloodGroup: 'B+' },
];

/* ------------------------------------------------------------------ *
 * Events — REAL. Source: wdsmma.com (fetched 12 Nov 2026)
 * ------------------------------------------------------------------ */
const EVENTS = [
  {
    name: 'WDS Fight Night 19',
    series: 'Championship Series',
    date: '2026-12-12', time: '17:00',
    location: 'CIDCO Exhibition Ground, Vashi, Navi Mumbai',
  },
  {
    name: 'WDS Rising Star 8',
    series: 'Rising Star Series',
    date: '2026-10-24', time: '08:00',
    location: 'Fit & Fight Club, Wagholi, Pune',
  },
  {
    name: 'WDS Fight Night 18',
    series: 'Championship Series',
    date: '2026-08-29', time: '17:00',
    location: 'CIDCO Exhibition & Convention Centre, Vashi, Navi Mumbai',
  },
  {
    name: 'WDS Rising Star 7',
    series: 'Rising Star Series',
    date: '2026-07-25', time: '08:00',
    location: 'Fit & Fight Club, Nerul, Navi Mumbai',
  },
  {
    name: 'WDS Fight Night 17',
    series: 'Championship Series',
    date: '2026-06-06', time: '17:00',
    location: 'Sports Complex, Mumbai University, Kalina',
  },
  {
    name: 'WDS Rising Star 6',
    series: 'Rising Star Series',
    date: '2026-04-25', time: '08:00',
    location: 'Fit & Fight Club, Nerul, Navi Mumbai',
  },
  {
    name: 'WDS Fight Night 16',
    series: 'Championship Series',
    date: '2026-03-28', time: '17:00',
    location: 'Lovely Professional University, Jalandhar',
  },
];

/* ------------------------------------------------------------------ *
 * Fighters — PLACEHOLDER names, grouped into the bouts of each event.
 * The first eight are the names from the previous ScoreHUB demo data.
 * ------------------------------------------------------------------ */
const CARDS = {
  'WDS Fight Night 19': [
    { weightClass: 'Flyweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Arjun Rane', team: 'Mumbai Fight Club', coach: 'R. Mehta', record: [8, 2, 0], country: 'India' },
      red:  { name: 'Kabir Shaikh', team: 'Pune Combat Academy', coach: 'S. Pawar', record: [11, 3, 0], country: 'India' } },
    { weightClass: 'Bantamweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Rohit Tamang', team: 'Darjeeling Warriors', coach: null, record: [6, 1, 0], country: 'India' },
      red:  { name: 'Imran Qureshi', team: 'Hyderabad Top Team', coach: 'A. Khan', record: [9, 4, 1], country: 'India' } },
    { weightClass: "Women's Strawweight", type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Neha Salunkhe', team: 'Nerul MMA', coach: null, record: [5, 0, 0], country: 'India', gender: 'female' },
      red:  { name: 'Priya Naik', team: 'Goa Grapple House', coach: null, record: [4, 2, 0], country: 'India', gender: 'female' } },
    { weightClass: 'Lightweight', type: 'Professional', discipline: 'MMA', rounds: 5, minutes: 5,
      blue: { name: 'Tomas Rivera', team: 'Entram Gym', coach: null, record: [8, 2, 0], country: 'Spain' },
      red:  { name: 'Yusuf Demir', team: 'Istanbul MMA', coach: null, record: [10, 3, 0], country: 'Turkiye' } },
  ],
  'WDS Rising Star 8': [
    { weightClass: 'Amateur Flyweight', type: 'Amateur', discipline: 'MMA', rounds: 3, minutes: 3,
      blue: { name: 'Aditya Pawar', team: 'Wagholi Warriors', record: [3, 0, 0], country: 'India' },
      red:  { name: 'Sameer Joshi', team: 'Pune Combat Academy', record: [2, 1, 0], country: 'India' },
      result: { winner: 'blue', method: 'TKO', round: 2, atSec: 143 } },
    { weightClass: 'Amateur Bantamweight', type: 'Amateur', discipline: 'MMA', rounds: 3, minutes: 3,
      blue: { name: 'Vikram Shinde', team: 'Nashik Fight Lab', record: [4, 1, 0], country: 'India' },
      red:  { name: 'Faizan Ansari', team: 'Bhiwandi Grapplers', record: [3, 2, 0], country: 'India' },
      result: { winner: 'red', method: 'Unanimous Decision', round: 3, atSec: 180 } },
    { weightClass: 'Amateur BJJ Lightweight', type: 'Amateur', discipline: 'BJJ', rounds: 1, minutes: 6,
      blue: { name: 'Karan Dhanda', team: 'Pune BJJ', record: [6, 2, 0], country: 'India' },
      red:  { name: 'Mehul Rathod', team: 'Surat Submission', record: [5, 3, 1], country: 'India' },
      result: { winner: 'blue', method: 'Submission', round: 1, atSec: 221 } },
  ],
  'WDS Fight Night 18': [
    { weightClass: 'Welterweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Harsh Vardhan', team: 'Delhi Combat Club', record: [12, 4, 0], country: 'India' },
      red:  { name: 'Suraj Gurung', team: 'Kathmandu Fight House', record: [10, 5, 1], country: 'Nepal' },
      result: { winner: 'blue', method: 'Head KO', round: 1, atSec: 97 } },
    { weightClass: 'Featherweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Anil Chauhan', team: 'Jaipur Jiu-Jitsu', record: [7, 3, 0], country: 'India' },
      red:  { name: 'Ravi Teja', team: 'Hyderabad Top Team', record: [9, 2, 0], country: 'India' },
      result: { winner: 'red', method: 'Split Decision', round: 3, atSec: 300 } },
    { weightClass: "Women's Flyweight", type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Shraddha More', team: 'Nerul MMA', record: [6, 1, 0], country: 'India', gender: 'female' },
      red:  { name: 'Ritika Bose', team: 'Kolkata Cage', record: [5, 2, 0], country: 'India', gender: 'female' },
      result: { winner: 'blue', method: 'Unanimous Decision', round: 3, atSec: 300 } },
  ],
  'WDS Rising Star 7': [
    { weightClass: 'Amateur Lightweight', type: 'Amateur', discipline: 'MMA', rounds: 3, minutes: 3,
      blue: { name: 'Omkar Jadhav', team: 'Nerul MMA', record: [2, 0, 0], country: 'India' },
      red:  { name: 'Rizwan Shaikh', team: 'Mumbai Fight Club', record: [3, 1, 0], country: 'India' },
      result: { winner: 'red', method: 'RNC', round: 2, atSec: 112 } },
    { weightClass: 'Amateur Welterweight', type: 'Amateur', discipline: 'MMA', rounds: 3, minutes: 3,
      blue: { name: 'Prathamesh Kale', team: 'Thane Takedown', record: [4, 2, 0], country: 'India' },
      red:  { name: 'Gagan Deep', team: 'Punjab Pehlwan MMA', record: [5, 1, 0], country: 'India' },
      result: { winner: 'red', method: 'Unanimous Decision', round: 3, atSec: 180 } },
  ],
  'WDS Fight Night 17': [
    { weightClass: 'Middleweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Jaskaran Singh', team: 'Punjab Pehlwan MMA', record: [11, 2, 0], country: 'India' },
      red:  { name: 'Daniel Costa', team: 'Lisbon Top Team', record: [13, 6, 0], country: 'Portugal' },
      result: { winner: 'blue', method: 'Submission', round: 2, atSec: 254 } },
    { weightClass: 'Lightweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Tomas Rivera', team: 'Entram Gym', record: [8, 2, 0], country: 'Spain' },
      red:  { name: 'Yusuf Demir', team: 'Istanbul MMA', record: [10, 3, 0], country: 'Turkiye' },
      result: { winner: 'blue', method: 'Split Decision', round: 3, atSec: 300 } },
    { weightClass: 'Catchweight K1', type: 'Professional', discipline: 'K1', rounds: 3, minutes: 3,
      blue: { name: 'Akash Yadav', team: 'Lucknow Striking', record: [9, 3, 1], country: 'India' },
      red:  { name: 'Tenzin Norbu', team: 'Dharamshala Muay Thai', record: [8, 4, 0], country: 'India' },
      result: { winner: 'red', method: 'KO Body', round: 2, atSec: 71 } },
  ],
  'WDS Rising Star 6': [
    { weightClass: 'Amateur Featherweight', type: 'Amateur', discipline: 'MMA', rounds: 3, minutes: 3,
      blue: { name: 'Nikhil Patil', team: 'Nashik Fight Lab', record: [1, 0, 0], country: 'India' },
      red:  { name: 'Zaid Memon', team: 'Bhiwandi Grapplers', record: [2, 1, 0], country: 'India' },
      result: { winner: 'blue', method: 'TKO', round: 3, atSec: 64 } },
    { weightClass: 'Amateur BJJ Middleweight', type: 'Amateur', discipline: 'BJJ', rounds: 1, minutes: 6,
      blue: { name: 'Rahul Verma', team: 'Pune BJJ', record: [4, 1, 0], country: 'India' },
      red:  { name: 'Siddharth Rao', team: 'Bangalore Grappling', record: [6, 0, 0], country: 'India' },
      result: { winner: 'red', method: 'Submission', round: 1, atSec: 188 } },
  ],
  'WDS Fight Night 16': [
    { weightClass: 'Bantamweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Manpreet Brar', team: 'Jalandhar Combat', record: [7, 1, 0], country: 'India' },
      red:  { name: 'Rohit Tamang', team: 'Darjeeling Warriors', record: [6, 1, 0], country: 'India' },
      result: { winner: 'blue', method: 'Unanimous Decision', round: 3, atSec: 300 } },
    { weightClass: 'Welterweight', type: 'Professional', discipline: 'MMA', rounds: 3, minutes: 5,
      blue: { name: 'Gurpreet Sandhu', team: 'Punjab Pehlwan MMA', record: [10, 4, 0], country: 'India' },
      red:  { name: 'Harsh Vardhan', team: 'Delhi Combat Club', record: [12, 4, 0], country: 'India' },
      result: { winner: 'red', method: 'DQ', round: 2, atSec: 205 } },
  ],
};

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
const WEIGHT_KG = {
  Flyweight: 56.7, Bantamweight: 61.2, Featherweight: 65.8, Lightweight: 70.3,
  Welterweight: 77.1, Middleweight: 83.9,
};
const weightFor = (wc) => {
  const key = Object.keys(WEIGHT_KG).find((k) => wc.includes(k));
  return key ? WEIGHT_KG[key] : 70;
};

const leagues = [];
const fighters = [];
const officials = [];
const bouts = [];

for (const event of EVENTS) {
  const leagueId = slug(event.name);
  const card = CARDS[event.name] || [];

  const counts = { amateurMMA: 0, amateurBJJ: 0, amateurK1: 0, proMMA: 0, proBJJ: 0, proK1: 0 };
  for (const b of card) {
    const k = `${b.type === 'Amateur' ? 'amateur' : 'pro'}${b.discipline}`;
    if (counts[k] !== undefined) counts[k] += 1;
  }

  leagues.push({
    id: leagueId,
    name: event.name,
    series: event.series,
    date: event.date,
    time: event.time,
    location: event.location,
    promoter: 'Warriors Dream Series',
    bouts: counts,
  });

  // Each event gets its own panel of three judges and a referee.
  const panel = JUDGES.slice(0, 3).map((j) => ({
    id: `${leagueId}-judge-${slug(j.name)}`, league: leagueId, kind: 'judge', ...j,
  }));
  const ref = { id: `${leagueId}-ref`, league: leagueId, kind: 'referee', ...REFEREES[0] };
  officials.push(...panel, ref);

  card.forEach((b, i) => {
    const mk = (corner) => {
      const f = b[corner];
      const id = `${leagueId}-${slug(f.name)}`;
      fighters.push({
        id,
        league: leagueId,
        name: f.name,
        team: f.team || '',
        coach: f.coach || '',
        country: f.country || 'India',
        weightClass: b.weightClass,
        weightKg: weightFor(b.weightClass),
        gender: f.gender || 'male',
        record: { wins: f.record[0], losses: f.record[1], draws: f.record[2] },
        // Drop a real photo at client/public/<photo> using this exact name and
        // it appears automatically; until then the UI shows initials.
        photo: `fighters/${slug(f.name)}.jpg`,
      });
      return id;
    };

    bouts.push({
      id: `${leagueId}-bout-${i + 1}`,
      league: leagueId,
      boutNo: i + 1,
      boutName: b.weightClass,
      boutType: b.type,
      discipline: b.discipline,
      boutDate: event.date,
      ringNo: 1,
      totalRounds: b.rounds,
      roundDurationSec: b.minutes * 60,
      blueFighter: mk('blue'),
      redFighter: mk('red'),
      judges: panel.map((p) => p.id),
      referee: ref.id,
      result: b.result
        ? {
            winnerCorner: b.result.winner,
            method: b.result.method,
            endedRound: b.result.round,
            endedAtSec: b.result.atSec,
          }
        : null,
    });
  });
}

// The same fighter can appear on more than one card; keep one record per id.
const uniqueFighters = [...new Map(fighters.map((f) => [f.id, f])).values()];

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    events: 'Real. Names, dates and venues from wdsmma.com.',
    fighters:
      'Placeholder. WDS does not publish a roster, so these carry over from the previous ScoreHUB demo data and are extended in the same style. Replace with real cards.',
    photos: 'Drop files at client/public/fighters/<slug>.jpg. Missing files fall back to initials.',
  },
  leagues,
  fighters: uniqueFighters,
  officials,
  bouts,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

const today = new Date().toISOString().slice(0, 10);
const upcoming = leagues.filter((l) => l.date >= today);
const past = leagues.filter((l) => l.date < today);

console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  leagues   ${leagues.length}  (${upcoming.length} upcoming, ${past.length} past)`);
console.log(`  fighters  ${uniqueFighters.length}`);
console.log(`  bouts     ${bouts.length}  (${bouts.filter((b) => b.result).length} with results)`);
console.log(`  officials ${officials.length}`);
console.log('');
console.log('  upcoming:', upcoming.map((l) => `${l.name} (${l.date})`).join(', ') || 'none');
