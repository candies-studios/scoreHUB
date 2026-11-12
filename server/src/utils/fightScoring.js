/**
 * ENGINE B — ESTIMATED ROUND SCORING
 * ==================================
 *
 * Produces an ANALYTICAL ESTIMATE of a round score. It is not a judge's
 * scorecard and must never be presented as one.
 *
 * It reads the statistics Engine A derived and never writes to them. The two
 * engines share no state in either direction.
 *
 * WHY THIS FILE IS SO HEAVILY COMMENTED
 * -------------------------------------
 * Judging criteria change when a commission amends its rules. Every judgement
 * call below is isolated in a named, exported constant or a small function so
 * it can be audited and retuned without unpicking the control flow.
 *
 * THE HIERARCHY (not negotiable)
 * ------------------------------
 *   Plan A  Effective striking and effective grappling.
 *   Plan B  Effective aggressiveness   — only consulted if Plan A is even.
 *   Plan C  Control of the fighting area — only if Plan A and Plan B are even.
 *
 * Plans B and C can never outrank Plan A. A fighter does not earn credit for
 * walking forwards or standing in the middle of the cage.
 *
 * THE MARGIN RULE (the one most systems get wrong)
 * ------------------------------------------------
 * Winning a round gives 10-9. Anything wider — 10-8 or 10-7 — is a statement
 * about impact, dominance and duration, NOT about counts. A fighter who lands
 * 60 significant strikes to 30 has not thereby earned a 10-8.
 *
 * So the engine will not widen the margin on numbers alone. Escalation past
 * 10-9 requires qualitative evidence that somebody actually recorded: a
 * knockdown, visible damage, a cut, swelling, an opponent forced into sustained
 * defence. With no such evidence on file the estimate is capped at 10-9 and
 * says why. That is a deliberate refusal to guess, not a gap.
 */

import { pct } from './fightStats.js';

export const DISCLAIMER =
  'Estimated analytical scoring only. These are not official judges’ scorecards or regulatory decisions.';

/**
 * Tunable comparison rules. These decide only WHO LEADS a criterion — never
 * how wide the margin is. A lead must clear both bars: a relative edge and an
 * absolute one, so 1 strike to 0 is not an "advantage".
 */
export const COMPARISON = {
  /** Fractional edge over the opponent needed to call a criterion. 0.25 = 25% more. */
  relativeEdge: 0.25,
  /** Minimum absolute difference, so tiny samples cannot swing a criterion. */
  minAbsolute: {
    strikes: 3,
    grappling: 1.5,
    aggression: 4,
    duration: 30,
    control: 45,
  },
  /** Below this much recorded activity a criterion is "insufficient", not "even". */
  minimumEvidence: {
    strikes: 2,
    grappling: 1,
    aggression: 3,
  },
};

/**
 * Weights used to fold several grappling actions into one comparable number.
 * These express relative scoring value, e.g. a completed takedown counts for
 * more than an attempt, a submission attempt for more than a positional step.
 */
export const GRAPPLING_WEIGHTS = {
  takedownLanded: 3,
  submissionAttempt: 3,
  reversal: 2,
  sweep: 2,
  positionalAdvance: 1.5,
  /**
   * Control time counts ONLY when the fighter was working from it, and even
   * then modestly. Per minute of ACTIVE control. Idle control contributes zero
   * to effective grappling by design — holding somebody down is not offence.
   */
  activeControlPerMinute: 1.5,
};

export const IMPACT_WEIGHTS = {
  knockdown: 5,
  damageObserved: 2,
  cut: 2,
  swelling: 1.5,
};

export const CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INSUFFICIENT: 'insufficient',
};

/* ------------------------------------------------------------------ *
 * Comparison helper
 * ------------------------------------------------------------------ */

/**
 * Decide which corner leads on a single measure.
 * Returns 'red' | 'blue' | 'even' | 'insufficient'.
 */
function compare(redValue, blueValue, { minAbs, minEvidence = 0 }) {
  const total = redValue + blueValue;
  if (total < minEvidence) return 'insufficient';

  const diff = Math.abs(redValue - blueValue);
  if (diff < minAbs) return 'even';

  const higher = Math.max(redValue, blueValue);
  const lower = Math.min(redValue, blueValue);
  // Relative edge guards against calling 100 vs 97 an advantage.
  const edge = lower === 0 ? 1 : (higher - lower) / lower;
  if (edge < COMPARISON.relativeEdge) return 'even';

  return redValue > blueValue ? 'red' : 'blue';
}

const other = (corner) => (corner === 'red' ? 'blue' : 'red');

/* ------------------------------------------------------------------ *
 * The seven criteria
 * ------------------------------------------------------------------ */

/**
 * Effective striking.
 * Significant strikes landed are the backbone, but they are a PROXY for impact,
 * not impact itself — which is why knockdowns and recorded damage nudge this
 * and why `impact` is assessed separately below.
 */
function assessStriking(red, blue) {
  const score = (c) => c.sigLanded + c.knockdowns * IMPACT_WEIGHTS.knockdown;
  const r = score(red);
  const b = score(blue);

  const advantage = compare(r, b, {
    minAbs: COMPARISON.minAbsolute.strikes,
    minEvidence: COMPARISON.minimumEvidence.strikes,
  });

  return {
    advantage,
    support: {
      'Significant strikes': `${red.sigLanded}/${red.sigAttempted} (${pct(red.sigLanded, red.sigAttempted)}%) vs ${blue.sigLanded}/${blue.sigAttempted} (${pct(blue.sigLanded, blue.sigAttempted)}%)`,
      'Total strikes': `${red.totalLanded} vs ${blue.totalLanded}`,
      'Head strikes': `${red.headLanded} vs ${blue.headLanded}`,
      Knockdowns: `${red.knockdowns} vs ${blue.knockdowns}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'Too little striking recorded to compare.'
        : advantage === 'even'
        ? 'Striking output is close enough that neither corner clearly leads.'
        : `${cap(advantage)} landed the more telling significant striking${
            (advantage === 'red' ? red.knockdowns : blue.knockdowns) > 0 ? ', including a knockdown' : ''
          }.`,
  };
}

/**
 * Effective grappling.
 * Weighted offensive grappling actions plus ACTIVE control only. Idle control
 * time is reported alongside but contributes nothing — see GRAPPLING_WEIGHTS.
 */
function assessGrappling(red, blue) {
  const score = (c) =>
    c.takedownsLanded * GRAPPLING_WEIGHTS.takedownLanded +
    c.submissionAttempts * GRAPPLING_WEIGHTS.submissionAttempt +
    c.reversals * GRAPPLING_WEIGHTS.reversal +
    c.sweeps * GRAPPLING_WEIGHTS.sweep +
    c.positionalAdvances * GRAPPLING_WEIGHTS.positionalAdvance +
    (c.activeControlSec / 60) * GRAPPLING_WEIGHTS.activeControlPerMinute;

  const r = score(red);
  const b = score(blue);

  const advantage = compare(r, b, {
    minAbs: COMPARISON.minAbsolute.grappling,
    minEvidence: COMPARISON.minimumEvidence.grappling,
  });

  // Flag the classic trap: lots of control, nothing done with it.
  const idleRed = red.controlSec - red.activeControlSec;
  const idleBlue = blue.controlSec - blue.activeControlSec;
  const idleWarning =
    idleRed > 60 || idleBlue > 60
      ? `Control without recorded offensive output is not credited as effective grappling (red ${fmtSec(idleRed)} idle, blue ${fmtSec(idleBlue)} idle).`
      : null;

  return {
    advantage,
    support: {
      Takedowns: `${red.takedownsLanded}/${red.takedownsAttempted} vs ${blue.takedownsLanded}/${blue.takedownsAttempted}`,
      'Submission attempts': `${red.submissionAttempts} vs ${blue.submissionAttempts}`,
      'Reversals / sweeps': `${red.reversals + red.sweeps} vs ${blue.reversals + blue.sweeps}`,
      'Positional advances': `${red.positionalAdvances} vs ${blue.positionalAdvances}`,
      'Control time': `${fmtSec(red.controlSec)} vs ${fmtSec(blue.controlSec)}`,
      'Active control': `${fmtSec(red.activeControlSec)} vs ${fmtSec(blue.activeControlSec)}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'No meaningful grappling recorded in this round.'
        : advantage === 'even'
        ? 'Grappling exchanges were broadly balanced.'
        : `${cap(advantage)} produced the more effective grappling.`,
    warning: idleWarning,
  };
}

/**
 * IMPACT — strictly qualitative.
 * Knockdowns and recorded observations only. If nobody logged any, this is
 * 'insufficient', which is what stops the margin widening on counts alone.
 */
function assessImpact(red, blue) {
  const score = (c) =>
    c.knockdowns * IMPACT_WEIGHTS.knockdown +
    c.damageObserved * IMPACT_WEIGHTS.damageObserved +
    c.cuts * IMPACT_WEIGHTS.cut +
    c.swelling * IMPACT_WEIGHTS.swelling;

  const r = score(red);
  const b = score(blue);
  const evidence = r + b;

  // No knockdown, no damage note: there is simply nothing to assess.
  const advantage = evidence === 0 ? 'insufficient' : compare(r, b, { minAbs: 1.5 });

  return {
    advantage,
    hasEvidence: evidence > 0,
    support: {
      Knockdowns: `${red.knockdowns} vs ${blue.knockdowns}`,
      'Damage observed': `${red.damageObserved} vs ${blue.damageObserved}`,
      'Cuts / swelling': `${red.cuts + red.swelling} vs ${blue.cuts + blue.swelling}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'No knockdowns or damage observations recorded, so impact cannot be assessed.'
        : advantage === 'even'
        ? 'Both corners caused comparable recorded damage.'
        : `${cap(advantage)} caused the greater recorded impact.`,
  };
}

/**
 * DOMINANCE.
 * Sustained pressure and meaningful offensive grappling. Explicitly NOT raw
 * control time — the rules say holding a dominant position is not by itself
 * evidence of dominance.
 */
function assessDominance(red, blue) {
  const score = (c) =>
    c.sustainedDefenceForced * 3 +
    c.effectiveSequences * 2 +
    c.submissionAttempts * 2 +
    c.positionalAdvances * 1.5 +
    (c.activeControlSec / 60) * 1.5;

  const r = score(red);
  const b = score(blue);
  const evidence = r + b;

  const advantage = evidence === 0 ? 'insufficient' : compare(r, b, { minAbs: 2 });

  return {
    advantage,
    hasEvidence: evidence > 0,
    support: {
      'Opponent forced to defend': `${red.sustainedDefenceForced} vs ${blue.sustainedDefenceForced}`,
      'Effective sequences': `${red.effectiveSequences} vs ${blue.effectiveSequences}`,
      'Submission attempts': `${red.submissionAttempts} vs ${blue.submissionAttempts}`,
      'Active control': `${fmtSec(red.activeControlSec)} vs ${fmtSec(blue.activeControlSec)}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'No sustained pressure or offensive grappling recorded.'
        : advantage === 'even'
        ? 'Neither corner sustained clear dominance.'
        : `${cap(advantage)} sustained the greater offensive pressure.`,
  };
}

/**
 * DURATION — how much of the round each fighter spent effectively attacking.
 * Active control plus recorded effective sequences, as a share of the round.
 */
function assessDuration(red, blue, roundLengthSec) {
  const score = (c) => c.activeControlSec + c.effectiveSequences * 15;
  const r = score(red);
  const b = score(blue);
  const evidence = r + b;

  const advantage = evidence === 0 ? 'insufficient' : compare(r, b, { minAbs: COMPARISON.minAbsolute.duration });

  const share = (v) => (roundLengthSec > 0 ? Math.round((v / roundLengthSec) * 100) : 0);

  return {
    advantage,
    hasEvidence: evidence > 0,
    support: {
      'Effective offence time': `${fmtSec(r)} (${share(r)}%) vs ${fmtSec(b)} (${share(b)}%)`,
      'Active control': `${fmtSec(red.activeControlSec)} vs ${fmtSec(blue.activeControlSec)}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'Not enough timed activity recorded to assess duration.'
        : advantage === 'even'
        ? 'Both corners were effective for comparable stretches.'
        : `${cap(advantage)} was effective for the longer portion of the round.`,
  };
}

/** PLAN B — effective aggressiveness. Forward pressure that actually lands work. */
function assessAggression(red, blue) {
  const score = (c) => c.sigAttempted + c.takedownsAttempted * 2;
  const r = score(red);
  const b = score(blue);

  const advantage = compare(r, b, {
    minAbs: COMPARISON.minAbsolute.aggression,
    minEvidence: COMPARISON.minimumEvidence.aggression,
  });

  return {
    advantage,
    support: {
      'Strikes attempted': `${red.sigAttempted} vs ${blue.sigAttempted}`,
      'Takedowns attempted': `${red.takedownsAttempted} vs ${blue.takedownsAttempted}`,
    },
    rationale:
      advantage === 'insufficient'
        ? 'Too little recorded to judge aggression.'
        : advantage === 'even'
        ? 'Both corners pressed at a similar rate.'
        : `${cap(advantage)} pressed the action more consistently.`,
    note: 'Secondary criterion. Considered only because the primary criteria were even.',
  };
}

/** PLAN C — control of the fighting area. Last resort, lowest weight. */
function assessCageControl(red, blue) {
  const r = red.controlSec;
  const b = blue.controlSec;
  const advantage = r + b === 0 ? 'insufficient' : compare(r, b, { minAbs: COMPARISON.minAbsolute.control });

  return {
    advantage,
    support: { 'Control time': `${fmtSec(r)} vs ${fmtSec(b)}` },
    rationale:
      advantage === 'insufficient'
        ? 'No control intervals recorded.'
        : advantage === 'even'
        ? 'Neither corner dictated where the fight took place.'
        : `${cap(advantage)} dictated the location of the fight for longer.`,
    note: 'Tertiary criterion. Considered only because the primary and secondary criteria were even.',
  };
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

/**
 * Estimate a round.
 *
 * @param {object}  stats               output of fightStats.getStats for this round
 * @param {object}  [overrides]         per-criterion analyst overrides
 * @param {boolean} [insufficientEvidence] analyst flagged the round unscoreable
 * @param {number}  [roundLengthSec]    scheduled round length
 * @param {boolean} [roundComplete]     did the round run its full length
 * @param {object}  [deductions]        { red, blue } points the referee removed
 */
export function assessRound({
  stats,
  overrides = {},
  insufficientEvidence = false,
  roundLengthSec = 300,
  roundComplete = true,
  deductions = { red: 0, blue: 0 },
}) {
  const { red, blue } = stats;
  const limitations = [];

  // --- the seven criteria, computed then optionally overridden -------------
  const computed = {
    effectiveStriking: assessStriking(red, blue),
    effectiveGrappling: assessGrappling(red, blue),
    impact: assessImpact(red, blue),
    dominance: assessDominance(red, blue),
    duration: assessDuration(red, blue, roundLengthSec),
    effectiveAggression: assessAggression(red, blue),
    cageControl: assessCageControl(red, blue),
  };

  const criteria = {};
  for (const [key, value] of Object.entries(computed)) {
    const ov = overrides?.[key];
    const overridden = ov && ov.advantage;
    criteria[key] = {
      ...value,
      advantage: overridden ? ov.advantage : value.advantage,
      overridden: Boolean(overridden),
      analystNote: ov?.note || '',
    };
    if (overridden) {
      limitations.push(`${labelOf(key)} was set manually by an analyst, overriding the computed assessment.`);
    }
  }

  // --- the analyst can stop the whole thing --------------------------------
  if (insufficientEvidence) {
    return result({
      winner: null,
      redScore: null,
      blueScore: null,
      margin: null,
      criteria,
      plan: { used: null, reason: 'Analyst flagged the evidence as insufficient.' },
      confidence: CONFIDENCE.INSUFFICIENT,
      explanation: 'An analyst marked this round as having insufficient evidence to estimate a score.',
      limitations: ['Analyst flagged insufficient evidence.'],
      deductions,
    });
  }

  // --- nothing recorded at all ---------------------------------------------
  if (stats.eventCount === 0) {
    return result({
      winner: null,
      redScore: null,
      blueScore: null,
      margin: null,
      criteria,
      plan: { used: null, reason: 'No fight events recorded for this round.' },
      confidence: CONFIDENCE.INSUFFICIENT,
      explanation: 'No activity has been recorded for this round, so no estimate can be made.',
      limitations: ['No fight events recorded.'],
      deductions,
    });
  }

  /* ---------------- PLAN A ------------------------------------------------
   * Effective striking and effective grappling. Everything below hangs off
   * this: Plans B and C are only reached when Plan A cannot separate them.
   */
  const striking = criteria.effectiveStriking.advantage;
  const grappling = criteria.effectiveGrappling.advantage;

  let winner = null;
  let planUsed = null;
  let planReason = '';

  const decisive = (a) => a === 'red' || a === 'blue';

  if (decisive(striking) && decisive(grappling)) {
    if (striking === grappling) {
      winner = striking;
      planReason = 'Led both effective striking and effective grappling.';
    } else {
      // Split primaries. Fall back to impact — the quality measure — rather
      // than letting raw volume decide. If impact cannot separate them either,
      // the primaries are genuinely even and we move to Plan B.
      const impact = criteria.impact.advantage;
      if (decisive(impact)) {
        winner = impact;
        planReason =
          'Effective striking and effective grappling favoured different corners; the greater recorded impact decided it.';
      } else {
        planReason =
          'Effective striking and effective grappling favoured different corners with no decisive impact between them.';
      }
    }
    planUsed = 'A';
  } else if (decisive(striking)) {
    winner = striking;
    planUsed = 'A';
    planReason = 'Led effective striking, with grappling not a separating factor.';
  } else if (decisive(grappling)) {
    winner = grappling;
    planUsed = 'A';
    planReason = 'Led effective grappling, with striking not a separating factor.';
  }

  /* ---------------- PLAN B ---------------------------------------------- */
  if (!winner) {
    const aggression = criteria.effectiveAggression.advantage;
    if (decisive(aggression)) {
      winner = aggression;
      planUsed = 'B';
      planReason = 'Primary criteria were even; effective aggressiveness separated the corners.';
    }
  }

  /* ---------------- PLAN C ---------------------------------------------- */
  if (!winner) {
    const cage = criteria.cageControl.advantage;
    if (decisive(cage)) {
      winner = cage;
      planUsed = 'C';
      planReason =
        'Primary and secondary criteria were even; control of the fighting area separated the corners.';
    }
  }

  /* ---------------- No winner: 10-10 ------------------------------------- */
  if (!winner) {
    const scored = applyDeductions(10, 10, deductions);
    return result({
      winner: 'even',
      redScore: scored.red,
      blueScore: scored.blue,
      margin: '10-10',
      criteria,
      plan: { used: planUsed, reason: planReason || 'No criterion separated the corners.' },
      confidence: confidenceFor(stats, criteria, roundComplete, limitations),
      explanation: buildExplanation({ winner: 'even', margin: '10-10', criteria, planUsed, deductions }),
      limitations,
      deductions,
    });
  }

  /* ---------------- MARGIN: impact, dominance, duration -------------------
   * A win is 10-9 unless impact, dominance and duration say otherwise — and
   * those must rest on recorded qualitative evidence, never on counts.
   */
  const loser = other(winner);
  const holds = (key) => criteria[key].advantage === winner;

  const impactEvidence = computed.impact.hasEvidence;
  const idd = ['impact', 'dominance', 'duration'].filter(holds);

  let margin = '10-9';

  if (!impactEvidence) {
    // The guard that makes this engine honest.
    limitations.push(
      'No knockdown or damage observation was recorded, so a margin wider than 10-9 cannot be supported. ' +
        'Statistical superiority alone never justifies 10-8.'
    );
  } else if (idd.length >= 3 && (red.knockdowns + blue.knockdowns > 0) && criteria.impact.advantage === winner) {
    // 10-7 is reserved for complete domination and is rare. Even here the
    // engine asks a human to confirm rather than asserting it.
    const winnerStats = winner === 'red' ? red : blue;
    const loserStats = winner === 'red' ? blue : red;

    /**
     * 10-7 means complete domination — in practice a round the referee came
     * close to stopping. Dominating impact, dominance AND duration is the
     * description of a 10-8; 10-7 needs more than that on top.
     *
     * Either multiple knockdowns, or a knockdown against an opponent who
     * mounted essentially no offence of their own all round.
     */
    const loserHadNoOffence =
      loserStats.sigLanded <= 2 &&
      loserStats.observationCount === 0 &&
      loserStats.takedownsLanded === 0 &&
      loserStats.submissionAttempts === 0;

    const overwhelming =
      winnerStats.knockdowns >= 2 ||
      (winnerStats.knockdowns >= 1 && winnerStats.observationCount >= 5 && loserHadNoOffence);
    if (overwhelming) {
      margin = '10-7';
      limitations.push('A 10-7 estimate is exceptional. Confirm against video before relying on it.');
    } else {
      margin = '10-8';
    }
  } else if (idd.length >= 2 && holds('impact')) {
    margin = '10-8';
  }

  if (!roundComplete) {
    limitations.push('Round did not run its full length; duration-based assessment is partial.');
  }

  const base = margin === '10-7' ? 7 : margin === '10-8' ? 8 : 9;
  const rawRed = winner === 'red' ? 10 : base;
  const rawBlue = winner === 'blue' ? 10 : base;
  const scored = applyDeductions(rawRed, rawBlue, deductions);

  return result({
    winner,
    redScore: scored.red,
    blueScore: scored.blue,
    margin,
    criteria,
    plan: { used: planUsed, reason: planReason },
    confidence: confidenceFor(stats, criteria, roundComplete, limitations),
    explanation: buildExplanation({ winner, margin, criteria, planUsed, deductions, loser }),
    limitations,
    deductions,
  });
}

/* ------------------------------------------------------------------ *
 * Supporting pieces
 * ------------------------------------------------------------------ */

function applyDeductions(redScore, blueScore, deductions = {}) {
  return {
    red: redScore - (deductions.red || 0),
    blue: blueScore - (deductions.blue || 0),
  };
}

/**
 * Confidence describes how complete the EVIDENCE is — not how likely the
 * official judges are to agree. Manufacturing a percentage here would imply a
 * validated predictive model, which this is not.
 */
function confidenceFor(stats, criteria, roundComplete, limitations) {
  const events = stats.eventCount;
  const hasControl = stats.controlIntervalCount > 0;
  const hasObservations =
    (stats.red.observationCount || 0) + (stats.blue.observationCount || 0) > 0;
  const openIntervals = stats.openControlIntervals > 0;

  if (events === 0) return CONFIDENCE.INSUFFICIENT;
  if (events < 8) return CONFIDENCE.LOW;

  if (openIntervals) limitations.push('A control interval is still open; control time is provisional.');
  if (!hasControl) limitations.push('No control intervals were recorded, so grappling duration is unmeasured.');
  if (!hasObservations) limitations.push('No qualitative observations recorded; impact is unassessed.');

  if (events >= 25 && hasControl && hasObservations && roundComplete && !openIntervals) {
    return CONFIDENCE.HIGH;
  }
  if (events >= 12 && (hasControl || hasObservations)) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.LOW;
}

function buildExplanation({ winner, margin, criteria, planUsed, deductions, loser }) {
  if (winner === 'even') {
    const parts = ['Neither corner established an advantage under the primary criteria'];
    if (planUsed) parts.push('and the secondary criteria did not separate them either');
    let text = `${parts.join(' ')}. Estimated an even round at 10-10.`;
    text += deductionSentence(deductions);
    return text;
  }

  const w = cap(winner);
  const l = cap(loser);
  const led = Object.entries(criteria)
    .filter(([, v]) => v.advantage === winner)
    .map(([k]) => labelOf(k).toLowerCase());
  const lost = Object.entries(criteria)
    .filter(([, v]) => v.advantage === loser)
    .map(([k]) => labelOf(k).toLowerCase());

  let text = `${w} Corner is estimated to win this round ${margin}`;
  text += led.length ? `, leading on ${listify(led)}.` : '.';

  if (lost.length) {
    text += ` ${l} Corner led on ${listify(lost)}, but this did not outweigh the primary criteria.`;
  }

  if (planUsed === 'B') {
    text += ' Effective striking and grappling were even, so effective aggressiveness was decisive.';
  } else if (planUsed === 'C') {
    text += ' The primary and secondary criteria were even, so control of the fighting area was decisive.';
  }

  if (margin === '10-9') {
    text += ' The margin stays at 10-9: a wider score requires recorded impact, dominance and duration.';
  } else {
    text += ` The ${margin} estimate rests on recorded impact together with dominance or duration.`;
  }

  text += deductionSentence(deductions);
  return text;
}

function deductionSentence(deductions = {}) {
  const bits = [];
  if (deductions.red) bits.push(`Red ${deductions.red}`);
  if (deductions.blue) bits.push(`Blue ${deductions.blue}`);
  if (!bits.length) return '';
  return ` Referee point deductions applied: ${bits.join(', ')}.`;
}

function result(payload) {
  return { ...payload, disclaimer: DISCLAIMER };
}

const LABELS = {
  effectiveStriking: 'Effective striking',
  effectiveGrappling: 'Effective grappling',
  impact: 'Impact',
  dominance: 'Dominance',
  duration: 'Duration',
  effectiveAggression: 'Effective aggression',
  cageControl: 'Fighting area control',
};
const labelOf = (k) => LABELS[k] || k;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function listify(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function fmtSec(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Cumulative estimated scorecard across rounds.
 * Rounds with no estimate are skipped rather than counted as zero.
 */
export function buildScorecard(roundEstimates) {
  const rows = roundEstimates.map((e) => ({
    roundNo: e.roundNo,
    red: e.redScore,
    blue: e.blueScore,
    winner: e.winner,
    margin: e.margin,
    confidence: e.confidence,
    scored: e.redScore !== null && e.blueScore !== null,
  }));

  const scoredRows = rows.filter((r) => r.scored);
  const totals = scoredRows.reduce(
    (acc, r) => ({ red: acc.red + r.red, blue: acc.blue + r.blue }),
    { red: 0, blue: 0 }
  );

  const roundsWon = scoredRows.reduce(
    (acc, r) => {
      if (r.winner === 'red') acc.red += 1;
      else if (r.winner === 'blue') acc.blue += 1;
      else acc.even += 1;
      return acc;
    },
    { red: 0, blue: 0, even: 0 }
  );

  const leader =
    scoredRows.length === 0
      ? null
      : totals.red > totals.blue
      ? 'red'
      : totals.blue > totals.red
      ? 'blue'
      : 'even';

  return {
    rows,
    totals,
    roundsWon,
    leader,
    roundsScored: scoredRows.length,
    roundsUnscored: rows.length - scoredRows.length,
    disclaimer:
      'UNOFFICIAL ANALYTICAL ESTIMATE — NOT AN OFFICIAL JUDGES’ SCORECARD.',
  };
}
