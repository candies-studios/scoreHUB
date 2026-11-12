import { Router } from 'express';
import FightEvent, {
  COUNT_EVENTS,
  OBSERVATION_EVENTS,
  STRIKE_TARGETS,
  STRIKE_POSITIONS,
} from '../models/FightEvent.js';
import ControlInterval from '../models/ControlInterval.js';
import FoulRecord, { FOUL_CATEGORIES, FOUL_LABELS, REFEREE_ACTIONS } from '../models/FoulRecord.js';
import AuditLog from '../models/AuditLog.js';
import RoundAssessment, { CRITERIA, CRITERION_LABELS } from '../models/RoundAssessment.js';
import { asyncHandler } from '../middleware/error.js';
import { DISCLAIMER } from '../utils/fightScoring.js';
import * as svc from '../utils/fightService.js';

/**
 * /api/fights — the analytics layer.
 *
 * Mounted on its own path so nothing here can disturb /api/bouts, which the
 * judge memory sheet depends on.
 */
const router = Router();

/** Vocabulary, so the client never hardcodes enums that live on the server. */
router.get('/meta', (req, res) => {
  res.json({
    countEvents: COUNT_EVENTS,
    observationEvents: OBSERVATION_EVENTS,
    strikeTargets: STRIKE_TARGETS,
    strikePositions: STRIKE_POSITIONS,
    foulCategories: FOUL_CATEGORIES.map((c) => ({ value: c, label: FOUL_LABELS[c] })),
    refereeActions: REFEREE_ACTIONS,
    criteria: CRITERIA.map((c) => ({ key: c, label: CRITERION_LABELS[c] })),
    disclaimer: DISCLAIMER,
  });
});

/* ---------------- snapshot & stats ---------------- */

router.get('/:boutId/snapshot', asyncHandler(async (req, res) => {
  res.json(await svc.getFightSnapshot(req.params.boutId));
}));

router.get('/:boutId/stats', asyncHandler(async (req, res) => {
  const round = req.query.round ? Number(req.query.round) : null;
  const session = await svc.getSession(req.params.boutId);
  const nowSec = session.elapsedSec();
  res.json(await svc.getStats(req.params.boutId, round, nowSec));
}));

/* ---------------- clock ---------------- */

router.get('/:boutId/clock', asyncHandler(async (req, res) => {
  const session = await svc.getSession(req.params.boutId);
  res.json(session.clockState());
}));

router.post('/:boutId/clock/:action', asyncHandler(async (req, res) => {
  const { boutId, action } = req.params;
  const actor = req.body?.actor || 'statistician';
  let session;

  switch (action) {
    case 'start':
    case 'resume':
      session = await svc.startClock(boutId, actor);
      break;
    case 'pause':
      session = await svc.pauseClock(boutId, actor);
      break;
    case 'reset':
      session = await svc.resetClock(boutId, actor);
      break;
    case 'set':
      session = await svc.setClock(boutId, req.body?.seconds, actor, req.body?.reason);
      break;
    case 'next-round':
      session = await svc.nextRound(boutId, actor, req.body?.endedEarlyReason || '');
      break;
    default:
      return res.status(400).json({ message: `Unknown clock action: ${action}` });
  }

  res.json(session.clockState());
}));

/* ---------------- events ---------------- */

router.get('/:boutId/events', asyncHandler(async (req, res) => {
  const filter = { bout: req.params.boutId };
  if (req.query.round) filter.roundNo = Number(req.query.round);
  if (req.query.includeVoided !== 'true') filter.voided = false;

  const events = await FightEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 200, 500))
    .lean();
  res.json(events);
}));

router.post('/:boutId/events', asyncHandler(async (req, res) => {
  const ev = await svc.recordEvent(req.params.boutId, req.body, req.body?.actor || 'statistician');
  res.status(201).json(ev);
}));

router.post('/:boutId/events/:eventId/void', asyncHandler(async (req, res) => {
  const ev = await svc.voidEvent(req.params.eventId, req.body?.reason, req.body?.actor || 'statistician');
  res.json(ev);
}));

/* ---------------- control intervals ---------------- */

router.get('/:boutId/control', asyncHandler(async (req, res) => {
  const filter = { bout: req.params.boutId, voided: false };
  if (req.query.round) filter.roundNo = Number(req.query.round);
  res.json(await ControlInterval.find(filter).sort({ startSec: 1 }).lean());
}));

router.post('/:boutId/control/start', asyncHandler(async (req, res) => {
  res.status(201).json(await svc.startControl(req.params.boutId, req.body, req.body?.actor));
}));

router.post('/:boutId/control/stop', asyncHandler(async (req, res) => {
  res.json(await svc.stopControl(req.params.boutId, req.body, req.body?.actor));
}));

router.post('/:boutId/control/mark-active', asyncHandler(async (req, res) => {
  res.json(await svc.markControlActive(req.params.boutId, req.body?.actor));
}));

/* ---------------- fouls ---------------- */

router.get('/:boutId/fouls', asyncHandler(async (req, res) => {
  const filter = { bout: req.params.boutId, voided: false };
  if (req.query.round) filter.roundNo = Number(req.query.round);
  res.json(await FoulRecord.find(filter).sort({ roundNo: 1, fightTimeSec: 1 }).lean());
}));

router.post('/:boutId/fouls', asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordFoul(req.params.boutId, req.body, req.body?.actor));
}));

router.post('/:boutId/fouls/:foulId/void', asyncHandler(async (req, res) => {
  res.json(await svc.voidFoul(req.params.foulId, req.body?.reason, req.body?.actor));
}));

/* ---------------- estimates ---------------- */

router.get('/:boutId/estimate/:roundNo', asyncHandler(async (req, res) => {
  res.json(await svc.estimateRound(req.params.boutId, Number(req.params.roundNo)));
}));

router.get('/:boutId/scorecard', asyncHandler(async (req, res) => {
  res.json(await svc.estimateFight(req.params.boutId));
}));

router.get('/:boutId/assessment/:roundNo', asyncHandler(async (req, res) => {
  const a = await RoundAssessment.findOne({
    bout: req.params.boutId,
    roundNo: Number(req.params.roundNo),
  });
  res.json(a || { bout: req.params.boutId, roundNo: Number(req.params.roundNo), overrides: {} });
}));

router.put('/:boutId/assessment/:roundNo', asyncHandler(async (req, res) => {
  const a = await svc.saveAssessment(
    req.params.boutId,
    Number(req.params.roundNo),
    req.body,
    req.body?.actor || 'analyst'
  );
  res.json(a);
}));

/* ---------------- official result ---------------- */

router.post('/:boutId/result', asyncHandler(async (req, res) => {
  const session = await svc.confirmResult(req.params.boutId, req.body, req.body?.actor || 'admin');
  res.json({ officialResult: session.officialResult, clock: session.clockState() });
}));

/* ---------------- audit ---------------- */

router.get('/:boutId/audit', asyncHandler(async (req, res) => {
  const logs = await AuditLog.find({ bout: req.params.boutId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 100, 500))
    .lean();
  res.json(logs);
}));

export default router;
