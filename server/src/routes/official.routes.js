import { Router } from 'express';
import Official from '../models/Official.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();

/** GET /api/officials?league=:id&kind=judge|referee */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.league) filter.league = req.query.league;
    if (req.query.kind) filter.kind = req.query.kind;

    const officials = await Official.find(filter).sort({ name: 1 });
    res.json(officials);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const official = await Official.findById(req.params.id);
    if (!official) return res.status(404).json({ message: 'Official not found' });
    res.json(official);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { league, kind, name, contactNo, bloodGroup, licenseNo } = req.body;
    const official = await Official.create({
      league,
      kind,
      name,
      contactNo,
      bloodGroup,
      licenseNo,
    });
    res.status(201).json(official);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const official = await Official.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!official) return res.status(404).json({ message: 'Official not found' });
    res.json(official);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const official = await Official.findByIdAndDelete(req.params.id);
    if (!official) return res.status(404).json({ message: 'Official not found' });
    res.json({ message: 'Official deleted', id: official._id });
  })
);

export default router;
