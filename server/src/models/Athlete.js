import mongoose from 'mongoose';

export const BELTS = ['white', 'grey', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'black'];
export const GENDERS = ['male', 'female'];

/**
 * A competitor profile that lives across events (unlike a league Fighter,
 * which belongs to one league). Results and rankings hang off this.
 */
const athleteSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: GENDERS, required: true },
    birthYear: { type: Number, min: 1900, max: 2100 },
    country: { type: String, trim: true, default: '' },
    academy: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', index: true },
    belt: { type: String, enum: BELTS, default: 'white' },
    weightKg: { type: Number, min: 0, default: 0 },
    email: { type: String, trim: true, default: '' },
    photoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

athleteSchema.virtual('name').get(function name() {
  return `${this.firstName} ${this.lastName}`.trim();
});
athleteSchema.set('toJSON', { virtuals: true });
athleteSchema.set('toObject', { virtuals: true });
athleteSchema.index({ firstName: 'text', lastName: 'text' });

export default mongoose.model('Athlete', athleteSchema);
