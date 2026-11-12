import mongoose from 'mongoose';

const registrationSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true, index: true },
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', required: true, index: true },
    // Academy at the time of registration — athletes change teams.
    academy: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy' },

    status: { type: String, enum: ['pending', 'approved', 'cancelled'], default: 'approved' },
    paid: { type: Boolean, default: false },
    checkedIn: { type: Boolean, default: false },
    weighedIn: { type: Boolean, default: false },
    weighInKg: { type: Number, min: 0, default: 0 },
    seed: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// One entry per athlete per division.
registrationSchema.index({ division: 1, athlete: 1 }, { unique: true });

export default mongoose.model('Registration', registrationSchema);
