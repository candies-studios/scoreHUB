/**
 * Tournaments ("events"), their divisions, registrations, brackets, mat
 * schedule and results.
 *
 *   /api/tournaments                          list / create
 *   /api/tournaments/:id                      get / update / delete
 *   /api/tournaments/:id/divisions            list / create
 *   /api/tournaments/:id/divisions/generate   bulk-create from a template
 *   /api/tournaments/:id/registrations        list / register
 *   /api/tournaments/:id/brackets             draw every open division
 *   /api/tournaments/:id/schedule             GET mats / POST auto-schedule
 *   /api/tournaments/:id/results              podiums + academy medal table
 *
 *   /api/divisions/:id                        update / delete
 *   /api/divisions/:id/bracket                GET / POST draw / DELETE clear
 *   /api/registrations/:id                    PATCH status, paid, check-in, weigh-in
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import Tournament from '../models/Tournament.js';
import Division from '../models/Division.js';
import Registration from '../models/Registration.js';
import Match from '../models/Match.js';
import Athlete from '../models/Athlete.js';
import Academy from '../models/Academy.js';
import { asyncHandler } from '../middleware/error.js';
import upload, { publicUrl } from '../middleware/upload.js';
import {
  HttpError,
  generateBracket,
  clearBracket,
  divisionBracket,
  scheduleTournament,
  matSchedule,
  tournamentResults,
} from '../utils/tournamentService.js';

export const tournamentRouter = Router();
export const divisionRouter = Router();
export const registrationRouter = Router();

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function parseBody(body) {
  const out = { ...body };
  // multipart sends nested objects as JSON strings
  if (typeof out.fee === 'string') out.fee = JSON.parse(out.fee);
  for (const k of ['requireApproval']) if (typeof out[k] === 'string') out[k] = out[k] === 'true';
  return out;
}

/* ------------------------------ tournaments ------------------------------ */

/** GET /api/tournaments?scope=upcoming|past|all&q=&sport= */
tournamentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { scope = 'all', q, sport } = req.query;
    const filter = {};
    if (sport) filter.sport = sport;
    if (q) {
      const rx = new RegExp(escape(String(q)), 'i');
      filter.$or = [{ name: rx }, { city: rx }, { organizer: rx }, { venue: rx }];
    }
    const today = startOfToday();
    if (scope === 'upcoming') {
      filter.status = { $ne: 'completed' };
      filter.$and = [{ $or: [{ endDate: { $gte: today } }, { startDate: { $gte: today } }] }];
    } else if (scope === 'past') {
      filter.$and = [
        { $or: [{ status: 'completed' }, { $and: [{ startDate: { $lt: today } }, { $or: [{ endDate: null }, { endDate: { $lt: today } }] }] }] },
      ];
    }
    const sort = scope === 'past' ? { startDate: -1 } : { startDate: 1 };
    const list = await Tournament.find(filter).sort(sort).limit(200);

    const ids = list.map((t) => t._id);
    const counts = await Registration.aggregate([
      { $match: { tournament: { $in: ids }, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$tournament', n: { $sum: 1 } } },
    ]);
    const by = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(list.map((t) => ({ ...t.toJSON(), registrationCount: by.get(String(t._id)) || 0 })));
  })
);

tournamentRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Tournament not found' });
    const [divisions, registrations, academies] = await Promise.all([
      Division.countDocuments({ tournament: t._id }),
      Registration.countDocuments({ tournament: t._id, status: { $ne: 'cancelled' } }),
      Registration.distinct('academy', { tournament: t._id, status: { $ne: 'cancelled' } }),
    ]);
    res.json({ ...t.toJSON(), stats: { divisions, registrations, academies: academies.filter(Boolean).length } });
  })
);

tournamentRouter.post(
  '/',
  upload.single('cover'),
  asyncHandler(async (req, res) => {
    const payload = parseBody(req.body);
    if (req.file) payload.coverUrl = publicUrl(req.file.filename);
    res.status(201).json(await Tournament.create(payload));
  })
);

tournamentRouter.put(
  '/:id',
  upload.single('cover'),
  asyncHandler(async (req, res) => {
    const payload = parseBody(req.body);
    if (req.file) payload.coverUrl = publicUrl(req.file.filename);
    const t = await Tournament.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!t) return res.status(404).json({ message: 'Tournament not found' });
    res.json(t);
  })
);

tournamentRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await Tournament.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Tournament not found' });
    await Promise.all([
      Division.deleteMany({ tournament: t._id }),
      Registration.deleteMany({ tournament: t._id }),
      Match.deleteMany({ tournament: t._id }),
    ]);
    res.json({ message: 'Tournament deleted', id: t._id });
  })
);

/* ------------------------------ divisions ------------------------------ */

tournamentRouter.get(
  '/:id/divisions',
  asyncHandler(async (req, res) => {
    const tid = new mongoose.Types.ObjectId(req.params.id);
    const divisions = await Division.find({ tournament: tid }).sort({ ageGroup: 1, gender: 1, belt: 1, maxWeightKg: 1 }).lean();
    const [regCounts, matchCounts] = await Promise.all([
      Registration.aggregate([
        { $match: { tournament: tid, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$division', n: { $sum: 1 } } },
      ]),
      Match.aggregate([
        { $match: { tournament: tid, isBye: false } },
        { $group: { _id: '$division', n: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
      ]),
    ]);
    const r = new Map(regCounts.map((c) => [String(c._id), c.n]));
    const m = new Map(matchCounts.map((c) => [String(c._id), c]));
    res.json(
      divisions.map((d) => ({
        ...d,
        registrationCount: r.get(String(d._id)) || 0,
        matchCount: m.get(String(d._id))?.n || 0,
        matchesDone: m.get(String(d._id))?.done || 0,
      }))
    );
  })
);

tournamentRouter.post(
  '/:id/divisions',
  asyncHandler(async (req, res) => {
    const t = await Tournament.exists({ _id: req.params.id });
    if (!t) return res.status(404).json({ message: 'Tournament not found' });
    res.status(201).json(await Division.create({ ...req.body, tournament: req.params.id }));
  })
);

/**
 * Bulk-create the cartesian product of a template, skipping names that exist.
 * Body: { genders:[], ageGroups:[], belts:[], weights:[{label, maxKg}], uniform, bracketType }
 */
tournamentRouter.post(
  '/:id/divisions/generate',
  asyncHandler(async (req, res) => {
    const t = await Tournament.exists({ _id: req.params.id });
    if (!t) return res.status(404).json({ message: 'Tournament not found' });
    const {
      genders = ['male'],
      ageGroups = ['Adult'],
      belts = ['all'],
      weights = [{ label: 'Open', maxKg: 0 }],
      uniform = 'gi',
      bracketType = 'auto',
    } = req.body;
    if (genders.length * ageGroups.length * belts.length * weights.length > 500) {
      throw new HttpError(400, 'That template would create more than 500 divisions');
    }
    const existing = new Set(
      (await Division.find({ tournament: req.params.id }, 'name').lean()).map((d) => d.name)
    );
    const created = [];
    for (const ageGroup of ageGroups)
      for (const gender of genders)
        for (const belt of belts)
          for (const w of weights) {
            const d = new Division({
              tournament: req.params.id,
              ageGroup,
              gender,
              belt,
              weightClass: w.label,
              maxWeightKg: Number(w.maxKg) || 0,
              uniform,
              bracketType,
            });
            await d.validate();
            if (existing.has(d.name)) continue;
            await d.save();
            existing.add(d.name);
            created.push(d);
          }
    res.status(201).json({ created: created.length, divisions: created });
  })
);

divisionRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await Division.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Division not found' });
    const { tournament, status, resolvedBracketType, ...rest } = req.body; // eslint-disable-line no-unused-vars
    Object.assign(d, rest);
    if ('name' in req.body && !req.body.name) d.name = '';
    await d.save();
    if ('mat' in req.body) await Match.updateMany({ division: d._id }, { $set: { mat: d.mat } });
    res.json(d);
  })
);

divisionRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await Division.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Division not found' });
    const regs = await Registration.countDocuments({ division: d._id, status: { $ne: 'cancelled' } });
    if (regs && req.query.force !== 'true') {
      throw new HttpError(409, `${regs} athlete(s) are registered here. Pass force=true to delete anyway.`);
    }
    await Promise.all([
      Registration.deleteMany({ division: d._id }),
      Match.deleteMany({ division: d._id }),
      d.deleteOne(),
    ]);
    res.json({ message: 'Division deleted', id: d._id });
  })
);

/* ------------------------------ brackets ------------------------------ */

divisionRouter.get('/:id/bracket', asyncHandler(async (req, res) => res.json(await divisionBracket(req.params.id))));

divisionRouter.post(
  '/:id/bracket',
  asyncHandler(async (req, res) => {
    res.json(await generateBracket(req.params.id, { force: req.body?.force === true || req.query.force === 'true' }));
  })
);

divisionRouter.delete('/:id/bracket', asyncHandler(async (req, res) => res.json(await clearBracket(req.params.id))));

/** Draw every division that has 2+ entrants and no bracket yet. */
tournamentRouter.post(
  '/:id/brackets',
  asyncHandler(async (req, res) => {
    const divisions = await Division.find({ tournament: req.params.id, status: 'open' });
    const drawn = [];
    const skipped = [];
    for (const d of divisions) {
      try {
        await generateBracket(d._id);
        drawn.push(d.name);
      } catch (err) {
        skipped.push({ name: d.name, reason: err.message });
      }
    }
    res.json({ drawn, skipped });
  })
);

/* ------------------------------ schedule / results ------------------------------ */

tournamentRouter.get(
  '/:id/schedule',
  asyncHandler(async (req, res) => res.json(await matSchedule(req.params.id, req.query.mat)))
);
tournamentRouter.post('/:id/schedule', asyncHandler(async (req, res) => res.json(await scheduleTournament(req.params.id))));
tournamentRouter.get('/:id/results', asyncHandler(async (req, res) => res.json(await tournamentResults(req.params.id))));

/* ------------------------------ registrations ------------------------------ */

tournamentRouter.get(
  '/:id/registrations',
  asyncHandler(async (req, res) => {
    const filter = { tournament: req.params.id };
    if (req.query.division) filter.division = req.query.division;
    if (req.query.status) filter.status = req.query.status;
    const regs = await Registration.find(filter)
      .populate({ path: 'athlete', select: 'firstName lastName gender belt country birthYear weightKg' })
      .populate('academy', 'name')
      .populate('division', 'name')
      .sort({ createdAt: 1 })
      .lean();
    res.json(regs.map((r) => ({ ...r, athlete: r.athlete ? { ...r.athlete, name: `${r.athlete.firstName} ${r.athlete.lastName}` } : null })));
  })
);

/**
 * Register an athlete.
 * Body: { division, athlete }                      existing profile
 *    or { division, newAthlete: {firstName, lastName, gender, belt, birthYear,
 *         country, weightKg, academy | academyName} }
 *    plus optional { override: true } so the organiser can add late entries.
 */
tournamentRouter.post(
  '/:id/registrations',
  asyncHandler(async (req, res) => {
    const t = await Tournament.findById(req.params.id);
    if (!t) throw new HttpError(404, 'Tournament not found');
    const { division: divisionId, athlete: athleteId, newAthlete, override } = req.body;

    if (!t.registrationOpen && !override) throw new HttpError(403, 'Registration is closed for this event');

    const division = await Division.findOne({ _id: divisionId, tournament: t._id });
    if (!division) throw new HttpError(400, 'Pick a division from this event');
    if (division.status !== 'open' && !override) {
      throw new HttpError(409, 'The bracket for this division has already been drawn');
    }

    const fits = (a) => {
      if (division.gender !== 'open' && a.gender !== division.gender) {
        throw new HttpError(400, `This division is for ${division.gender} athletes`);
      }
      if (division.belt !== 'all' && (a.belt || 'white') !== division.belt && !override) {
        throw new HttpError(400, `This division is for ${division.belt} belts`);
      }
    };

    let athlete;
    if (athleteId) {
      athlete = await Athlete.findById(athleteId);
      if (!athlete) throw new HttpError(400, 'Athlete not found');
      fits(athlete);
    } else if (newAthlete) {
      const data = { ...newAthlete };
      fits(data); // check before creating anything, so a rejected entry leaves no orphan profile
      await new Athlete({ ...data, academy: undefined }).validate();
      if (!data.academy && data.academyName) {
        const name = String(data.academyName).trim();
        data.academy = (
          (await Academy.findOne({ name: new RegExp(`^${escape(name)}$`, 'i') })) ||
          (await Academy.create({ name, country: data.country || '' }))
        )._id;
      }
      delete data.academyName;
      if (!data.academy) delete data.academy;
      athlete = await Athlete.create(data);
    } else {
      throw new HttpError(400, 'Provide an athlete id or newAthlete details');
    }

    const reg = await Registration.create({
      tournament: t._id,
      division: division._id,
      athlete: athlete._id,
      academy: athlete.academy || undefined,
      status: t.requireApproval && !override ? 'pending' : 'approved',
      paid: t.fee?.amount ? false : true,
    });
    res.status(201).json(await reg.populate([{ path: 'athlete' }, { path: 'division', select: 'name' }]));
  })
);

registrationRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const reg = await Registration.findById(req.params.id);
    if (!reg) throw new HttpError(404, 'Registration not found');

    const allowed = ['status', 'paid', 'checkedIn', 'weighedIn', 'weighInKg', 'seed', 'notes', 'division'];
    for (const k of allowed) if (k in req.body) reg[k] = req.body[k];

    if ('division' in req.body) {
      const div = await Division.findOne({ _id: req.body.division, tournament: reg.tournament });
      if (!div) throw new HttpError(400, 'Division is not part of this event');
    }

    // A weigh-in over the division limit is recorded but flagged.
    let warning = null;
    if (reg.weighInKg) {
      const div = await Division.findById(reg.division);
      if (div?.maxWeightKg && reg.weighInKg > div.maxWeightKg) {
        warning = `Weigh-in ${reg.weighInKg} kg is over the ${div.maxWeightKg} kg limit`;
      }
    }
    await reg.save();
    res.json({ ...(await reg.populate([{ path: 'athlete' }, { path: 'division', select: 'name' }])).toJSON(), warning });
  })
);

registrationRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const reg = await Registration.findByIdAndDelete(req.params.id);
    if (!reg) throw new HttpError(404, 'Registration not found');
    res.json({ message: 'Registration removed', id: reg._id });
  })
);
