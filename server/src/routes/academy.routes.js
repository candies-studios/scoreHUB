import { Router } from 'express';
import Academy from '../models/Academy.js';
import Athlete from '../models/Athlete.js';
import { asyncHandler } from '../middleware/error.js';
import upload, { publicUrl } from '../middleware/upload.js';
import { academyProfile } from '../utils/tournamentService.js';

const router = Router();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** GET /api/academies?q=  — with athlete counts */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.q) filter.name = new RegExp(escape(String(req.query.q)), 'i');
    if (req.query.country) filter.country = req.query.country;
    const academies = await Academy.find(filter).sort({ name: 1 }).lean();
    const counts = await Athlete.aggregate([{ $group: { _id: '$academy', n: { $sum: 1 } } }]);
    const by = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(academies.map((a) => ({ ...a, athleteCount: by.get(String(a._id)) || 0 })));
  })
);

router.get('/:id', asyncHandler(async (req, res) => res.json(await academyProfile(req.params.id))));

router.post(
  '/',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.logoUrl = publicUrl(req.file.filename);
    res.status(201).json(await Academy.create(payload));
  })
);

router.put(
  '/:id',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.logoUrl = publicUrl(req.file.filename);
    const academy = await Academy.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    res.json(academy);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const academy = await Academy.findByIdAndDelete(req.params.id);
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    await Athlete.updateMany({ academy: academy._id }, { $unset: { academy: 1 } });
    res.json({ message: 'Academy deleted', id: academy._id });
  })
);

export default router;
