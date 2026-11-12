/**
 * Does the roster actually seed?
 *
 * Mongoose can validate a document without a database connection, so every
 * record the seed would write is built here and run through the real schema.
 * This catches the failures that otherwise only appear as a half-populated
 * database on a server you cannot shell into — a bad enum value, a missing
 * required field, an out-of-range number.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';

import League from '../src/models/League.js';
import Fighter from '../src/models/Fighter.js';
import Official from '../src/models/Official.js';
import Bout from '../src/models/Bout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROSTER = path.resolve(__dirname, '../../client/public/data/wds-roster.json');
const data = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));

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

const oid = () => new mongoose.Types.ObjectId();
const at = (date, time = '00:00') => new Date(`${date}T${time}:00`);
const firstError = (doc) => {
  const err = doc.validateSync();
  if (!err) return null;
  const [field, detail] = Object.entries(err.errors)[0];
  return `${field}: ${detail.message}`;
};

t('every league passes the League schema', () => {
  for (const l of data.leagues) {
    const doc = new League({
      name: l.name,
      date: at(l.date, l.time),
      time: l.time,
      location: l.location,
      promoter: l.promoter,
      bouts: l.bouts,
    });
    assert.equal(firstError(doc), null, `${l.name} -> ${firstError(doc)}`);
  }
});

t('every fighter passes the Fighter schema', () => {
  for (const f of data.fighters) {
    const doc = new Fighter({
      league: oid(),
      name: f.name,
      team: f.team,
      country: f.country,
      weightClass: f.weightClass,
      weightKg: f.weightKg,
      gender: f.gender,
      record: f.record,
      photoUrl: f.photo,
    });
    assert.equal(firstError(doc), null, `${f.name} -> ${firstError(doc)}`);
  }
});

t('every official passes the Official schema', () => {
  for (const o of data.officials) {
    const doc = new Official({
      league: oid(),
      kind: o.kind,
      name: o.name,
      contactNo: o.contactNo,
      bloodGroup: o.bloodGroup,
    });
    assert.equal(firstError(doc), null, `${o.name} -> ${firstError(doc)}`);
  }
});

t('every bout passes the Bout schema', () => {
  for (const b of data.bouts) {
    const doc = new Bout({
      league: oid(),
      boutNo: b.boutNo,
      boutName: b.boutName,
      boutType: b.boutType,
      discipline: b.discipline,
      boutDate: at(b.boutDate),
      ringNo: b.ringNo,
      totalRounds: b.totalRounds,
      roundDurationSec: b.roundDurationSec,
      blueCorner: { fighter: oid() },
      redCorner: { fighter: oid() },
      judges: (b.judges || []).map(() => oid()),
      referee: oid(),
    });
    assert.equal(firstError(doc), null, `${b.id} -> ${firstError(doc)}`);
  }
});

/**
 * The one most likely to bite: a result method the Bout schema does not allow.
 * A rejected result would leave a past event looking like it never happened.
 */
t('every recorded result passes the Bout schema', () => {
  for (const b of data.bouts.filter((x) => x.result)) {
    const doc = new Bout({
      league: oid(),
      boutNo: b.boutNo,
      boutDate: at(b.boutDate),
      totalRounds: b.totalRounds,
      roundDurationSec: b.roundDurationSec,
      blueCorner: { fighter: oid() },
      redCorner: { fighter: oid() },
      status: 'completed',
      result: {
        winnerCorner: b.result.winnerCorner,
        winnerFighter: oid(),
        method: b.result.method,
        endedRound: b.result.endedRound,
        endedAtSec: b.result.endedAtSec,
        decidedAt: at(b.boutDate, '21:00'),
      },
    });
    assert.equal(
      firstError(doc),
      null,
      `${b.id} result "${b.result.method}" -> ${firstError(doc)}`
    );
  }
});

t('result methods are all in the schema enum', () => {
  const allowed = Bout.schema.path('result.method').enumValues;
  const used = [...new Set(data.bouts.filter((b) => b.result).map((b) => b.result.method))];
  const bad = used.filter((m) => !allowed.includes(m));
  assert.deepEqual(bad, [], `not allowed by the Bout schema: ${bad.join(', ')}\n     allowed: ${allowed.join(', ')}`);
});

console.log(`\n✅ ${pass.length} seed-validation checks passed`);
pass.forEach((p) => console.log('   ✓', p));
