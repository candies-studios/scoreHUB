import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import {
  matchView,
  finishMatch,
  reopenMatch,
  adjustScore,
  controlClock,
} from '../utils/tournamentService.js';
import { broadcastMatch } from '../sockets/matHandlers.js';
import Match from '../models/Match.js';

const router = Router();

router.get('/:id', asyncHandler(async (req, res) => res.json(await matchView(req.params.id))));

/** Manual result entry from the organiser panel (no live scoreboard needed). */
router.post(
  '/:id/result',
  asyncHandler(async (req, res) => {
    const { winner, method, submissionType, score } = req.body;
    if (score) {
      // Optional final score typed in by the table worker.
      await Match.updateOne({ _id: req.params.id, status: { $ne: 'completed' } }, { $set: { score } });
    }
    await finishMatch(req.params.id, { winner, method, submissionType });
    const view = await matchView(req.params.id);
    broadcastMatch(req.app.get('io'), req.params.id, view);
    res.json(view);
  })
);

router.post(
  '/:id/reopen',
  asyncHandler(async (req, res) => {
    await reopenMatch(req.params.id);
    const view = await matchView(req.params.id);
    broadcastMatch(req.app.get('io'), req.params.id, view);
    res.json(view);
  })
);

/** REST fallbacks for the scoreboard (the socket is the normal path). */
router.post(
  '/:id/score',
  asyncHandler(async (req, res) => {
    const { side, field, delta } = req.body;
    await adjustScore(req.params.id, side, field, delta);
    const view = await matchView(req.params.id);
    broadcastMatch(req.app.get('io'), req.params.id, view);
    res.json(view);
  })
);

router.post(
  '/:id/clock',
  asyncHandler(async (req, res) => {
    await controlClock(req.params.id, req.body.action, req.body.value);
    const view = await matchView(req.params.id);
    broadcastMatch(req.app.get('io'), req.params.id, view);
    res.json(view);
  })
);

export default router;
