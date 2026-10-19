import { Router } from 'express';
import Bout from '../models/Bout.js';
import Scorecard from '../models/Scorecard.js';
import { asyncHandler } from '../middleware/error.js';
import { ensureScorecards, buildSummary } from '../utils/scoring.js';

const router = Router();

const POPULATE = [
  { path: 'blueCorner.fighter', select: 'name team photoUrl weightClass record' },
  { path: 'redCorner.fighter', select: 'name team photoUrl weightClass record' },
  { path: 'judges', select: 'name' },
  { path: 'referee', select: 'name' },
];

/** GET /api/bouts?league=:id&type=Professional */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.league) filter.league = req.query.league;
    if (req.query.type) filter.boutType = req.query.type;
    if (req.query.discipline) filter.discipline = req.query.discipline;

    const bouts = await Bout.find(filter).populate(POPULATE).sort({ boutNo: 1 });
    res.json(bouts);
  })
);

/** GET /api/bouts/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const bout = await Bout.findById(req.params.id).populate(POPULATE);
    if (!bout) return res.status(404).json({ message: 'Bout not found' });
    res.json(bout);
  })
);

/** POST /api/bouts */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = normalizeBout(req.body);
    const bout = await Bout.create(payload);
    await ensureScorecards(bout._id);
    res.status(201).json(await bout.populate(POPULATE));
  })
);

/** PUT /api/bouts/:id */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const payload = normalizeBout(req.body);
    const bout = await Bout.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!bout) return res.status(404).json({ message: 'Bout not found' });

    await ensureScorecards(bout._id);
    res.json(await bout.populate(POPULATE));
  })
);

/** DELETE /api/bouts/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const bout = await Bout.findByIdAndDelete(req.params.id);
    if (!bout) return res.status(404).json({ message: 'Bout not found' });
    await Scorecard.deleteMany({ bout: bout._id });
    res.json({ message: 'Bout deleted', id: bout._id });
  })
);

/** GET /api/bouts/:id/scorecards?judge=:officialId — raw judge cards */
router.get(
  '/:id/scorecards',
  asyncHandler(async (req, res) => {
    const cards = await ensureScorecards(req.params.id);
    if (!req.query.judge) return res.json(cards);

    res.json(
      cards.filter((c) => String(c.judge?._id || c.judge) === String(req.query.judge))
    );
  })
);

/** GET /api/bouts/:id/summary — supervised combined scoreboard */
router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    res.json(await buildSummary(req.params.id));
  })
);

/** POST /api/bouts/:id/reset — clear all cards and reopen the bout */
router.post(
  '/:id/reset',
  asyncHandler(async (req, res) => {
    const bout = await Bout.findById(req.params.id);
    if (!bout) return res.status(404).json({ message: 'Bout not found' });

    await Scorecard.updateMany({ bout: bout._id }, { $set: { rounds: [], locked: false } });
    bout.status = 'scheduled';
    bout.currentRound = 1;
    bout.result = {
      winnerCorner: null,
      winnerFighter: null,
      method: null,
      endedRound: null,
      endedAtSec: null,
      notes: '',
      decidedAt: null,
    };
    await bout.save();

    res.json({ message: 'Bout reset', bout: await bout.populate(POPULATE) });
  })
);

function normalizeBout(body) {
  const payload = { ...body };

  if (payload.blueCornerFighter) payload.blueCorner = { fighter: payload.blueCornerFighter };
  if (payload.redCornerFighter) payload.redCorner = { fighter: payload.redCornerFighter };
  delete payload.blueCornerFighter;
  delete payload.redCornerFighter;

  if (payload.judges) payload.judges = payload.judges.filter(Boolean).slice(0, 3);
  if (payload.roundDurationMinutes) {
    payload.roundDurationSec = Math.round(Number(payload.roundDurationMinutes) * 60);
    delete payload.roundDurationMinutes;
  }
  if (payload.referee === '') payload.referee = null;

  // The result is owned by the live scoring flow, never by generic CRUD.
  delete payload.result;
  delete payload.status;

  return payload;
}

export default router;
