import mongoose from 'mongoose';

const fighterSchema = new mongoose.Schema(
  {
    league: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true, index: true },
    name: { type: String, required: true, trim: true },
    nickname: { type: String, trim: true, default: '' },
    team: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    weightClass: { type: String, trim: true, default: '' },
    weightKg: { type: Number, default: 0 },
    heightCm: { type: Number, default: 0 },
    age: { type: Number, default: 0 },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
    record: {
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
    },
    contactNo: { type: String, trim: true, default: '' },
    bloodGroup: { type: String, trim: true, default: '' },
    photoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Fighter', fighterSchema);
