export const DISCLAIMER =
  'Estimated analytical scoring only. These are not official judges’ scorecards or regulatory decisions.';

export const SCORECARD_DISCLAIMER =
  'UNOFFICIAL ANALYTICAL ESTIMATE — NOT AN OFFICIAL JUDGES’ SCORECARD.';

/** Statistician roles. See docs/ANALYTICS.md on why these are not security. */
export const ROLES = [
  { value: 'statistician', label: 'Statistician', can: 'Record fight events and control time' },
  { value: 'analyst', label: 'Analyst', can: 'Review estimates and override criteria' },
  { value: 'public', label: 'Spectator', can: 'Watch only' },
];

export const STRIKE_TARGETS = [
  { value: 'head', label: 'Head' },
  { value: 'body', label: 'Body' },
  { value: 'leg', label: 'Leg' },
];

export const STRIKE_POSITIONS = [
  { value: 'distance', label: 'Distance' },
  { value: 'clinch', label: 'Clinch' },
  { value: 'ground', label: 'Ground' },
];

/**
 * Objective counters.
 *
 * "missed" maps to the `*_attempted` event types. One tap per action: hit the
 * landed key when it connects, the missed key when it does not. Attempts are
 * derived as misses + landed, so nothing is tapped twice.
 */
export const STRIKE_BUTTONS = [
  { type: 'sig_strike_landed', label: 'Sig. strike', sub: 'landed', tone: 'primary' },
  { type: 'sig_strike_attempted', label: 'Sig. strike', sub: 'missed', tone: 'ghost' },
  { type: 'total_strike_landed', label: 'Strike', sub: 'landed', tone: 'primary' },
  { type: 'total_strike_attempted', label: 'Strike', sub: 'missed', tone: 'ghost' },
  { type: 'knockdown', label: 'Knockdown', sub: '', tone: 'alert' },
];

export const GRAPPLING_BUTTONS = [
  { type: 'takedown_landed', label: 'Takedown', sub: 'landed', tone: 'primary' },
  { type: 'takedown_attempted', label: 'Takedown', sub: 'stuffed', tone: 'ghost' },
  { type: 'submission_attempt', label: 'Submission', sub: 'attempt', tone: 'primary' },
  { type: 'reversal', label: 'Reversal', sub: '', tone: 'primary' },
  { type: 'sweep', label: 'Sweep', sub: '', tone: 'primary' },
  { type: 'positional_advance', label: 'Advance', sub: 'position', tone: 'primary' },
  { type: 'escape', label: 'Escape', sub: '', tone: 'ghost' },
];

/**
 * Qualitative observations. Visually separated in the UI because these are an
 * analyst's judgement, and they are the only thing that can widen a round
 * beyond 10-9.
 */
export const OBSERVATION_BUTTONS = [
  { type: 'damage_observed', label: 'Damage', sub: 'observed' },
  { type: 'cut_laceration', label: 'Cut', sub: 'laceration' },
  { type: 'visible_swelling', label: 'Swelling', sub: 'visible' },
  { type: 'sustained_defence_forced', label: 'Forced', sub: 'sustained defence' },
  { type: 'effective_sequence', label: 'Effective', sub: 'sequence' },
  { type: 'other_significant', label: 'Other', sub: 'significant' },
];

export const CONTROL_POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'back', label: 'Back' },
  { value: 'clinch', label: 'Clinch' },
  { value: 'cage_control', label: 'Cage control' },
  { value: 'guard', label: 'Guard' },
  { value: 'other', label: 'Other' },
];

export const RESULT_METHODS = [
  'KO',
  'TKO',
  'Submission',
  'Unanimous Decision',
  'Split Decision',
  'Majority Decision',
  'Technical Decision',
  'Draw',
  'No Contest',
  'Disqualification',
];

export const CONFIDENCE_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient: 'Insufficient data',
};

export const ADVANTAGE_LABEL = {
  red: 'Red',
  blue: 'Blue',
  even: 'Even',
  insufficient: 'Insufficient data',
};

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const pct = (landed, attempted) =>
  !attempted || attempted <= 0 ? 0 : Math.round((landed / attempted) * 1000) / 10;
