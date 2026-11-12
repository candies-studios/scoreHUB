import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { athleteRankings, academyRankings } from '../utils/tournamentService.js';

const router = Router();

/** GET /api/rankings/athletes?sport=&gender=&belt=&limit= */
router.get(
  '/athletes',
  asyncHandler(async (req, res) => {
    const { sport, gender, belt, limit } = req.query;
    res.json(await athleteRankings({ sport, gender, belt, limit }));
  })
);

/** GET /api/rankings/academies?sport= */
router.get(
  '/academies',
  asyncHandler(async (req, res) => res.json(await academyRankings({ sport: req.query.sport })))
);

export default router;
