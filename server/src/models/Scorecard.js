import mongoose from 'mongoose';

/**
 * The four live-scoring categories of the memory sheet.
 * Each category holds an ordered token log per corner:
 *   "1" = effective / landed action
 *   "0" = attempted but blocked / missed
 *   "+" = dominant or significant action
 */
export const CATEGORIES = ['standup', 'takedowns', 'groundStrikes', 'grappling'];

export const CATEGORY_LABELS = {
  standup: 'Strikes & Kicks — Stand Up Fight',
  takedowns: 'Takedowns',
  groundStrikes: 'Strikes on Ground',
  grappling: 'Grappling & Submissions',
};

export const TOKENS = ['1', '0', '+'];

// Weight used to compute the advisory tally shown next to the judge's manual score.
export const TOKEN_WEIGHT = { '1': 1, '0': 0, '+': 2 };

const cornerTokensSchema = new mongoose.Schema(
  {
    standup: { type: [String], default: [] },
    takedowns: { type: [String], default: [] },
    groundStrikes: { type: [String], default: [] },
    grappling: { type: [String], default: [] },
  },
  { _id: false }
);

const roundSchema = new mongoose.Schema(
  {
    roundNo: { type: Number, required: true, min: 1 },
    blue: { type: cornerTokensSchema, default: () => ({}) },
    red: { type: cornerTokensSchema, default: () => ({}) },
    // 10-point must system, entered by the judge at the end of the round.
    blueScore: { type: Number, default: null, min: 0, max: 10 },
    redScore: { type: Number, default: null, min: 0, max: 10 },
    submitted: { type: Boolean, default: false },
    submittedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0 },
  },
  { _id: false }
);

const scorecardSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    judge: { type: mongoose.Schema.Types.ObjectId, ref: 'Official', required: true, index: true },
    judgeSeat: { type: Number, default: 1, min: 1, max: 3 }, // Judge 1 / 2 / 3
    rounds: { type: [roundSchema], default: [] },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

scorecardSchema.index({ bout: 1, judge: 1 }, { unique: true });

scorecardSchema.methods.getRound = function getRound(roundNo) {
  let round = this.rounds.find((r) => r.roundNo === roundNo);
  if (!round) {
    this.rounds.push({ roundNo });
    round = this.rounds[this.rounds.length - 1];
  }
  return round;
};

scorecardSchema.methods.totals = function totals() {
  return this.rounds.reduce(
    (acc, r) => {
      acc.blue += r.blueScore ?? 0;
      acc.red += r.redScore ?? 0;
      return acc;
    },
    { blue: 0, red: 0 }
  );
};

export function tallyTokens(cornerTokens) {
  return CATEGORIES.reduce((sum, cat) => {
    const list = cornerTokens?.[cat] || [];
    return sum + list.reduce((s, t) => s + (TOKEN_WEIGHT[t] ?? 0), 0);
  }, 0);
}

export default mongoose.model('Scorecard', scorecardSchema);
