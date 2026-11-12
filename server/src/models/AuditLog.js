import mongoose from 'mongoose';

/**
 * Append-only trail of every correction.
 *
 * Recording mistakes during a live fight are normal; silently rewriting history
 * is not. Voiding an event, editing a foul or overriding a criterion all land
 * here with a reason, so a round estimate can always be traced back.
 */
const auditLogSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    roundNo: { type: Number, default: null },

    action: {
      type: String,
      enum: [
        'event_recorded',
        'event_voided',
        'control_started',
        'control_stopped',
        'control_voided',
        'foul_recorded',
        'foul_updated',
        'foul_voided',
        'assessment_override',
        'clock_changed',
        'round_advanced',
        'result_confirmed',
        'session_reset',
      ],
      required: true,
      index: true,
    },

    targetModel: { type: String, default: '' },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    /** Required by the API for any destructive action. */
    reason: { type: String, default: '', maxlength: 500 },

    /** Small before/after snapshot — enough to explain, not a full copy. */
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    actor: { type: String, default: 'statistician', maxlength: 120 },
  },
  { timestamps: true }
);

auditLogSchema.index({ bout: 1, createdAt: -1 });

/** Fire-and-forget: an audit write must never break the operator's action. */
export async function logAudit(entry) {
  try {
    // eslint-disable-next-line no-use-before-define
    await AuditLog.create(entry);
  } catch (err) {
    console.error('[scorehub] audit write failed:', err.message);
  }
}

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
