import mongoose from 'mongoose';

const leagueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    time: { type: String, required: true, trim: true }, // "23:30"
    location: { type: String, required: true, trim: true },
    promoter: { type: String, trim: true, default: '' },
    logoUrl: { type: String, default: '' },

    bouts: {
      amateurMMA: { type: Number, default: 0, min: 0 },
      amateurBJJ: { type: Number, default: 0, min: 0 },
      amateurK1: { type: Number, default: 0, min: 0 },
      proMMA: { type: Number, default: 0, min: 0 },
      proBJJ: { type: Number, default: 0, min: 0 },
      proK1: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed'],
      default: 'upcoming',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

leagueSchema.virtual('totalBouts').get(function totalBouts() {
  const b = this.bouts || {};
  return (
    (b.amateurMMA || 0) +
    (b.amateurBJJ || 0) +
    (b.amateurK1 || 0) +
    (b.proMMA || 0) +
    (b.proBJJ || 0) +
    (b.proK1 || 0)
  );
});

leagueSchema.set('toJSON', { virtuals: true });
leagueSchema.set('toObject', { virtuals: true });

export default mongoose.model('League', leagueSchema);
