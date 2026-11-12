import Bout from '../models/Bout.js';
import FightSession from '../models/FightSession.js';
import FightEvent from '../models/FightEvent.js';
import ControlInterval from '../models/ControlInterval.js';
import FoulRecord from '../models/FoulRecord.js';
import RoundAssessment from '../models/RoundAssessment.js';
import { logAudit } from '../models/AuditLog.js';
import { getStats, getAllRoundStats } from './fightStats.js';
import { assessRound, buildScorecard } from './fightScoring.js';

/**
 * Service layer shared by the REST routes and the socket handlers, so both
 * paths go through exactly the same validation and audit logging.
 */

/** Get or create the persisted session for a bout, seeded from the bout. */
export async function getSession(boutId) {
  let session = await FightSession.findOne({ bout: boutId });
  if (session) return session;

  const bout = await Bout.findById(boutId);
  if (!bout) throw Object.assign(new Error('Bout not found'), { statusCode: 404 });

  session = await FightSession.create({
    bout: boutId,
    totalRounds: Math.min(bout.totalRounds || 3, 5),
    roundDurationSec: bout.roundDurationSec || 300,
    currentRound: 1,
  });
  return session;
}

/* ---------------- clock ---------------- */

export async function startClock(boutId, actor = 'statistician') {
  const session = await getSession(boutId);
  if (session.status === 'completed') {
    throw Object.assign(new Error('This fight is already complete'), { statusCode: 409 });
  }
  if (!session.runningSince) {
    session.runningSince = new Date();
    session.status = 'live';
    await session.save();
    await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'clock_changed', actor, after: { running: true } });
  }
  return session;
}

export async function pauseClock(boutId, actor = 'statistician') {
  const session = await getSession(boutId);
  if (session.runningSince) {
    session.accumulatedSec = session.elapsedSec();
    session.runningSince = null;
    session.status = 'paused';
    await session.save();
    await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'clock_changed', actor, after: { running: false, at: session.accumulatedSec } });
  }
  return session;
}

export async function resetClock(boutId, actor = 'statistician') {
  const session = await getSession(boutId);
  session.runningSince = null;
  session.accumulatedSec = 0;
  if (session.status === 'live') session.status = 'paused';
  await session.save();
  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'clock_changed', actor, after: { reset: true } });
  return session;
}

/** Manual correction — the clock is an observation too, and operators mistype. */
export async function setClock(boutId, seconds, actor = 'statistician', reason = '') {
  const session = await getSession(boutId);
  const before = session.elapsedSec();
  session.accumulatedSec = Math.max(0, Math.min(Number(seconds) || 0, session.roundDurationSec));
  if (session.runningSince) session.runningSince = new Date();
  await session.save();
  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'clock_changed', actor, reason, before: { at: before }, after: { at: session.accumulatedSec } });
  return session;
}

export async function nextRound(boutId, actor = 'statistician', endedEarlyReason = '') {
  const session = await getSession(boutId);
  const elapsed = session.elapsedSec();

  session.roundLog.push({
    roundNo: session.currentRound,
    durationSec: elapsed,
    complete: elapsed >= session.roundDurationSec && !endedEarlyReason,
    endedEarlyReason,
  });

  // Close any control interval still open, so it cannot bleed into the next round.
  await ControlInterval.updateMany(
    { bout: boutId, roundNo: session.currentRound, endSec: null, voided: false },
    { $set: { endSec: elapsed } }
  );

  if (session.currentRound >= session.totalRounds) {
    session.runningSince = null;
    session.accumulatedSec = elapsed;
    session.status = 'completed';
  } else {
    session.currentRound += 1;
    session.runningSince = null;
    session.accumulatedSec = 0;
    session.status = 'round_break';
  }

  await session.save();
  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'round_advanced', actor, after: { round: session.currentRound, status: session.status } });
  return session;
}

/* ---------------- events ---------------- */

export async function recordEvent(boutId, payload, actor = 'statistician') {
  const session = await getSession(boutId);
  const roundNo = payload.roundNo || session.currentRound;

  const ev = await FightEvent.create({
    bout: boutId,
    roundNo,
    corner: payload.corner,
    fighter: payload.fighter || null,
    type: payload.type,
    target: payload.target || null,
    position: payload.position || null,
    fightTimeSec: payload.fightTimeSec ?? session.elapsedSec(),
    note: payload.note || '',
    recordedBy: actor,
  });

  await logAudit({
    bout: boutId, roundNo, action: 'event_recorded', actor,
    targetModel: 'FightEvent', targetId: ev._id,
    after: { type: ev.type, corner: ev.corner, at: ev.fightTimeSec },
  });

  return ev;
}

/** Undo. Soft delete only — a correction must stay visible in the trail. */
export async function voidEvent(eventId, reason, actor = 'statistician') {
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('A reason is required to void an event'), { statusCode: 400 });
  }
  const ev = await FightEvent.findById(eventId);
  if (!ev) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  if (ev.voided) return ev;

  ev.voided = true;
  ev.voidReason = reason;
  ev.voidedAt = new Date();
  await ev.save();

  await logAudit({
    bout: ev.bout, roundNo: ev.roundNo, action: 'event_voided', actor, reason,
    targetModel: 'FightEvent', targetId: ev._id,
    before: { type: ev.type, corner: ev.corner },
  });
  return ev;
}

/* ---------------- control intervals ---------------- */

export async function startControl(boutId, { corner, position }, actor = 'statistician') {
  const session = await getSession(boutId);
  const at = session.elapsedSec();

  // Only one corner can be in control at a time; close the other first.
  await ControlInterval.updateMany(
    { bout: boutId, roundNo: session.currentRound, endSec: null, voided: false },
    { $set: { endSec: at } }
  );

  const iv = await ControlInterval.create({
    bout: boutId,
    roundNo: session.currentRound,
    corner,
    position: position || 'other',
    startSec: at,
    recordedBy: actor,
  });

  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'control_started', actor, targetModel: 'ControlInterval', targetId: iv._id, after: { corner, at } });
  return iv;
}

export async function stopControl(boutId, { offensiveOutput = false } = {}, actor = 'statistician') {
  const session = await getSession(boutId);
  const at = session.elapsedSec();

  const open = await ControlInterval.find({
    bout: boutId, roundNo: session.currentRound, endSec: null, voided: false,
  });

  for (const iv of open) {
    iv.endSec = at;
    if (offensiveOutput) iv.offensiveOutput = true;
    // eslint-disable-next-line no-await-in-loop
    await iv.save();
  }

  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'control_stopped', actor, after: { at, closed: open.length, offensiveOutput } });
  return open;
}

/** Mark the active (or most recent) interval as having produced offence. */
export async function markControlActive(boutId, actor = 'statistician') {
  const session = await getSession(boutId);
  const iv = await ControlInterval.findOne({
    bout: boutId, roundNo: session.currentRound, voided: false,
  }).sort({ createdAt: -1 });
  if (!iv) return null;
  iv.offensiveOutput = true;
  await iv.save();
  await logAudit({ bout: boutId, roundNo: session.currentRound, action: 'control_started', actor, targetModel: 'ControlInterval', targetId: iv._id, after: { offensiveOutput: true } });
  return iv;
}

/* ---------------- fouls ---------------- */

export async function recordFoul(boutId, payload, actor = 'statistician') {
  const session = await getSession(boutId);
  const foul = await FoulRecord.create({
    bout: boutId,
    roundNo: payload.roundNo || session.currentRound,
    corner: payload.corner,
    category: payload.category,
    intent: payload.intent || 'undetermined',
    fightTimeSec: payload.fightTimeSec ?? session.elapsedSec(),
    refereeAction: payload.refereeAction || 'none',
    pointsDeducted: payload.pointsDeducted || 0,
    medicalTimeout: Boolean(payload.medicalTimeout),
    notes: payload.notes || '',
    recordedBy: actor,
  });

  await logAudit({
    bout: boutId, roundNo: foul.roundNo, action: 'foul_recorded', actor,
    targetModel: 'FoulRecord', targetId: foul._id,
    after: { category: foul.category, corner: foul.corner, action: foul.refereeAction, points: foul.pointsDeducted },
  });
  return foul;
}

export async function voidFoul(foulId, reason, actor = 'statistician') {
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('A reason is required to void a foul record'), { statusCode: 400 });
  }
  const foul = await FoulRecord.findById(foulId);
  if (!foul) throw Object.assign(new Error('Foul record not found'), { statusCode: 404 });
  foul.voided = true;
  await foul.save();
  await logAudit({ bout: foul.bout, roundNo: foul.roundNo, action: 'foul_voided', actor, reason, targetModel: 'FoulRecord', targetId: foul._id });
  return foul;
}

/** Deductions per corner for one round, from referee-confirmed fouls only. */
export async function deductionsForRound(boutId, roundNo) {
  const fouls = await FoulRecord.find({
    bout: boutId, roundNo, voided: false, refereeAction: 'point_deduction',
  }).lean();
  return fouls.reduce(
    (acc, f) => { acc[f.corner] += f.pointsDeducted || 0; return acc; },
    { red: 0, blue: 0 }
  );
}

/* ---------------- estimates ---------------- */

/**
 * Estimate one round. Always recomputed from the event log — the cached copy
 * on RoundAssessment is for history, never the source of truth.
 */
export async function estimateRound(boutId, roundNo) {
  const session = await getSession(boutId);
  const nowSec = session.currentRound === roundNo ? session.elapsedSec() : null;

  const [stats, assessment, deductions] = await Promise.all([
    getStats(boutId, roundNo, nowSec),
    RoundAssessment.findOne({ bout: boutId, roundNo }),
    deductionsForRound(boutId, roundNo),
  ]);

  const logged = session.roundLog.find((r) => r.roundNo === roundNo);
  const roundComplete = logged ? logged.complete : roundNo < session.currentRound;

  const estimate = assessRound({
    stats,
    overrides: assessment?.overrides ? assessment.toObject().overrides : {},
    insufficientEvidence: assessment?.insufficientEvidence || false,
    roundLengthSec: session.roundDurationSec,
    roundComplete,
    deductions,
  });

  return { roundNo, stats, estimate, analystNotes: assessment?.analystNotes || '' };
}

export async function estimateFight(boutId) {
  const session = await getSession(boutId);
  const rounds = [];
  for (let r = 1; r <= session.totalRounds; r += 1) {
    // eslint-disable-next-line no-await-in-loop
    rounds.push(await estimateRound(boutId, r));
  }

  const scorecard = buildScorecard(
    rounds.map((r) => ({ roundNo: r.roundNo, ...r.estimate }))
  );

  return { session: session.clockState(), rounds, scorecard };
}

export async function saveAssessment(boutId, roundNo, patch, actor = 'analyst') {
  const existing = await RoundAssessment.findOne({ bout: boutId, roundNo });
  const before = existing ? existing.toObject().overrides : null;

  const assessment = await RoundAssessment.findOneAndUpdate(
    { bout: boutId, roundNo },
    {
      $set: {
        ...(patch.overrides ? { overrides: patch.overrides } : {}),
        ...(patch.insufficientEvidence !== undefined
          ? { insufficientEvidence: patch.insufficientEvidence }
          : {}),
        ...(patch.analystNotes !== undefined ? { analystNotes: patch.analystNotes } : {}),
        updatedBy: actor,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await logAudit({
    bout: boutId, roundNo, action: 'assessment_override', actor,
    reason: patch.reason || '',
    targetModel: 'RoundAssessment', targetId: assessment._id,
    before, after: assessment.toObject().overrides,
  });

  return assessment;
}

/* ---------------- official result ---------------- */

/**
 * Section 10 — a human confirms the official result. The estimated scoring
 * engine never calls this.
 */
export async function confirmResult(boutId, payload, actor = 'admin') {
  const session = await getSession(boutId);
  session.officialResult = {
    method: payload.method || null,
    winnerCorner: payload.winnerCorner || null,
    endedRound: payload.endedRound ?? session.currentRound,
    endedAtSec: payload.endedAtSec ?? session.elapsedSec(),
    notes: payload.notes || '',
    confirmedBy: actor,
    confirmedAt: new Date(),
  };
  session.status = 'completed';
  session.runningSince = null;
  await session.save();

  await logAudit({
    bout: boutId, roundNo: session.currentRound, action: 'result_confirmed', actor,
    after: session.officialResult,
  });
  return session;
}

/** Everything a dashboard needs in one call. */
export async function getFightSnapshot(boutId) {
  const session = await getSession(boutId);
  const nowSec = session.elapsedSec();

  const [bout, allStats, fouls] = await Promise.all([
    Bout.findById(boutId)
      .populate('blueCorner.fighter')
      .populate('redCorner.fighter')
      .populate('referee', 'name')
      .populate('league', 'name date location promoter'),
    getAllRoundStats(boutId, session.totalRounds, nowSec),
    FoulRecord.find({ bout: boutId, voided: false }).sort({ roundNo: 1, fightTimeSec: 1 }).lean(),
  ]);

  return {
    bout,
    clock: session.clockState(),
    officialResult: session.officialResult,
    roundLog: session.roundLog,
    stats: allStats,
    fouls,
  };
}

export { getStats, getAllRoundStats };
