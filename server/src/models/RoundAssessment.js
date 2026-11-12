import mongoose from 'mongoose';

/** The seven criteria the round is assessed against. */
export const CRITERIA = [
  'effectiveStriking',
  'effectiveGrappling',
  'impact',
  'dominance',
  'duration',
  'effectiveAggression',
  'cageControl',
];

export const CRITERION_LABELS = {
  effectiveStriking: 'Effective striking',
  effectiveGrappling: 'Effective grappling',
  impact: 'Impact',
  dominance: 'Dominance',
  duration: 'Duration',
  effectiveAggression: 'Effective aggression',
  cageControl: 'Fighting area control',
};

export const ADVANTAGES = ['red', 'blue', 'even', 'insufficient'];

const overrideSchema = new mongoose.Schema(
  {
    advantage: { type: String, enum: ADVANTAGES, default: null },
    note: { type: String, default: '', maxlength: 500 },
  },
  { _id: false }
);

/**
 * An analyst's qualitative input for one round, plus the last estimate the
 * engine produced for it.
 *
 * The engine derives what it can from the event log, but a human can override
 * any single criterion — judging is qualitative and the counts do not see
 * everything. Overrides are stored separately from the derived result so it is
 * always clear which parts were computed and which were a person's call.
 *
 * `estimate` is a cached snapshot for display and history. It is never the
 * source of truth: it is recomputed from events on every read.
 */
const roundAssessmentSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    roundNo: { type: Number, required: true, min: 1 },

    /** Per-criterion human overrides. Absent keys mean "let the engine decide". */
    overrides: {
      effectiveStriking: { type: overrideSchema, default: () => ({}) },
      effectiveGrappling: { type: overrideSchema, default: () => ({}) },
      impact: { type: overrideSchema, default: () => ({}) },
      dominance: { type: overrideSchema, default: () => ({}) },
      duration: { type: overrideSchema, default: () => ({}) },
      effectiveAggression: { type: overrideSchema, default: () => ({}) },
      cageControl: { type: overrideSchema, default: () => ({}) },
    },

    /** Analyst flag: the evidence for this round is too thin to score. */
    insufficientEvidence: { type: Boolean, default: false },
    analystNotes: { type: String, default: '', maxlength: 2000 },

    /** Last computed estimate, cached for history. Recomputed on read. */
    estimate: {
      redScore: { type: Number, default: null },
      blueScore: { type: Number, default: null },
      winner: { type: String, enum: ['red', 'blue', 'even', null], default: null },
      margin: { type: String, default: null },
      confidence: { type: String, default: null },
      explanation: { type: String, default: '' },
      computedAt: { type: Date, default: null },
    },

    updatedBy: { type: String, default: 'analyst', maxlength: 120 },
  },
  { timestamps: true }
);

roundAssessmentSchema.index({ bout: 1, roundNo: 1 }, { unique: true });

export default mongoose.model('RoundAssessment', roundAssessmentSchema);
