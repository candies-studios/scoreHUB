import mongoose from 'mongoose';

export const FIGHT_STATUSES = [
  'scheduled',
  'live',
  'round_break',
  'paused',
  'completed',
  'cancelled',
];

/**
 * The authoritative fight clock, persisted rather than held in memory.
 *
 * The judge memory sheet keeps its round timer in process (sockets/boutRoom.js).
 * That is fine for a 5-minute round but it dies with the process, and the spec
 * is explicit that a browser refresh must not reset the fight clock. So the
 * analytics clock lives here: elapsed time is derived from `runningSince`, which
 * means a reload, a redeploy or a Render cold start all resume at the right second.
 *
 * One session per bout.
 */
const fightSessionSchema = new mongoose.Schema(
  {
    bout: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bout',
      required: true,
      unique: true,
      index: true,
    },

    status: { type: String, enum: FIGHT_STATUSES, default: 'scheduled', index: true },
    currentRound: { type: Number, default: 1, min: 1 },
    totalRounds: { type: Number, default: 3, min: 1, max: 5 },

    roundDurationSec: { type: Number, default: 300, min: 30 },
    restDurationSec: { type: Number, default: 60, min: 0 },

    /** Null while paused; a timestamp while the clock runs. */
    runningSince: { type: Date, default: null },
    /** Seconds banked from previous run segments of the CURRENT round. */
    accumulatedSec: { type: Number, default: 0, min: 0 },

    /** Completed rounds, so an incomplete round is still reportable. */
    roundLog: [
      {
        roundNo: { type: Number, required: true },
        durationSec: { type: Number, default: 0 },
        complete: { type: Boolean, default: true },
        endedEarlyReason: { type: String, default: '' },
        _id: false,
      },
    ],

    /**
     * Official result — section 10. Entered by a human only. The estimated
     * scoring engine must never write here.
     */
    officialResult: {
      method: { type: String, default: null },
      winnerCorner: { type: String, enum: ['red', 'blue', 'draw', 'nc', null], default: null },
      endedRound: { type: Number, default: null },
      endedAtSec: { type: Number, default: null },
      notes: { type: String, default: '' },
      confirmedBy: { type: String, default: '' },
      confirmedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

/** Seconds elapsed in the current round right now. */
fightSessionSchema.methods.elapsedSec = function elapsedSec() {
  const banked = this.accumulatedSec || 0;
  if (!this.runningSince) return Math.min(banked, this.roundDurationSec);
  const live = Math.floor((Date.now() - this.runningSince.getTime()) / 1000);
  return Math.min(banked + live, this.roundDurationSec);
};

fightSessionSchema.methods.clockState = function clockState() {
  const elapsed = this.elapsedSec();
  return {
    status: this.status,
    currentRound: this.currentRound,
    totalRounds: this.totalRounds,
    running: Boolean(this.runningSince),
    elapsedSec: elapsed,
    durationSec: this.roundDurationSec,
    remainingSec: Math.max(this.roundDurationSec - elapsed, 0),
    restDurationSec: this.restDurationSec,
    serverNow: Date.now(),
  };
};

export default mongoose.model('FightSession', fightSessionSchema);
