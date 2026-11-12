import mongoose from 'mongoose';

export const SPORTS = ['bjj', 'grappling', 'mma', 'k1', 'judo', 'wrestling'];
export const TOURNAMENT_STATUS = ['draft', 'registration', 'closed', 'live', 'completed'];

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sport: { type: String, enum: SPORTS, default: 'bjj' },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date },
    venue: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    organizer: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    rules: { type: String, trim: true, default: '' },

    registrationOpens: { type: Date },
    registrationCloses: { type: Date },
    fee: {
      amount: { type: Number, min: 0, default: 0 },
      currency: { type: String, trim: true, default: 'INR' },
    },
    // Require organiser approval before an entry is placed in a bracket.
    requireApproval: { type: Boolean, default: false },

    mats: { type: Number, min: 1, max: 40, default: 2 },
    matchDurationSec: { type: Number, min: 30, default: 300 },
    livestreamUrl: { type: String, trim: true, default: '' },
    coverUrl: { type: String, default: '' },

    status: { type: String, enum: TOURNAMENT_STATUS, default: 'registration', index: true },
  },
  { timestamps: true }
);

/** Registration is open when the status says so and today is inside the window. */
tournamentSchema.virtual('registrationOpen').get(function registrationOpen() {
  if (this.status !== 'registration') return false;
  const now = Date.now();
  if (this.registrationOpens && now < this.registrationOpens.getTime()) return false;
  if (this.registrationCloses && now > this.registrationCloses.getTime()) return false;
  return true;
});

tournamentSchema.set('toJSON', { virtuals: true });
tournamentSchema.set('toObject', { virtuals: true });
tournamentSchema.index({ name: 'text', city: 'text', organizer: 'text' });

export default mongoose.model('Tournament', tournamentSchema);
