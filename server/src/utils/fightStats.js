import FightEvent, { COUNT_EVENTS, OBSERVATION_EVENTS } from '../models/FightEvent.js';
import ControlInterval from '../models/ControlInterval.js';
import FoulRecord from '../models/FoulRecord.js';

/**
 * ENGINE A — statistics, derived.
 *
 * Nothing in here is stored as a running total. Every number is recomputed from
 * the FightEvent log and the ControlInterval list, which is what makes a
 * correction safe: void the event and the totals follow, with no counter left
 * behind and no chance of double counting.
 */

export const emptyCorner = () => ({
  sigLanded: 0,
  sigAttempted: 0,
  totalLanded: 0,
  totalAttempted: 0,

  headLanded: 0,
  headAttempted: 0,
  bodyLanded: 0,
  bodyAttempted: 0,
  legLanded: 0,
  legAttempted: 0,

  distanceLanded: 0,
  distanceAttempted: 0,
  clinchLanded: 0,
  clinchAttempted: 0,
  groundLanded: 0,
  groundAttempted: 0,

  knockdowns: 0,

  takedownsLanded: 0,
  takedownsAttempted: 0,
  submissionAttempts: 0,
  reversals: 0,
  sweeps: 0,
  positionalAdvances: 0,
  escapes: 0,

  controlSec: 0,
  /** Control time where the fighter was actually working. */
  activeControlSec: 0,

  // Qualitative observations — counts of analyst notes, never mixed into the
  // striking numbers above.
  damageObserved: 0,
  cuts: 0,
  swelling: 0,
  sustainedDefenceForced: 0,
  effectiveSequences: 0,
  otherSignificant: 0,

  pointsDeducted: 0,
});

const TARGET_KEYS = { head: 'head', body: 'body', leg: 'leg' };
const POSITION_KEYS = { distance: 'distance', clinch: 'clinch', ground: 'ground' };

const OBSERVATION_FIELD = {
  damage_observed: 'damageObserved',
  cut_laceration: 'cuts',
  visible_swelling: 'swelling',
  sustained_defence_forced: 'sustainedDefenceForced',
  effective_sequence: 'effectiveSequences',
  other_significant: 'otherSignificant',
};

const COUNT_FIELD = {
  knockdown: 'knockdowns',
  takedown_landed: 'takedownsLanded',
  takedown_attempted: 'takedownsAttempted',
  submission_attempt: 'submissionAttempts',
  reversal: 'reversals',
  sweep: 'sweeps',
  positional_advance: 'positionalAdvances',
  escape: 'escapes',
};

function applyEvent(acc, ev) {
  const c = acc[ev.corner];
  if (!c) return;

  switch (ev.type) {
    case 'sig_strike_landed':
      c.sigLanded += 1;
      // A significant strike is also a strike. Recording the landed/attempted
      // pair separately would double count, so total strikes absorb it here.
      c.totalLanded += 1;
      bucketStrike(c, ev, 'Landed');
      break;

    case 'sig_strike_attempted':
      c.sigAttempted += 1;
      c.totalAttempted += 1;
      bucketStrike(c, ev, 'Attempted');
      break;

    case 'total_strike_landed':
      c.totalLanded += 1;
      bucketStrike(c, ev, 'Landed');
      break;

    case 'total_strike_attempted':
      c.totalAttempted += 1;
      bucketStrike(c, ev, 'Attempted');
      break;

    default: {
      const countField = COUNT_FIELD[ev.type];
      if (countField) {
        c[countField] += 1;
        break;
      }
      const obsField = OBSERVATION_FIELD[ev.type];
      if (obsField) c[obsField] += 1;
    }
  }
}

function bucketStrike(c, ev, suffix) {
  const t = TARGET_KEYS[ev.target];
  if (t) c[`${t}${suffix}`] += 1;
  const p = POSITION_KEYS[ev.position];
  if (p) c[`${p}${suffix}`] += 1;
}

/**
 * Resolve attempts from the two kinds of tap.
 *
 * An `*_attempted` event means a throw that did NOT land — that is the whole
 * point of having a separate button, so the operator taps once per action
 * rather than twice for everything that connects.
 *
 * Attempts are therefore misses PLUS landed, which is the usual definition
 * and makes accuracy = landed / attempted come out right. A fighter who lands
 * 12 and misses 8 shows 12/20 at 60%, not 12/8 at 150%.
 */
function reconcileAttempts(c) {
  c.sigAttempted += c.sigLanded;
  c.totalAttempted += c.totalLanded;
  c.takedownsAttempted += c.takedownsLanded;
  for (const k of ['head', 'body', 'leg', 'distance', 'clinch', 'ground']) {
    c[`${k}Attempted`] += c[`${k}Landed`];
  }
}

export const pct = (landed, attempted) =>
  !attempted || attempted <= 0 ? 0 : Math.round((landed / attempted) * 1000) / 10;

/**
 * The pure core: fold raw records into a statistics object.
 *
 * Kept free of database calls so the counting rules — which are the easiest
 * thing in the system to get subtly wrong — can be tested directly.
 *
 * Callers must pass already-filtered records (not voided, right round).
 */
export function aggregate({ events = [], intervals = [], fouls = [], nowSec = null, roundNo = null }) {
  const acc = { red: emptyCorner(), blue: emptyCorner() };
  events.forEach((ev) => applyEvent(acc, ev));

  for (const iv of intervals) {
    const end = iv.endSec ?? (nowSec !== null ? nowSec : iv.startSec);
    const dur = Math.max(0, end - iv.startSec);
    const c = acc[iv.corner];
    if (!c) continue;
    c.controlSec += dur;
    if (iv.offensiveOutput) c.activeControlSec += dur;
  }

  // A deduction belongs to the fighter who committed the foul.
  for (const f of fouls) {
    const c = acc[f.corner];
    if (c) c.pointsDeducted += f.pointsDeducted || 0;
  }

  for (const corner of ['red', 'blue']) {
    reconcileAttempts(acc[corner]);
    const c = acc[corner];
    c.sigAccuracy = pct(c.sigLanded, c.sigAttempted);
    c.totalAccuracy = pct(c.totalLanded, c.totalAttempted);
    c.takedownAccuracy = pct(c.takedownsLanded, c.takedownsAttempted);
    c.observationCount =
      c.damageObserved + c.cuts + c.swelling + c.sustainedDefenceForced + c.effectiveSequences + c.otherSignificant;
  }

  return {
    roundNo,
    red: acc.red,
    blue: acc.blue,
    differentials: differentials(acc.red, acc.blue),
    eventCount: events.length,
    controlIntervalCount: intervals.length,
    openControlIntervals: intervals.filter((i) => i.endSec === null || i.endSec === undefined).length,
    foulCount: fouls.length,
  };
}

/**
 * Aggregate one round, or the whole fight when roundNo is null.
 * `nowSec` lets an open control interval be counted up to the present.
 */
export async function getStats(boutId, roundNo = null, nowSec = null) {
  const eventFilter = { bout: boutId, voided: false };
  const controlFilter = { bout: boutId, voided: false };
  const foulFilter = { bout: boutId, voided: false };
  if (roundNo !== null) {
    eventFilter.roundNo = roundNo;
    controlFilter.roundNo = roundNo;
    foulFilter.roundNo = roundNo;
  }

  const [events, intervals, fouls] = await Promise.all([
    FightEvent.find(eventFilter).lean(),
    ControlInterval.find(controlFilter).lean(),
    FoulRecord.find(foulFilter).lean(),
  ]);

  return aggregate({ events, intervals, fouls, nowSec, roundNo });
}

/** Red minus blue, so a positive number always favours red. */
export function differentials(red, blue) {
  const d = (k) => (red[k] || 0) - (blue[k] || 0);
  return {
    sigStrikes: d('sigLanded'),
    totalStrikes: d('totalLanded'),
    knockdowns: d('knockdowns'),
    takedowns: d('takedownsLanded'),
    submissionAttempts: d('submissionAttempts'),
    controlSec: d('controlSec'),
    activeControlSec: d('activeControlSec'),
    reversals: d('reversals'),
    positionalAdvances: d('positionalAdvances'),
    observations: d('observationCount'),
  };
}

/** Per-round stats for every round up to totalRounds, plus a fight total. */
export async function getAllRoundStats(boutId, totalRounds, nowSec = null) {
  const rounds = [];
  for (let r = 1; r <= totalRounds; r += 1) {
    // Sequential rather than parallel: a handful of small queries per round,
    // and this keeps connection use flat on a free-tier database.
    // eslint-disable-next-line no-await-in-loop
    rounds.push(await getStats(boutId, r, nowSec));
  }
  const fight = await getStats(boutId, null, nowSec);
  return { rounds, fight };
}

export { COUNT_EVENTS, OBSERVATION_EVENTS };
