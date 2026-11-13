/**
 * ScoreHUB scoring engine.
 *
 * Judges do not type numbers during a round. They tap marks on a "memory
 * sheet" split into four categories. Each tap is one of:
 *
 *   "1"  a clean, scoring action that landed
 *   "0"  an attempt that was blocked, missed or defended
 *   "+"  a fight-altering action (knockdown, deep submission, dominant slam)
 *
 * At the end of the round the engine turns those marks into a 10-point-must
 * score. The judge may override the suggestion before submitting — the
 * suggestion exists so the card is consistent, not to take the decision away.
 */

export type Mark = '1' | '0' | '+';

export const SCORE_CATEGORIES = [
  'STANDUP_STRIKES',
  'TAKEDOWNS',
  'GROUND_STRIKES',
  'GRAPPLING_SUBMISSIONS',
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  STANDUP_STRIKES: 'Strikes & Kicks\nStand Up Fight',
  TAKEDOWNS: 'Takedowns',
  GROUND_STRIKES: 'Strikes on Ground',
  GRAPPLING_SUBMISSIONS: 'Grappling & Submissions',
};

/**
 * Relative worth of each category. Grappling and takedowns are weighted above
 * raw strike volume so a control-heavy round is not lost to a busier striker.
 * Tune these to your commission's criteria — they are the one knob that
 * changes how the engine "thinks".
 */
export const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  STANDUP_STRIKES: 1.0,
  TAKEDOWNS: 1.5,
  GROUND_STRIKES: 1.0,
  GRAPPLING_SUBMISSIONS: 2.0,
};

/** Point value of each mark before the category weight is applied. */
export const MARK_VALUES: Record<Mark, number> = {
  '1': 1,
  '0': 0,
  '+': 3,
};

export type CornerTally = Record<ScoreCategory, Mark[]>;

export type RoundTally = {
  BLUE: CornerTally;
  RED: CornerTally;
};

export function emptyCornerTally(): CornerTally {
  return {
    STANDUP_STRIKES: [],
    TAKEDOWNS: [],
    GROUND_STRIKES: [],
    GRAPPLING_SUBMISSIONS: [],
  };
}

export function emptyRoundTally(): RoundTally {
  return { BLUE: emptyCornerTally(), RED: emptyCornerTally() };
}

/** Weighted total for one corner across all four categories. */
export function cornerPoints(tally: CornerTally): number {
  let total = 0;
  for (const category of SCORE_CATEGORIES) {
    const marks = tally[category] ?? [];
    const raw = marks.reduce((sum, mark) => sum + (MARK_VALUES[mark] ?? 0), 0);
    total += raw * CATEGORY_WEIGHTS[category];
  }
  return total;
}

/** Per-category weighted breakdown — used by the scoreboard detail view. */
export function categoryBreakdown(tally: CornerTally): Record<ScoreCategory, number> {
  const out = {} as Record<ScoreCategory, number>;
  for (const category of SCORE_CATEGORIES) {
    const marks = tally[category] ?? [];
    out[category] =
      marks.reduce((sum, mark) => sum + (MARK_VALUES[mark] ?? 0), 0) *
      CATEGORY_WEIGHTS[category];
  }
  return out;
}

export type RoundSuggestion = {
  blue: number;
  red: number;
  bluePoints: number;
  redPoints: number;
  /** Human-readable reason shown under the suggestion. */
  rationale: string;
};

/**
 * Turn a round's marks into a 10-point-must suggestion.
 *
 * Margin is measured as the leader's share of the total weighted points, so a
 * 12-2 round and a 60-10 round are read the same way.
 *
 *   dominance < 0.02   -> 10-10  (nothing separates them)
 *   dominance < 0.35   -> 10-9   (clear but competitive)
 *   dominance < 0.65   -> 10-8   (dominant)
 *   otherwise          -> 10-7   (overwhelming)
 */
export function suggestRoundScore(tally: RoundTally): RoundSuggestion {
  const bluePoints = cornerPoints(tally.BLUE);
  const redPoints = cornerPoints(tally.RED);
  const total = bluePoints + redPoints;

  if (total === 0) {
    return {
      blue: 10,
      red: 10,
      bluePoints,
      redPoints,
      rationale: 'No scoring actions recorded — even round.',
    };
  }

  const dominance = Math.abs(bluePoints - redPoints) / total;
  const leaderIsBlue = bluePoints >= redPoints;

  let loserScore: number;
  let label: string;
  if (dominance < 0.02) {
    return {
      blue: 10,
      red: 10,
      bluePoints,
      redPoints,
      rationale: 'Too close to separate — even round.',
    };
  } else if (dominance < 0.35) {
    loserScore = 9;
    label = 'Clear but competitive round';
  } else if (dominance < 0.65) {
    loserScore = 8;
    label = 'Dominant round';
  } else {
    loserScore = 7;
    label = 'Overwhelming round';
  }

  const leader = leaderIsBlue ? 'Blue' : 'Red';
  return {
    blue: leaderIsBlue ? 10 : loserScore,
    red: leaderIsBlue ? loserScore : 10,
    bluePoints,
    redPoints,
    rationale: `${label} for ${leader} (${bluePoints.toFixed(1)} – ${redPoints.toFixed(
      1,
    )} weighted).`,
  };
}

// ---------------------------------------------------------------------------
// Bout-level aggregation
// ---------------------------------------------------------------------------

export type JudgeCard = {
  judgeId: string;
  judgeName: string;
  seat: number;
  rounds: { roundNumber: number; blue: number; red: number }[];
};

export type JudgeTotal = {
  judgeId: string;
  judgeName: string;
  seat: number;
  blue: number;
  red: number;
  /** Which corner this judge has ahead: 'BLUE', 'RED' or null for a draw. */
  favours: 'BLUE' | 'RED' | null;
};

export function totalCard(card: JudgeCard): JudgeTotal {
  const blue = card.rounds.reduce((sum, r) => sum + r.blue, 0);
  const red = card.rounds.reduce((sum, r) => sum + r.red, 0);
  return {
    judgeId: card.judgeId,
    judgeName: card.judgeName,
    seat: card.seat,
    blue,
    red,
    favours: blue === red ? null : blue > red ? 'BLUE' : 'RED',
  };
}

export type FinishType =
  | 'KO_HEAD'
  | 'KO_BODY'
  | 'TKO'
  | 'SUBMISSION'
  | 'RNC'
  | 'DQ'
  | 'NO_CONTEST';

export const FINISH_LABELS: Record<FinishType, string> = {
  KO_HEAD: 'Head KO',
  KO_BODY: 'KO Body',
  TKO: 'TKO',
  SUBMISSION: 'Submission',
  RNC: 'RNC',
  DQ: 'DQ',
  NO_CONTEST: 'No Contest',
};

export type DecisionType =
  | 'DECISION_UNANIMOUS'
  | 'DECISION_SPLIT'
  | 'DECISION_MAJORITY'
  | 'DRAW'
  | 'MAJORITY_DRAW';

export type BoutOutcome = {
  resultType: DecisionType | FinishType;
  /** 'BLUE' | 'RED' | null (draw / no contest) */
  winner: 'BLUE' | 'RED' | null;
  totals: JudgeTotal[];
  summary: string;
};

/**
 * Decide a bout that went the distance.
 *
 *   3-0  unanimous decision
 *   2-1  split decision
 *   2-0 with one draw  majority decision
 *   1-1 with one draw, or 0-0  draw
 *   1-0 with two draws  majority draw
 */
export function decideBout(cards: JudgeCard[]): BoutOutcome {
  const totals = cards.map(totalCard);
  const blueCards = totals.filter((t) => t.favours === 'BLUE').length;
  const redCards = totals.filter((t) => t.favours === 'RED').length;
  const drawCards = totals.filter((t) => t.favours === null).length;

  const leader = blueCards > redCards ? 'BLUE' : redCards > blueCards ? 'RED' : null;
  const leadCount = Math.max(blueCards, redCards);
  const trailCount = Math.min(blueCards, redCards);

  if (leader === null) {
    return {
      resultType: 'DRAW',
      winner: null,
      totals,
      summary: drawCards === totals.length ? 'Unanimous draw.' : 'Draw.',
    };
  }

  let resultType: DecisionType;
  if (trailCount === 0 && drawCards === 0) {
    resultType = 'DECISION_UNANIMOUS';
  } else if (trailCount > 0) {
    resultType = 'DECISION_SPLIT';
  } else if (leadCount > drawCards) {
    resultType = 'DECISION_MAJORITY';
  } else {
    return {
      resultType: 'MAJORITY_DRAW',
      winner: null,
      totals,
      summary: 'Majority draw.',
    };
  }

  const label =
    resultType === 'DECISION_UNANIMOUS'
      ? 'unanimous decision'
      : resultType === 'DECISION_SPLIT'
        ? 'split decision'
        : 'majority decision';

  return {
    resultType,
    winner: leader,
    totals,
    summary: `${leader === 'BLUE' ? 'Blue' : 'Red'} corner wins by ${label}.`,
  };
}

/** Wrap a finish (KO, submission, DQ…) into the same outcome shape. */
export function finishBout(
  finish: FinishType,
  winner: 'BLUE' | 'RED' | null,
  cards: JudgeCard[],
  round?: number,
  timeSec?: number,
): BoutOutcome {
  const totals = cards.map(totalCard);
  const when =
    round != null
      ? ` in round ${round}${timeSec != null ? ` at ${formatClock(timeSec)}` : ''}`
      : '';

  if (finish === 'NO_CONTEST') {
    return { resultType: finish, winner: null, totals, summary: `No contest${when}.` };
  }

  const corner = winner === 'BLUE' ? 'Blue' : winner === 'RED' ? 'Red' : 'Neither';
  return {
    resultType: finish,
    winner,
    totals,
    summary: `${corner} corner wins by ${FINISH_LABELS[finish]}${when}.`,
  };
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Serialise marks the way the paper sheet reads them: "1,1,0,+,". */
export function formatMarks(marks: Mark[]): string {
  if (!marks.length) return '';
  return `${marks.join(',')},`;
}
