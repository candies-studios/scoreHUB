import { Router } from 'express';
import Athlete from '../models/Athlete.js';
import Registration from '../models/Registration.js';
import { asyncHandler } from '../middleware/error.js';
import upload, { publicUrl } from '../middleware/upload.js';
import { athleteProfile } from '../utils/tournamentService.js';

const router = Router();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** GET /api/athletes?q=&academy=&gender=&belt= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, academy, gender, belt } = req.query;
    const filter = {};
    if (academy) filter.academy = academy;
    if (gender) filter.gender = gender;
    if (belt) filter.belt = belt;
    if (q) {
      const rx = new RegExp(escape(String(q)), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }];
    }
    const athletes = await Athlete.find(filter)
      .populate('academy', 'name')
      .sort({ lastName: 1, firstName: 1 })
      .limit(Math.min(Number(req.query.limit) || 200, 1000));
    res.json(athletes);
  })
);

/** Full profile: record, medals, match history, upcoming events. */
router.get('/:id', asyncHandler(async (req, res) => res.json(await athleteProfile(req.params.id))));

router.post(
  '/',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.photoUrl = publicUrl(req.file.filename);
    if (!payload.academy) delete payload.academy;
    res.status(201).json(await Athlete.create(payload));
  })
);

router.put(
  '/:id',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (req.file) payload.photoUrl = publicUrl(req.file.filename);
    if (payload.academy === '') payload.academy = null;
    const athlete = await Athlete.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    res.json(athlete);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const entries = await Registration.countDocuments({ athlete: req.params.id, status: { $ne: 'cancelled' } });
    if (entries) return res.status(409).json({ message: 'Athlete has event registrations — cancel them first' });
    const athlete = await Athlete.findByIdAndDelete(req.params.id);
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    res.json({ message: 'Athlete deleted', id: athlete._id });
  })
);

export default router;
