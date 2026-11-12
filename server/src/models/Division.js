import mongoose from 'mongoose';
import { BELTS, GENDERS } from './Athlete.js';

export const AGE_GROUPS = ['Kids', 'Juvenile', 'Adult', 'Master 1', 'Master 2', 'Master 3', 'Master 4'];
export const BRACKET_TYPES = ['auto', 'single_elim', 'round_robin'];

/**
 * One category athletes register into — e.g. "Adult / Male / Blue / -76 kg / Gi".
 * A division owns one bracket.
 */
const divisionSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    name: { type: String, trim: true, default: '' },
    gender: { type: String, enum: [...GENDERS, 'open'], default: 'male' },
    ageGroup: { type: String, enum: AGE_GROUPS, default: 'Adult' },
    belt: { type: String, enum: [...BELTS, 'all'], default: 'all' },
    weightClass: { type: String, trim: true, default: '' }, // "-76 kg", "Open"
    maxWeightKg: { type: Number, min: 0, default: 0 }, // 0 = no limit
    uniform: { type: String, enum: ['gi', 'nogi', 'none'], default: 'gi' },

    bracketType: { type: String, enum: BRACKET_TYPES, default: 'auto' },
    resolvedBracketType: { type: String, enum: ['single_elim', 'round_robin', null], default: null },
    matchDurationSec: { type: Number, min: 0, default: 0 }, // 0 = tournament default
    mat: { type: Number, min: 0, default: 0 }, // 0 = unassigned

    status: {
      type: String,
      enum: ['open', 'bracketed', 'live', 'completed'],
      default: 'open',
    },
  },
  { timestamps: true }
);

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

divisionSchema.pre('validate', function autoName(next) {
  if (!this.name) {
    this.name = [
      this.ageGroup,
      cap(this.gender),
      this.belt === 'all' ? 'All belts' : cap(this.belt),
      this.weightClass || 'Open',
      this.uniform === 'nogi' ? 'No-Gi' : this.uniform === 'gi' ? 'Gi' : '',
    ]
      .filter(Boolean)
      .join(' / ');
  }
  next();
});

export default mongoose.model('Division', divisionSchema);
