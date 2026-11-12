import mongoose from 'mongoose';

/**
 * Control time, recorded as explicit intervals rather than inferred.
 *
 * The spec is firm that control time must be measured, not estimated from
 * takedown counts. An operator opens an interval when control begins and closes
 * it when control ends; total control time is the sum of closed intervals plus
 * any interval still open.
 *
 * `offensiveOutput` is the field that stops control time being mistaken for
 * effective grappling. An interval where the controlling fighter did nothing is
 * recorded just as faithfully, but the scoring engine discounts it.
 */
const controlIntervalSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    roundNo: { type: Number, required: true, min: 1, index: true },
    corner: { type: String, enum: ['red', 'blue'], required: true },

    position: {
      type: String,
      enum: ['top', 'back', 'clinch', 'cage_control', 'guard', 'other'],
      default: 'other',
    },

    startSec: { type: Number, required: true, min: 0 },
    /** Null while the interval is still open. */
    endSec: { type: Number, default: null },

    /**
     * Did the controlling fighter actually do anything during this interval?
     * Set by the operator, or inferred when ground strikes / submission
     * attempts / positional advances were logged inside the window.
     */
    offensiveOutput: { type: Boolean, default: false },

    note: { type: String, default: '', maxlength: 300 },
    recordedBy: { type: String, default: 'statistician', maxlength: 120 },
    voided: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

controlIntervalSchema.index({ bout: 1, roundNo: 1, voided: 1 });

controlIntervalSchema.virtual('durationSec').get(function durationSec() {
  if (this.endSec === null || this.endSec === undefined) return 0;
  return Math.max(0, this.endSec - this.startSec);
});

controlIntervalSchema.set('toJSON', { virtuals: true });
controlIntervalSchema.set('toObject', { virtuals: true });

export default mongoose.model('ControlInterval', controlIntervalSchema);
