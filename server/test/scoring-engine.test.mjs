/**
 * Engine B scenarios, taken from section 16 of the build spec.
 * No database required — the engine is pure, it takes derived stats in and
 * returns an estimate.
 */
import assert from 'node:assert/strict';
import { assessRound, buildScorecard, COMPARISON } from '../src/utils/fightScoring.js';
import { emptyCorner, differentials } from '../src/utils/fightStats.js';

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

/** Build a stats object the way fightStats.getStats would. */
function stats(redPatch = {}, bluePatch = {}, extra = {}) {
  const red = { ...emptyCorner(), ...redPatch };
  const blue = { ...emptyCorner(), ...bluePatch };
  for (const c of [red, blue]) {
    c.sigAttempted = Math.max(c.sigAttempted, c.sigLanded);
    c.totalAttempted = Math.max(c.totalAttempted, c.totalLanded);
    c.observationCount =
      c.damageObserved + c.cuts + c.swelling + c.sustainedDefenceForced + c.effectiveSequences + c.otherSignificant;
  }
  return {
    roundNo: 1,
    red,
    blue,
    differentials: differentials(red, blue),
    eventCount: extra.eventCount ?? 40,
    controlIntervalCount: extra.controlIntervalCount ?? 2,
    openControlIntervals: extra.openControlIntervals ?? 0,
    foulCount: extra.foulCount ?? 0,
  };
}

const run = (s, opts = {}) => assessRound({ stats: s, ...opts });

/* ---------- SCENARIO A: more strikes vs more control time ---------- */
t('A: striking beats idle control time', () => {
  // Red out-strikes; Blue has 3 minutes of control but did nothing with it.
  const r = run(stats(
    { sigLanded: 45, sigAttempted: 90 },
    { sigLanded: 12, sigAttempted: 30, controlSec: 180, activeControlSec: 0 }
  ));
  assert.equal(r.winner, 'red');
  assert.equal(r.criteria.effectiveGrappling.advantage !== 'blue', true,
    'idle control must not win effective grappling');
});

t('A2: control WITH offence does count as grappling', () => {
  const r = run(stats(
    { sigLanded: 14, sigAttempted: 40 },
    { sigLanded: 10, sigAttempted: 30, controlSec: 200, activeControlSec: 200,
      submissionAttempts: 2, positionalAdvances: 2 }
  ));
  assert.equal(r.criteria.effectiveGrappling.advantage, 'blue');
});

/* ---------- SCENARIO B: knockdown vs grappling ---------- */
t('B: a knockdown carries the round over grappling volume', () => {
  const r = run(stats(
    { sigLanded: 18, knockdowns: 1, damageObserved: 1 },
    { sigLanded: 15, takedownsLanded: 2, controlSec: 120, activeControlSec: 60 }
  ));
  assert.equal(r.winner, 'red');
  assert.equal(r.criteria.impact.advantage, 'red');
});

/* ---------- SCENARIO C: top control, no output ---------- */
t('C: top control with no offence does not win the round', () => {
  const r = run(stats(
    { sigLanded: 20, sigAttempted: 55 },
    { sigLanded: 3, controlSec: 240, activeControlSec: 0 }
  ));
  assert.equal(r.winner, 'red');
  assert.match(r.criteria.effectiveGrappling.warning || '', /not credited as effective grappling/);
});

/* ---------- SCENARIO D: submissions and position ---------- */
t('D: submission attempts and advances win effective grappling', () => {
  const r = run(stats(
    { sigLanded: 10 },
    { sigLanded: 8, submissionAttempts: 3, positionalAdvances: 3,
      activeControlSec: 150, controlSec: 150 }
  ));
  assert.equal(r.criteria.effectiveGrappling.advantage, 'blue');
  assert.equal(r.winner, 'blue');
});

/* ---------- SCENARIO E: genuinely even ---------- */
t('E: mirrored output is an even 10-10', () => {
  const same = { sigLanded: 20, sigAttempted: 50, takedownsLanded: 1, controlSec: 60, activeControlSec: 30 };
  const r = run(stats({ ...same }, { ...same }));
  assert.equal(r.winner, 'even');
  assert.equal(r.redScore, 10);
  assert.equal(r.blueScore, 10);
  assert.equal(r.margin, '10-10');
});

/* ---------- SCENARIO F: impact + dominance + duration ---------- */
t('F: domination across impact, dominance and duration gives 10-8', () => {
  const r = run(stats(
    { sigLanded: 55, sigAttempted: 90, knockdowns: 1, damageObserved: 2, cuts: 1,
      sustainedDefenceForced: 3, effectiveSequences: 3,
      controlSec: 200, activeControlSec: 200, positionalAdvances: 2 },
    { sigLanded: 6, sigAttempted: 20 }
  ));
  assert.equal(r.winner, 'red');
  assert.equal(r.margin, '10-8', `got ${r.margin}`);
  assert.equal(r.redScore, 10);
  assert.equal(r.blueScore, 8);
});

t('F2: 10-7 needs more than impact + dominance + duration', () => {
  // Two knockdowns against an opponent who offered nothing back.
  const r = run(stats(
    { sigLanded: 70, sigAttempted: 100, knockdowns: 2, damageObserved: 3, cuts: 2,
      sustainedDefenceForced: 4, effectiveSequences: 4,
      controlSec: 240, activeControlSec: 240, positionalAdvances: 3 },
    { sigLanded: 1, sigAttempted: 8 }
  ));
  assert.equal(r.margin, '10-7', `got ${r.margin}`);
  assert.equal(r.blueScore, 7);
  assert.match(r.limitations.join(' '), /exceptional/);
});

t('one knockdown against a competitive opponent is 10-8, not 10-7', () => {
  const r = run(stats(
    { sigLanded: 50, knockdowns: 1, damageObserved: 2, cuts: 1,
      sustainedDefenceForced: 3, effectiveSequences: 3,
      controlSec: 180, activeControlSec: 180 },
    { sigLanded: 14, takedownsLanded: 1 }   // blue did fight back
  ));
  assert.equal(r.margin, '10-8', `got ${r.margin}`);
});

/* ---------- THE CENTRAL GUARD ---------- */
t('counts alone never produce 10-8', () => {
  // 60 significant strikes to 30 — the spec's own example. No damage recorded.
  const r = run(stats(
    { sigLanded: 60, sigAttempted: 120 },
    { sigLanded: 30, sigAttempted: 80 }
  ));
  assert.equal(r.winner, 'red');
  assert.equal(r.margin, '10-9', `statistical superiority must stay 10-9, got ${r.margin}`);
  assert.match(r.limitations.join(' '), /wider than 10-9 cannot be supported/);
});

t('even a huge statistical gap stays 10-9 without impact evidence', () => {
  const r = run(stats(
    { sigLanded: 120, sigAttempted: 200, takedownsLanded: 6, controlSec: 280, activeControlSec: 280 },
    { sigLanded: 2, sigAttempted: 10 }
  ));
  assert.equal(r.margin, '10-9');
});

/* ---------- HIERARCHY ---------- */
t('Plan B is only reached when Plan A is even', () => {
  const r = run(stats(
    { sigLanded: 30, sigAttempted: 60 },
    { sigLanded: 10, sigAttempted: 90 }   // far more attempts = more aggressive
  ));
  assert.equal(r.winner, 'red', 'Plan A must decide');
  assert.equal(r.plan.used, 'A');
});

t('aggression decides only when the primaries are even', () => {
  const r = run(stats(
    { sigLanded: 10, sigAttempted: 60 },
    { sigLanded: 10, sigAttempted: 20 }
  ));
  assert.equal(r.plan.used, 'B');
  assert.equal(r.winner, 'red');
});

t('cage control is the last resort, not a shortcut', () => {
  const r = run(stats(
    { sigLanded: 5, sigAttempted: 12, controlSec: 200 },
    { sigLanded: 5, sigAttempted: 12, controlSec: 20 }
  ));
  assert.equal(r.plan.used, 'C');
  assert.equal(r.winner, 'red');
});

/* ---------- SCENARIO G: point deduction ---------- */
t('G: a referee deduction comes off the round score', () => {
  const r = run(stats({ sigLanded: 30 }, { sigLanded: 10 }), {
    deductions: { red: 0, blue: 1 },
  });
  assert.equal(r.redScore, 10);
  assert.equal(r.blueScore, 8, 'a 10-9 round with a blue deduction is 10-8');
  assert.match(r.explanation, /deductions applied/);
});

t('a deduction against the round winner still applies', () => {
  const r = run(stats({ sigLanded: 30 }, { sigLanded: 10 }), {
    deductions: { red: 1, blue: 0 },
  });
  assert.equal(r.redScore, 9);
  assert.equal(r.blueScore, 9);
});

/* ---------- SCENARIO H / J: incomplete round ---------- */
t('H/J: an incomplete round is flagged but still estimated', () => {
  const r = run(stats({ sigLanded: 25 }, { sigLanded: 8 }), { roundComplete: false });
  assert.equal(r.winner, 'red');
  assert.match(r.limitations.join(' '), /did not run its full length/);
});

t('an analyst can declare the evidence insufficient', () => {
  const r = run(stats({ sigLanded: 40 }, { sigLanded: 5 }), { insufficientEvidence: true });
  assert.equal(r.confidence, 'insufficient');
  assert.equal(r.redScore, null);
  assert.equal(r.winner, null);
});

t('a round with no recorded events yields no estimate', () => {
  const r = run(stats({}, {}, { eventCount: 0, controlIntervalCount: 0 }));
  assert.equal(r.confidence, 'insufficient');
  assert.equal(r.margin, null);
});

/* ---------- OVERRIDES ---------- */
t('an analyst override beats the computed criterion', () => {
  const r = run(stats({ sigLanded: 40 }, { sigLanded: 5 }), {
    overrides: { effectiveStriking: { advantage: 'blue', note: 'Red volume was arm punches.' } },
  });
  assert.equal(r.criteria.effectiveStriking.advantage, 'blue');
  assert.equal(r.criteria.effectiveStriking.overridden, true);
  assert.match(r.limitations.join(' '), /set manually by an analyst/);
});

/* ---------- CONFIDENCE ---------- */
t('confidence reflects evidence, not certainty', () => {
  const thin = run(stats({ sigLanded: 2 }, { sigLanded: 1 }, { eventCount: 3, controlIntervalCount: 0 }));
  assert.equal(thin.confidence, 'low');

  const rich = run(stats(
    { sigLanded: 30, knockdowns: 1, damageObserved: 2, activeControlSec: 90, controlSec: 90 },
    { sigLanded: 12 },
    { eventCount: 60, controlIntervalCount: 3 }
  ));
  assert.equal(rich.confidence, 'high');
});

t('an open control interval lowers the reported certainty', () => {
  const r = run(stats(
    { sigLanded: 30, knockdowns: 1, damageObserved: 2, activeControlSec: 90, controlSec: 90 },
    { sigLanded: 12 },
    { eventCount: 60, controlIntervalCount: 3, openControlIntervals: 1 }
  ));
  assert.notEqual(r.confidence, 'high');
  assert.match(r.limitations.join(' '), /still open/);
});

/* ---------- EXPLANATION ---------- */
t('every estimate carries an explanation and the disclaimer', () => {
  const r = run(stats({ sigLanded: 30, knockdowns: 1 }, { sigLanded: 10, controlSec: 90 }));
  assert.ok(r.explanation.length > 40);
  assert.match(r.disclaimer, /not official judges/i);
  assert.ok(Object.keys(r.criteria).length === 7);
});

/* ---------- SCORECARD ---------- */
t('the cumulative scorecard totals only scored rounds', () => {
  const card = buildScorecard([
    { roundNo: 1, redScore: 10, blueScore: 9, winner: 'red', margin: '10-9', confidence: 'high' },
    { roundNo: 2, redScore: 9, blueScore: 10, winner: 'blue', margin: '10-9', confidence: 'high' },
    { roundNo: 3, redScore: 10, blueScore: 8, winner: 'red', margin: '10-8', confidence: 'medium' },
  ]);
  assert.deepEqual(card.totals, { red: 29, blue: 27 });
  assert.equal(card.leader, 'red');
  assert.deepEqual(card.roundsWon, { red: 2, blue: 1, even: 0 });
});

t('unscored rounds are skipped, not counted as zero', () => {
  const card = buildScorecard([
    { roundNo: 1, redScore: 10, blueScore: 9, winner: 'red' },
    { roundNo: 2, redScore: null, blueScore: null, winner: null },
  ]);
  assert.deepEqual(card.totals, { red: 10, blue: 9 });
  assert.equal(card.roundsScored, 1);
  assert.equal(card.roundsUnscored, 1);
  assert.match(card.disclaimer, /NOT AN OFFICIAL/);
});

/* ---------- TUNABLES ---------- */
t('comparison rules are exported for audit', () => {
  assert.ok(COMPARISON.relativeEdge > 0);
  assert.ok(COMPARISON.minAbsolute.strikes >= 1);
});

console.log(`\n✅ ${pass.length} scoring-engine checks passed`);
pass.forEach((p) => console.log('   ✓', p));
