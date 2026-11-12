import mongoose from 'mongoose';

const sideScore = new mongoose.Schema(
  {
    points: { type: Number, default: 0, min: 0 },
    advantages: { type: Number, default: 0, min: 0 },
    penalties: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * One match inside a division bracket. `a` and `b` are the two athletes
 * (top / bottom of the bracket box); either can be empty until the feeder
 * match finishes.
 */
const matchSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true, index: true },
    key: { type: String, required: true }, // "r1m3" — stable within a division
    round: { type: Number, required: true, min: 1 },
    position: { type: Number, required: true, min: 1 },
    roundName: { type: String, default: '' },

    a: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', default: null },
    b: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', default: null },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', default: null },

    nextKey: { type: String, default: null },
    nextSlot: { type: String, enum: ['a', 'b', null], default: null },

    isBye: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'ready', 'live', 'completed'],
      default: 'pending',
      index: true,
    },
    method: { type: String, default: null }, // points | advantages | penalties | decision | submission | dq | walkover | injury | bye
    submissionType: { type: String, trim: true, default: '' },

    score: {
      a: { type: sideScore, default: () => ({}) },
      b: { type: sideScore, default: () => ({}) },
    },

    // Clock persisted so a refresh or a second screen resumes at the right second.
    durationSec: { type: Number, default: 300 },
    clock: {
      running: { type: Boolean, default: false },
      startedAt: { type: Date, default: null },
      elapsedMs: { type: Number, default: 0 },
    },

    mat: { type: Number, default: 0, index: true },
    order: { type: Number, default: 0 }, // running order on the mat
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

matchSchema.index({ division: 1, key: 1 }, { unique: true });

export default mongoose.model('Match', matchSchema);
