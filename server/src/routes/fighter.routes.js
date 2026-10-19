import { Router } from 'express';
import Fighter from '../models/Fighter.js';
import { asyncHandler } from '../middleware/error.js';
import upload, { publicUrl } from '../middleware/upload.js';

const router = Router();

/** GET /api/fighters?league=:id */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.league ? { league: req.query.league } : {};
    const fighters = await Fighter.find(filter).sort({ name: 1 });
    res.json(fighters);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const fighter = await Fighter.findById(req.params.id);
    if (!fighter) return res.status(404).json({ message: 'Fighter not found' });
    res.json(fighter);
  })
);

router.post(
  '/',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.photoUrl = publicUrl(req.file.filename);
    if (typeof payload.record === 'string') payload.record = JSON.parse(payload.record);

    const fighter = await Fighter.create(payload);
    res.status(201).json(fighter);
  })
);

router.put(
  '/:id',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.photoUrl = publicUrl(req.file.filename);
    if (typeof payload.record === 'string') payload.record = JSON.parse(payload.record);

    const fighter = await Fighter.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!fighter) return res.status(404).json({ message: 'Fighter not found' });
    res.json(fighter);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const fighter = await Fighter.findByIdAndDelete(req.params.id);
    if (!fighter) return res.status(404).json({ message: 'Fighter not found' });
    res.json({ message: 'Fighter deleted', id: fighter._id });
  })
);

export default router;
