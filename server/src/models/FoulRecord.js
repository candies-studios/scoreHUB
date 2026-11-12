import mongoose from 'mongoose';

/** Section 9 — foul categories from the Unified Rules fouls list. */
export const FOUL_CATEGORIES = [
  'headbutt',
  'eye_gouging',
  'biting',
  'fish_hooking',
  'hair_pulling',
  'pile_driving',
  'strike_to_spine_or_back_of_head',
  'throat_strike',
  'groin_attack',
  'illegal_knee_or_kick_to_grounded_opponent',
  'stomping_grounded_opponent',
  'holding_gloves_or_shorts',
  'holding_cage_or_ropes',
  'small_joint_manipulation',
  'throwing_opponent_out_of_area',
  'finger_insertion',
  'clawing_pinching_twisting',
  'timidity',
  'abusive_language',
  'disregarding_referee_instructions',
  'unsportsmanlike_conduct',
  'striking_after_the_bell',
  'striking_during_break',
  'attacking_fighter_under_referee_care',
  'corner_interference',
];

export const FOUL_LABELS = {
  headbutt: 'Headbutting',
  eye_gouging: 'Eye gouging',
  biting: 'Biting',
  fish_hooking: 'Fish hooking',
  hair_pulling: 'Hair pulling',
  pile_driving: 'Pile driving',
  strike_to_spine_or_back_of_head: 'Strike to spine / back of head',
  throat_strike: 'Throat strike',
  groin_attack: 'Groin attack',
  illegal_knee_or_kick_to_grounded_opponent: 'Illegal knee / kick to grounded opponent',
  stomping_grounded_opponent: 'Stomping a grounded opponent',
  holding_gloves_or_shorts: 'Holding gloves or shorts',
  holding_cage_or_ropes: 'Holding the cage or ropes',
  small_joint_manipulation: 'Small joint manipulation',
  throwing_opponent_out_of_area: 'Throwing opponent out of the fighting area',
  finger_insertion: 'Intentional finger insertion',
  clawing_pinching_twisting: 'Clawing, pinching or twisting flesh',
  timidity: 'Timidity',
  abusive_language: 'Abusive language',
  disregarding_referee_instructions: 'Disregarding referee instructions',
  unsportsmanlike_conduct: 'Unsportsmanlike conduct',
  striking_after_the_bell: 'Striking after the bell',
  striking_during_break: 'Striking during a break',
  attacking_fighter_under_referee_care: 'Attacking a fighter under referee care',
  corner_interference: 'Corner interference',
};

export const REFEREE_ACTIONS = [
  'none',
  'verbal_warning',
  'official_warning',
  'point_deduction',
  'medical_timeout',
  'disqualification',
  'no_contest',
  'technical_decision',
  'technical_draw',
];

/**
 * A foul as recorded by an operator.
 *
 * Nothing here is inferred. A point deduction is stored only when
 * `refereeAction` is 'point_deduction', which the operator sets because the
 * referee announced it — the application never decides that on its own.
 */
const foulRecordSchema = new mongoose.Schema(
  {
    bout: { type: mongoose.Schema.Types.ObjectId, ref: 'Bout', required: true, index: true },
    roundNo: { type: Number, required: true, min: 1, index: true },

    /** The fighter who committed the foul. */
    corner: { type: String, enum: ['red', 'blue'], required: true },
    category: { type: String, enum: FOUL_CATEGORIES, required: true },
    intent: { type: String, enum: ['intentional', 'accidental', 'undetermined'], default: 'undetermined' },

    fightTimeSec: { type: Number, default: 0, min: 0 },

    refereeAction: { type: String, enum: REFEREE_ACTIONS, default: 'none' },

    /**
     * Points removed from the offending fighter's round score. Only non-zero
     * when the referee actually announced a deduction.
     */
    pointsDeducted: { type: Number, default: 0, min: 0, max: 3 },

    medicalTimeout: { type: Boolean, default: false },
    notes: { type: String, default: '', maxlength: 600 },

    recordedBy: { type: String, default: 'statistician', maxlength: 120 },
    voided: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

foulRecordSchema.index({ bout: 1, roundNo: 1, voided: 1 });

/** A deduction is only real when the referee action says so. */
foulRecordSchema.pre('save', function guardDeduction(next) {
  if (this.refereeAction !== 'point_deduction') this.pointsDeducted = 0;
  else if (this.pointsDeducted < 1) this.pointsDeducted = 1;
  next();
});

export default mongoose.model('FoulRecord', foulRecordSchema);
