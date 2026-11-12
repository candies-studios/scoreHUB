import mongoose from 'mongoose';

export const BOUT_TYPES = ['Professional', 'Amateur'];
export const DISCIPLINES = ['MMA', 'BJJ', 'K1'];
export const FINISH_METHODS = [
  'Decision',
  'Head KO',
  'KO Body',
  'TKO',
  'RNC',
  'Submission',
  'DQ',
  'No Contest',
];

const cornerSchema = new mongoose.Schema(
  {
    fighter: { type: mongoose.Schema.Types.ObjectId, ref: 'Fighter', required: true },
  },
  { _id: false }
);

const boutSchema = new mongoose.Schema(
  {
    league: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },

    boutNo: { type: Number, required: true, min: 1 },
    boutName: { type: String, trim: true, default: '' }, // e.g. "Flyweight"
    boutType: { type: String, enum: BOUT_TYPES, default: 'Professional' },
    discipline: { type: String, enum: DISCIPLINES, default: 'MMA' },
    boutDate: { type: Date, required: true },
    ringNo: { type: Number, default: 1 },

    totalRounds: { type: Number, default: 3, min: 1, max: 12 },
    roundDurationSec: { type: Number, default: 300, min: 30 }, // 5 min default

    blueCorner: { type: cornerSchema, required: true },
    redCorner: { type: cornerSchema, required: true },

    // Exactly the panel that must join before a round can start.
    judges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Official' }],
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'Official', default: null },

    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed'],
      default: 'scheduled',
      index: true,
    },
    currentRound: { type: Number, default: 1 },

    result: {
      winnerCorner: { type: String, enum: ['blue', 'red', 'draw', 'nc', null], default: null },
      winnerFighter: { type: mongoose.Schema.Types.ObjectId, ref: 'Fighter', default: null },
      method: { type: String, enum: FINISH_METHODS, default: null },
      endedRound: { type: Number, default: null },
      endedAtSec: { type: Number, default: null },
      notes: { type: String, default: '' },
      decidedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

boutSchema.index({ league: 1, boutNo: 1 }, { unique: true });

export default mongoose.model('Bout', boutSchema);
