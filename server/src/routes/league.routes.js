import { Router } from 'express';
import League from '../models/League.js';
import Bout from '../models/Bout.js';
import Fighter from '../models/Fighter.js';
import Official from '../models/Official.js';
import { asyncHandler } from '../middleware/error.js';
import upload, { publicUrl } from '../middleware/upload.js';

const router = Router();

/** GET /api/leagues?scope=upcoming|past|all */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = req.query.scope || 'all';
    const now = new Date();

    let filter = {};
    if (scope === 'upcoming') filter = { date: { $gte: new Date(now.toDateString()) } };
    if (scope === 'past') filter = { date: { $lt: new Date(now.toDateString()) } };

    const leagues = await League.find(filter).sort({ date: scope === 'past' ? -1 : 1 });
    res.json(leagues);
  })
);

/** GET /api/leagues/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });
    res.json(league);
  })
);

/** POST /api/leagues */
router.post(
  '/',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const payload = parseLeagueBody(req);
    if (req.file) payload.logoUrl = publicUrl(req.file.filename);

    const league = await League.create(payload);
    res.status(201).json(league);
  })
);

/** PUT /api/leagues/:id */
router.put(
  '/:id',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const payload = parseLeagueBody(req);
    if (req.file) payload.logoUrl = publicUrl(req.file.filename);

    const league = await League.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!league) return res.status(404).json({ message: 'League not found' });
    res.json(league);
  })
);

/** DELETE /api/leagues/:id — cascades to bouts, fighters and officials */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const league = await League.findByIdAndDelete(req.params.id);
    if (!league) return res.status(404).json({ message: 'League not found' });

    await Promise.all([
      Bout.deleteMany({ league: league._id }),
      Fighter.deleteMany({ league: league._id }),
      Official.deleteMany({ league: league._id }),
    ]);

    res.json({ message: 'League deleted', id: league._id });
  })
);

function parseLeagueBody(req) {
  const b = req.body || {};
  const num = (v) => (v === undefined || v === '' ? 0 : Number(v));

  const payload = {
    name: b.name,
    date: b.date,
    time: b.time,
    location: b.location,
    promoter: b.promoter,
  };

  // Bout counts arrive either nested (JSON) or flattened (multipart form).
  const nested = typeof b.bouts === 'string' ? safeParse(b.bouts) : b.bouts;
  payload.bouts = {
    amateurMMA: num(nested?.amateurMMA ?? b['bouts.amateurMMA'] ?? b.amateurMMA),
    amateurBJJ: num(nested?.amateurBJJ ?? b['bouts.amateurBJJ'] ?? b.amateurBJJ),
    amateurK1: num(nested?.amateurK1 ?? b['bouts.amateurK1'] ?? b.amateurK1),
    proMMA: num(nested?.proMMA ?? b['bouts.proMMA'] ?? b.proMMA),
    proBJJ: num(nested?.proBJJ ?? b['bouts.proBJJ'] ?? b.proBJJ),
    proK1: num(nested?.proK1 ?? b['bouts.proK1'] ?? b.proK1),
  };

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

export default router;
