import mongoose from 'mongoose';

/**
 * ENGINE A — the vocabulary of recordable fight activity.
 *
 * Everything the statistician taps becomes one immutable FightEvent. Statistics
 * are never stored as running totals; they are aggregated from this log (see
 * utils/fightStats.js), so a correction can never leave a counter out of step
 * and nothing can be double counted.
 */

/**
 * Objectively countable actions.
 *
 * IMPORTANT — `*_attempted` means a throw that did NOT land. The operator taps
 * once per action: "landed" when it connects, "attempted" when it misses.
 * Total attempts are then misses + landed (see fightStats.reconcileAttempts),
 * which keeps accuracy well defined and avoids double counting.
 */
export const COUNT_EVENTS = [
  'sig_strike_landed',
  'sig_strike_attempted',
  'total_strike_landed',
  'total_strike_attempted',
  'knockdown',
  'takedown_landed',
  'takedown_attempted',
  'submission_attempt',
  'reversal',
  'sweep',
  'positional_advance',
  'escape',
];

/**
 * Qualitative observations. These are an analyst's judgement, not a count, and
 * the scoring engine keeps them strictly separate from the numbers above —
 * they are the ONLY thing that can justify a margin wider than 10-9.
 */
export const OBSERVATION_EVENTS = [
  'damage_observed',
  'cut_laceration',
  'visible_swelling',
  'sustained_defence_forced',
  'effective_sequence',
  'other_significant',
];

export const EVENT_TYPES = [...COUNT_EVENTS, ...OBSERVATION_EVENTS];

export const STRIKE_TARGETS = ['head', 'body', 'leg'];
export const STRIKE_POSITIONS = ['distance', 'clinch', 'ground'];
export const CORNERS = ['red', 'blue'];

const fightEventSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    roundNo: { type: Number, required: true, min: 1, index: true },

    // The fighter the action is credited TO (the one doing it).
    corner: { type: String, enum: CORNERS, required: true, index: true },
    fighter: { type: mongoose.Schema.Types.ObjectId, ref: 'Fighter', default: null },

    type: { type: String, enum: EVENT_TYPES, required: true, index: true },

    // Only meaningful for strike events; null elsewhere.
    target: { type: String, enum: [...STRIKE_TARGETS, null], default: null },
    position: { type: String, enum: [...STRIKE_POSITIONS, null], default: null },

    /**
     * Where the clock stood when this happened, in seconds from the start of
     * the round. Distinct from createdAt, which is when it was keyed in — the
     * two differ whenever an operator corrects something after the fact.
     */
    fightTimeSec: { type: Number, default: 0, min: 0 },

    note: { type: String, default: '', maxlength: 500 },

    /** Which console recorded it. No accounts in this app — see docs/ANALYTICS.md. */
    recordedBy: { type: String, default: 'statistician', maxlength: 120 },

    /** Soft delete, so an undo still leaves a trail. */
    voided: { type: Boolean, default: false, index: true },
    voidReason: { type: String, default: '' },
    voidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The aggregation pipeline always filters on these three together.
fightEventSchema.index({ bout: 1, roundNo: 1, voided: 1 });
fightEventSchema.index({ bout: 1, createdAt: -1 });

fightEventSchema.statics.isCount = (type) => COUNT_EVENTS.includes(type);
fightEventSchema.statics.isObservation = (type) => OBSERVATION_EVENTS.includes(type);

export default mongoose.model('FightEvent', fightEventSchema);
