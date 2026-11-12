import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import League from '../models/League.js';
import Fighter from '../models/Fighter.js';
import Official from '../models/Official.js';
import Bout from '../models/Bout.js';
import Scorecard from '../models/Scorecard.js';
import FightSession from '../models/FightSession.js';
import FightEvent from '../models/FightEvent.js';
import ControlInterval from '../models/ControlInterval.js';
import FoulRecord from '../models/FoulRecord.js';
import RoundAssessment from '../models/RoundAssessment.js';
import AuditLog from '../models/AuditLog.js';
import { ensureScorecards } from './scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seeds the database from client/public/data/wds-roster.json.
 *
 * That file is the single source of truth: the client's offline demo mode
 * reads the very same JSON, so the database and the no-backend demo always
 * show identical events, fighters and bouts. Regenerate it with
 * `node tools/build-roster.mjs`, or edit it by hand.
 */
const ROSTER = path.resolve(__dirname, '../../../client/public/data/wds-roster.json');

function loadRoster() {
  if (!fs.existsSync(ROSTER)) {
    console.error(`[seed] roster not found at ${ROSTER}`);
    console.error('[seed] run: node tools/build-roster.mjs');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
}

/** Combine the roster's date (YYYY-MM-DD) and time (HH:MM) into one Date. */
const at = (date, time = '00:00') => new Date(`${date}T${time}:00`);

async function seed() {
  const roster = loadRoster();
  await connectDB();

  console.log('[seed] clearing existing data…');
  await Promise.all(
    [
      League, Fighter, Official, Bout, Scorecard,
      FightSession, FightEvent, ControlInterval, FoulRecord, RoundAssessment, AuditLog,
    ].map((M) => M.deleteMany({}))
  );

  // --- leagues ---------------------------------------------------------
  const leagueByKey = new Map();
  for (const l of roster.leagues) {
    const doc = await League.create({
      name: l.name,
      date: at(l.date, l.time),
      time: l.time,
      location: l.location,
      promoter: l.promoter,
      bouts: l.bouts,
    });
    leagueByKey.set(l.id, doc);
  }

  // --- fighters --------------------------------------------------------
  const fighterByKey = new Map();
  for (const f of roster.fighters) {
    const league = leagueByKey.get(f.league);
    if (!league) continue;
    const doc = await Fighter.create({
      league: league._id,
      name: f.name,
      team: f.team,
      country: f.country,
      weightClass: f.weightClass,
      weightKg: f.weightKg,
      gender: f.gender,
      record: f.record,
      // Relative path — resolved against the site, not the API, because these
      // ship with the client in client/public/. See docs/DATA.md.
      photoUrl: f.photo || '',
    });
    fighterByKey.set(f.id, doc);
  }

  // --- officials -------------------------------------------------------
  const officialByKey = new Map();
  for (const o of roster.officials) {
    const league = leagueByKey.get(o.league);
    if (!league) continue;
    const doc = await Official.create({
      league: league._id,
      kind: o.kind,
      name: o.name,
      contactNo: o.contactNo || '',
      bloodGroup: o.bloodGroup || '',
    });
    officialByKey.set(o.id, doc);
  }

  // --- bouts -----------------------------------------------------------
  let completed = 0;
  for (const b of roster.bouts) {
    const league = leagueByKey.get(b.league);
    const blue = fighterByKey.get(b.blueFighter);
    const red = fighterByKey.get(b.redFighter);
    if (!league || !blue || !red) continue;

    const doc = await Bout.create({
      league: league._id,
      boutNo: b.boutNo,
      boutName: b.boutName,
      boutType: b.boutType,
      discipline: b.discipline,
      boutDate: at(b.boutDate, '00:00'),
      ringNo: b.ringNo || 1,
      totalRounds: b.totalRounds,
      roundDurationSec: b.roundDurationSec,
      blueCorner: { fighter: blue._id },
      redCorner: { fighter: red._id },
      judges: (b.judges || []).map((j) => officialByKey.get(j)?._id).filter(Boolean),
      referee: officialByKey.get(b.referee)?._id || null,
    });

    // A finished card from a past event keeps its official result, so the
    // Past Leagues screens have real outcomes to show.
    if (b.result) {
      doc.status = 'completed';
      doc.currentRound = b.result.endedRound || doc.totalRounds;
      doc.result = {
        winnerCorner: b.result.winnerCorner,
        winnerFighter: b.result.winnerCorner === 'blue' ? blue._id : red._id,
        method: b.result.method,
        endedRound: b.result.endedRound,
        endedAtSec: b.result.endedAtSec,
        notes: '',
        decidedAt: at(b.boutDate, '21:00'),
      };
      await doc.save();
      completed += 1;
    }

    await ensureScorecards(doc._id);
  }

  const today = new Date();
  const upcoming = roster.leagues.filter((l) => at(l.date, l.time) >= today);

  console.log('[seed] done.');
  console.log(`  leagues   ${roster.leagues.length} (${upcoming.length} upcoming, ${roster.leagues.length - upcoming.length} past)`);
  console.log(`  fighters  ${fighterByKey.size}`);
  console.log(`  officials ${officialByKey.size}`);
  console.log(`  bouts     ${roster.bouts.length} (${completed} completed)`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
