import mongoose from 'mongoose';

/**
 * An Official is a judge or referee attached to a league.
 * There are no accounts — a judge identifies themselves at the cage by
 * picking their name from the bout's panel.
 */
const officialSchema = new mongoose.Schema(
  {
    league: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    kind: { type: String, enum: ['judge', 'referee'], required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactNo: { type: String, trim: true, default: '' },
    bloodGroup: { type: String, trim: true, default: '' },
    licenseNo: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

officialSchema.index({ league: 1, kind: 1 });

export default mongoose.model('Official', officialSchema);
