import mongoose from 'mongoose';

/** A gym / club / team. Smoothcomp calls these "Academies". */
const academySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    affiliation: { type: String, trim: true, default: '' }, // parent team / association
    country: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    headCoach: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    logoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

academySchema.index({ name: 'text', city: 'text', affiliation: 'text' });

export default mongoose.model('Academy', academySchema);
