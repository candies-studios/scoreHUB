/**
 * ENGINE A — the counting rules.
 *
 * These are the easiest thing in the system to get subtly wrong (a significant
 * strike is also a strike; an undo must not leave a counter behind), so the
 * aggregation core is tested directly, with no database involved.
 */
import assert from 'node:assert/strict';
import { aggregate, emptyCorner, pct } from '../src/utils/fightStats.js';

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

const ev = (corner, type, extra = {}) => ({ corner, type, target: null, position: null, ...extra });

/* ---------- no double counting ---------- */

t('a significant strike counts once as significant and once as total', () => {
  const s = aggregate({ events: [ev('red', 'sig_strike_landed')] });
  assert.equal(s.red.sigLanded, 1);
  assert.equal(s.red.totalLanded, 1, 'must not be 2');
});

t('a plain strike does not inflate the significant count', () => {
  const s = aggregate({ events: [ev('red', 'total_strike_landed')] });
  assert.equal(s.red.sigLanded, 0);
  assert.equal(s.red.totalLanded, 1);
});

t('mixed striking totals correctly', () => {
  const s = aggregate({
    events: [
      ev('red', 'sig_strike_landed'),
      ev('red', 'sig_strike_landed'),
      ev('red', 'total_strike_landed'),
      ev('red', 'sig_strike_attempted'),
      ev('red', 'total_strike_attempted'),
    ],
  });
  assert.equal(s.red.sigLanded, 2);
  assert.equal(s.red.totalLanded, 3);
  assert.equal(s.red.sigAttempted, 3, '2 landed imply attempts, plus 1 explicit');
  assert.equal(s.red.totalAttempted, 5);
});

/* ---------- attempts are floored at landed ---------- */

t('landed can never exceed attempted', () => {
  const s = aggregate({ events: Array.from({ length: 12 }, () => ev('blue', 'sig_strike_landed')) });
  assert.equal(s.blue.sigLanded, 12);
  assert.equal(s.blue.sigAttempted, 12, 'accuracy would otherwise be infinite');
  assert.equal(s.blue.sigAccuracy, 100);
});

t('attempts are misses plus landed, so accuracy is well defined', () => {
  const s = aggregate({
    events: [
      ...Array.from({ length: 12 }, () => ev('red', 'sig_strike_landed')),
      ...Array.from({ length: 8 }, () => ev('red', 'sig_strike_attempted')),
    ],
  });
  assert.equal(s.red.sigLanded, 12);
  assert.equal(s.red.sigAttempted, 20, '12 landed + 8 missed');
  assert.equal(s.red.sigAccuracy, 60);
});

t('accuracy is 0% with no attempts, never NaN', () => {
  const s = aggregate({ events: [] });
  assert.equal(s.red.sigAccuracy, 0);
  assert.equal(s.red.takedownAccuracy, 0);
  assert.equal(pct(0, 0), 0);
});

t('takedown attempts are floored at landed too', () => {
  const s = aggregate({ events: [ev('red', 'takedown_landed'), ev('red', 'takedown_landed')] });
  assert.equal(s.red.takedownsLanded, 2);
  assert.equal(s.red.takedownsAttempted, 2);
  assert.equal(s.red.takedownAccuracy, 100);
});

/* ---------- target and position buckets ---------- */

t('a strike lands in both its target and position bucket', () => {
  const s = aggregate({
    events: [ev('red', 'sig_strike_landed', { target: 'head', position: 'clinch' })],
  });
  assert.equal(s.red.headLanded, 1);
  assert.equal(s.red.clinchLanded, 1);
  assert.equal(s.red.bodyLanded, 0);
  assert.equal(s.red.distanceLanded, 0);
});

t('buckets accumulate independently of the headline counts', () => {
  const s = aggregate({
    events: [
      ev('red', 'sig_strike_landed', { target: 'head', position: 'distance' }),
      ev('red', 'sig_strike_landed', { target: 'leg', position: 'distance' }),
      ev('red', 'sig_strike_attempted', { target: 'head', position: 'distance' }),
    ],
  });
  assert.equal(s.red.sigLanded, 2);
  assert.equal(s.red.headLanded, 1);
  assert.equal(s.red.legLanded, 1);
  assert.equal(s.red.distanceLanded, 2);
  assert.equal(s.red.headAttempted, 2, '1 landed implies an attempt, plus 1 explicit');
});

/* ---------- observations stay out of the counts ---------- */

t('observations never touch the striking numbers', () => {
  const s = aggregate({
    events: [
      ev('red', 'damage_observed'),
      ev('red', 'cut_laceration'),
      ev('red', 'effective_sequence'),
    ],
  });
  assert.equal(s.red.sigLanded, 0);
  assert.equal(s.red.totalLanded, 0);
  assert.equal(s.red.damageObserved, 1);
  assert.equal(s.red.cuts, 1);
  assert.equal(s.red.observationCount, 3);
});

/* ---------- control time ---------- */

t('closed intervals sum to total control time', () => {
  const s = aggregate({
    intervals: [
      { corner: 'red', startSec: 10, endSec: 70, offensiveOutput: false },
      { corner: 'red', startSec: 100, endSec: 130, offensiveOutput: false },
    ],
  });
  assert.equal(s.red.controlSec, 90);
  assert.equal(s.red.activeControlSec, 0);
});

t('only intervals with offensive output count as active control', () => {
  const s = aggregate({
    intervals: [
      { corner: 'blue', startSec: 0, endSec: 60, offensiveOutput: true },
      { corner: 'blue', startSec: 60, endSec: 180, offensiveOutput: false },
    ],
  });
  assert.equal(s.blue.controlSec, 180);
  assert.equal(s.blue.activeControlSec, 60, 'idle control must not be credited');
});

t('an open interval counts up to the current clock', () => {
  const s = aggregate({
    intervals: [{ corner: 'red', startSec: 30, endSec: null, offensiveOutput: true }],
    nowSec: 90,
  });
  assert.equal(s.red.controlSec, 60);
  assert.equal(s.openControlIntervals, 1);
});

t('an open interval with no clock reference contributes nothing', () => {
  const s = aggregate({
    intervals: [{ corner: 'red', startSec: 30, endSec: null, offensiveOutput: true }],
  });
  assert.equal(s.red.controlSec, 0);
});

/* ---------- fouls ---------- */

t('a deduction is charged to the fighter who fouled', () => {
  const s = aggregate({ fouls: [{ corner: 'blue', pointsDeducted: 1 }] });
  assert.equal(s.blue.pointsDeducted, 1);
  assert.equal(s.red.pointsDeducted, 0);
  assert.equal(s.foulCount, 1);
});

t('a foul with no deduction adds no points', () => {
  const s = aggregate({ fouls: [{ corner: 'red', pointsDeducted: 0 }] });
  assert.equal(s.red.pointsDeducted, 0);
});

/* ---------- undo semantics ---------- */

t('removing an event removes exactly its contribution', () => {
  const events = [
    ev('red', 'sig_strike_landed', { target: 'head' }),
    ev('red', 'sig_strike_landed', { target: 'body' }),
    ev('red', 'knockdown'),
  ];
  const before = aggregate({ events });
  const after = aggregate({ events: events.slice(0, 2) }); // the void filter does this

  assert.equal(before.red.knockdowns, 1);
  assert.equal(after.red.knockdowns, 0);
  assert.equal(after.red.sigLanded, 2, 'the other strikes are untouched');
  assert.equal(after.red.headLanded, 1);
});

t('recounting the same events twice gives the same answer', () => {
  const events = [
    ev('red', 'sig_strike_landed'),
    ev('blue', 'takedown_landed'),
    ev('blue', 'submission_attempt'),
  ];
  const a = aggregate({ events });
  const b = aggregate({ events });
  assert.deepEqual(a.red, b.red);
  assert.deepEqual(a.blue, b.blue);
});

/* ---------- differentials ---------- */

t('differentials are red minus blue', () => {
  const s = aggregate({
    events: [
      ev('red', 'sig_strike_landed'),
      ev('red', 'sig_strike_landed'),
      ev('blue', 'sig_strike_landed'),
      ev('blue', 'takedown_landed'),
    ],
  });
  assert.equal(s.differentials.sigStrikes, 1);
  assert.equal(s.differentials.takedowns, -1);
});

/* ---------- shape ---------- */

t('an empty corner has every field initialised to zero', () => {
  const c = emptyCorner();
  const nonZero = Object.entries(c).filter(([, v]) => v !== 0);
  assert.equal(nonZero.length, 0, `unexpected: ${JSON.stringify(nonZero)}`);
});

t('corners are independent', () => {
  const s = aggregate({ events: [ev('red', 'knockdown')] });
  assert.equal(s.red.knockdowns, 1);
  assert.equal(s.blue.knockdowns, 0);
});

console.log(`\n✅ ${pass.length} statistics checks passed`);
pass.forEach((p) => console.log('   ✓', p));
