/**
 * Tournament service — the database side of the bracket engine.
 * Shared by the REST routes and the mat-scoreboard socket handlers.
 */
import Tournament from '../models/Tournament.js';
import Division from '../models/Division.js';
import Registration from '../models/Registration.js';
import Match from '../models/Match.js';
import Athlete from '../models/Athlete.js';
import Academy from '../models/Academy.js';
import {
  buildBracket,
  decideWinner,
  placements,
  assignDivisionsToMats,
  PLACE_POINTS,
} from './brackets.js';

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ATHLETE_FIELDS = 'firstName lastName gender belt country academy photoUrl';

/* ------------------------------------------------------------------ */
/* Brackets                                                            */
/* ------------------------------------------------------------------ */

/** Entries that go into a bracket: approved and not cancelled. */
async function bracketEntries(divisionId) {
  return Registration.find({ division: divisionId, status: 'approved' }).lean();
}

export async function generateBracket(divisionId, { force = false, random } = {}) {
  const division = await Division.findById(divisionId);
  if (!division) throw new HttpError(404, 'Division not found');
  const tournament = await Tournament.findById(division.tournament);

  const existing = await Match.find({ division: divisionId });
  const played = existing.some((m) => m.status === 'completed' && !m.isBye) || existing.some((m) => m.status === 'live');
  if (played && !force) {
    throw new HttpError(409, 'Matches in this division have already been played. Pass force=true to redraw.');
  }

  const entries = await bracketEntries(divisionId);
  if (entries.length < 2) throw new HttpError(400, 'At least 2 approved athletes are needed to draw a bracket');

  const plan = buildBracket(
    entries.map((r) => ({ id: String(r.athlete), academy: r.academy ? String(r.academy) : '', seed: r.seed })),
    division.bracketType,
    { random }
  );

  await Match.deleteMany({ division: divisionId });
  const duration = division.matchDurationSec || tournament?.matchDurationSec || 300;
  await Match.insertMany(
    plan.matches.map((m) => ({
      tournament: division.tournament,
      division: division._id,
      key: m.key,
      round: m.round,
      position: m.position,
      roundName: m.roundName,
      a: m.a,
      b: m.b,
      winner: m.winner,
      nextKey: m.next?.key || null,
      nextSlot: m.next?.slot || null,
      isBye: m.isBye,
      status: m.status,
      method: m.method,
      durationSec: duration,
      mat: division.mat || 0,
    }))
  );

  division.resolvedBracketType = plan.type;
  division.status = 'bracketed';
  await division.save();

  return divisionBracket(divisionId);
}

export async function clearBracket(divisionId) {
  const division = await Division.findById(divisionId);
  if (!division) throw new HttpError(404, 'Division not found');
  await Match.deleteMany({ division: divisionId });
  division.status = 'open';
  division.resolvedBracketType = null;
  await division.save();
  return { ok: true };
}

export async function divisionBracket(divisionId) {
  const division = await Division.findById(divisionId).lean();
  if (!division) throw new HttpError(404, 'Division not found');

  const [matches, regs] = await Promise.all([
    Match.find({ division: divisionId })
      .sort({ round: 1, position: 1 })
      .populate({ path: 'a b winner', select: ATHLETE_FIELDS, populate: { path: 'academy', select: 'name' } })
      .lean({ virtuals: true }),
    Registration.find({ division: divisionId, status: { $ne: 'cancelled' } })
      .populate({ path: 'athlete', select: ATHLETE_FIELDS })
      .populate('academy', 'name')
      .lean(),
  ]);

  const plain = matches.map((m) => ({
    ...m,
    a: m.a?._id ?? null,
    b: m.b?._id ?? null,
    winner: m.winner?._id ?? null,
  }));
  const podium = placements(
    division.resolvedBracketType || 'single_elim',
    plain,
    regs.filter((r) => r.status === 'approved').map((r) => String(r.athlete?._id))
  );

  const athleteById = new Map();
  for (const m of matches) for (const s of [m.a, m.b]) if (s) athleteById.set(String(s._id), s);
  for (const r of regs) if (r.athlete) athleteById.set(String(r.athlete._id), { ...r.athlete, academy: r.academy });

  return {
    division,
    matches: matches.map(withNames),
    registrations: regs,
    podium: podium.map((p) => ({ ...p, athlete: athleteById.get(p.athlete) || { _id: p.athlete } })),
  };
}

function withNames(m) {
  const nm = (x) => (x ? { ...x, name: `${x.firstName} ${x.lastName}` } : null);
  return { ...m, a: nm(m.a), b: nm(m.b), winner: nm(m.winner) };
}

/* ------------------------------------------------------------------ */
/* Match results                                                        */
/* ------------------------------------------------------------------ */

function sideOf(match, who) {
  if (who === 'a' || who === 'b') return who;
  if (who && String(match.a) === String(who)) return 'a';
  if (who && String(match.b) === String(who)) return 'b';
  return null;
}

/**
 * Finish a match and push the winner into the next match.
 * `winner` is 'a' | 'b' | athleteId. With method 'points' (or no winner) the
 * scoreboard decides; a scoreboard tie needs an explicit referee decision.
 */
export async function finishMatch(matchId, { winner, method, submissionType = '' } = {}) {
  const match = await Match.findById(matchId);
  if (!match) throw new HttpError(404, 'Match not found');
  if (match.status === 'completed') throw new HttpError(409, 'Match is already finished');
  if (!match.a || !match.b) throw new HttpError(400, 'Both athletes must be known before the match can finish');

  let side = sideOf(match, winner);
  let how = method;
  if (!side || !how || how === 'points') {
    const auto = decideWinner(match.score);
    if (!side) side = auto.leader;
    if (!how || how === 'points') how = side === auto.leader ? auto.method : 'decision';
  }
  if (!side) throw new HttpError(400, 'Scores are level — choose the referee decision winner');

  // Freeze the clock.
  if (match.clock.running) {
    match.clock.elapsedMs += Date.now() - new Date(match.clock.startedAt).getTime();
    match.clock.running = false;
    match.clock.startedAt = null;
  }

  match.winner = match[side];
  match.method = how;
  match.submissionType = how === 'submission' ? submissionType : '';
  match.status = 'completed';
  match.endedAt = new Date();
  await match.save();

  await advanceWinner(match);
  await refreshDivisionStatus(match.division);
  return match;
}

async function advanceWinner(match) {
  if (!match.nextKey) return;
  const next = await Match.findOne({ division: match.division, key: match.nextKey });
  if (!next) return;
  next[match.nextSlot] = match.winner;
  if (next.a && next.b && next.status === 'pending') next.status = 'ready';
  await next.save();
}

/** Undo a result, as long as the winner has not fought again. */
export async function reopenMatch(matchId) {
  const match = await Match.findById(matchId);
  if (!match) throw new HttpError(404, 'Match not found');
  if (match.isBye) throw new HttpError(400, 'A bye cannot be reopened');

  if (match.nextKey) {
    const next = await Match.findOne({ division: match.division, key: match.nextKey });
    if (next && ['live', 'completed'].includes(next.status)) {
      throw new HttpError(409, 'The next match has already started — reopen that one first');
    }
    if (next) {
      next[match.nextSlot] = null;
      next.status = 'pending';
      await next.save();
    }
  }
  match.winner = null;
  match.method = null;
  match.submissionType = '';
  match.status = 'ready';
  match.endedAt = undefined;
  await match.save();
  await refreshDivisionStatus(match.division);
  return match;
}

async function refreshDivisionStatus(divisionId) {
  const matches = await Match.find({ division: divisionId }, 'status').lean();
  const division = await Division.findById(divisionId);
  if (!division || matches.length === 0) return;
  if (matches.every((m) => m.status === 'completed')) division.status = 'completed';
  else if (matches.some((m) => m.status === 'live' || (m.status === 'completed' && m.method !== 'bye')))
    division.status = 'live';
  else division.status = 'bracketed';
  await division.save();
}

/* ------------------------------------------------------------------ */
/* Live scoreboard                                                      */
/* ------------------------------------------------------------------ */

export function clockState(match) {
  const c = match.clock || {};
  const elapsedMs =
    (c.elapsedMs || 0) + (c.running && c.startedAt ? Date.now() - new Date(c.startedAt).getTime() : 0);
  const durationMs = (match.durationSec || 300) * 1000;
  return {
    running: Boolean(c.running),
    elapsedMs,
    remainingMs: Math.max(0, durationMs - elapsedMs),
    durationSec: match.durationSec,
    serverNow: Date.now(),
  };
}

export async function controlClock(matchId, action, value) {
  const match = await Match.findById(matchId);
  if (!match) throw new HttpError(404, 'Match not found');
  if (match.status === 'completed') throw new HttpError(409, 'Match is finished');
  if (!match.a || !match.b) throw new HttpError(400, 'Waiting for both athletes');

  const c = match.clock;
  if (action === 'start' && !c.running) {
    c.running = true;
    c.startedAt = new Date();
    if (match.status !== 'live') {
      match.status = 'live';
      match.startedAt = match.startedAt || new Date();
    }
  } else if (action === 'pause' && c.running) {
    c.elapsedMs += Date.now() - new Date(c.startedAt).getTime();
    c.running = false;
    c.startedAt = null;
  } else if (action === 'reset') {
    c.running = false;
    c.startedAt = null;
    c.elapsedMs = 0;
  } else if (action === 'set') {
    // value = remaining seconds
    const remaining = Math.max(0, Math.min(match.durationSec, Number(value) || 0));
    c.elapsedMs = (match.durationSec - remaining) * 1000;
    if (c.running) c.startedAt = new Date();
  }
  await match.save();
  if (match.status === 'live') await refreshDivisionStatus(match.division);
  return match;
}

export const SCORE_FIELDS = ['points', 'advantages', 'penalties'];

export async function adjustScore(matchId, side, field, delta) {
  if (!['a', 'b'].includes(side)) throw new HttpError(400, 'side must be a or b');
  if (!SCORE_FIELDS.includes(field)) throw new HttpError(400, `field must be one of ${SCORE_FIELDS.join(', ')}`);
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 4) throw new HttpError(400, 'delta must be between -4 and 4');

  const match = await Match.findById(matchId);
  if (!match) throw new HttpError(404, 'Match not found');
  if (match.status === 'completed') throw new HttpError(409, 'Match is finished');
  if (!match.a || !match.b) throw new HttpError(400, 'Waiting for both athletes');

  const current = match.score[side][field] || 0;
  match.score[side][field] = Math.max(0, current + d);
  if (match.status !== 'live') {
    match.status = 'live';
    match.startedAt = match.startedAt || new Date();
  }
  match.markModified('score');
  await match.save();
  return match;
}

export async function matchView(matchId) {
  const match = await Match.findById(matchId)
    .populate({ path: 'a b winner', select: ATHLETE_FIELDS, populate: { path: 'academy', select: 'name' } })
    .populate('division', 'name resolvedBracketType')
    .populate('tournament', 'name sport mats')
    .lean({ virtuals: true });
  if (!match) throw new HttpError(404, 'Match not found');
  return { ...withNames(match), clock: clockState(match), leader: decideWinner(match.score) };
}

/* ------------------------------------------------------------------ */
/* Mats and schedule                                                    */
/* ------------------------------------------------------------------ */

export async function scheduleTournament(tournamentId) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new HttpError(404, 'Tournament not found');

  const divisions = await Division.find({ tournament: tournamentId, status: { $ne: 'open' } });
  const counts = await Match.aggregate([
    { $match: { tournament: tournament._id, isBye: false } },
    { $group: { _id: '$division', n: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.n]));

  // Keep manual mat choices; auto-assign the rest.
  const auto = divisions.filter((d) => !d.mat || d.mat > tournament.mats);
  const plan = assignDivisionsToMats(
    auto.map((d) => ({ division: d._id, matchCount: countBy.get(String(d._id)) || 0 })),
    tournament.mats
  );
  for (const d of auto) {
    d.mat = plan.get(String(d._id)) || 1;
    await d.save();
  }

  const divOrder = new Map(divisions.map((d, i) => [String(d._id), i]));
  for (let mat = 1; mat <= tournament.mats; mat += 1) {
    const ids = divisions.filter((d) => d.mat === mat).map((d) => d._id);
    const matches = await Match.find({ division: { $in: ids } });
    matches.sort(
      (x, y) =>
        x.round - y.round ||
        divOrder.get(String(x.division)) - divOrder.get(String(y.division)) ||
        x.position - y.position
    );
    let order = 0;
    for (const m of matches) {
      m.mat = mat;
      m.order = m.isBye ? 0 : (order += 1);
      await m.save();
    }
  }
  return matSchedule(tournamentId);
}

export async function matSchedule(tournamentId, matFilter) {
  const tournament = await Tournament.findById(tournamentId).lean();
  if (!tournament) throw new HttpError(404, 'Tournament not found');
  const q = { tournament: tournamentId, isBye: false, mat: { $gt: 0 } };
  if (matFilter) q.mat = Number(matFilter);
  const matches = await Match.find(q)
    .sort({ mat: 1, order: 1 })
    .populate({ path: 'a b winner', select: ATHLETE_FIELDS, populate: { path: 'academy', select: 'name' } })
    .populate('division', 'name')
    .lean({ virtuals: true });

  const mats = Array.from({ length: tournament.mats }, (_, i) => ({ mat: i + 1, matches: [] }));
  for (const m of matches) mats[m.mat - 1]?.matches.push(withNames(m));
  for (const mat of mats) {
    mat.current = mat.matches.find((m) => m.status === 'live') || null;
    mat.upNext = mat.matches.filter((m) => m.status === 'ready').slice(0, 3);
  }
  return { tournament, mats };
}

/* ------------------------------------------------------------------ */
/* Results, medals, rankings                                            */
/* ------------------------------------------------------------------ */

async function podiumsFor(divisionFilter) {
  const divisions = await Division.find(divisionFilter).lean();
  const out = [];
  for (const d of divisions) {
    if (d.status === 'open') continue;
    const matches = await Match.find({ division: d._id }).lean();
    const ids = (await Registration.find({ division: d._id, status: 'approved' }, 'athlete').lean()).map((r) =>
      String(r.athlete)
    );
    out.push({ division: d, podium: placements(d.resolvedBracketType || 'single_elim', matches, ids) });
  }
  return out;
}

export async function tournamentResults(tournamentId) {
  const podiums = await podiumsFor({ tournament: tournamentId });
  const athleteIds = [...new Set(podiums.flatMap((p) => p.podium.map((x) => x.athlete)))];
  const regs = await Registration.find({ tournament: tournamentId, athlete: { $in: athleteIds } })
    .populate('athlete', ATHLETE_FIELDS)
    .populate('academy', 'name')
    .lean();
  const info = new Map();
  for (const r of regs) if (r.athlete) info.set(String(r.athlete._id), { ...r.athlete, name: `${r.athlete.firstName} ${r.athlete.lastName}`, academy: r.academy });

  const academyTable = new Map();
  const divisions = podiums.map(({ division, podium }) => ({
    division,
    podium: podium.map((p) => {
      const a = info.get(p.athlete) || { _id: p.athlete, name: 'Unknown' };
      const key = a.academy?._id ? String(a.academy._id) : 'none';
      if (!academyTable.has(key))
        academyTable.set(key, { academy: a.academy || { name: 'No academy' }, gold: 0, silver: 0, bronze: 0, points: 0 });
      const row = academyTable.get(key);
      if (p.place === 1) row.gold += 1;
      if (p.place === 2) row.silver += 1;
      if (p.place === 3) row.bronze += 1;
      row.points += PLACE_POINTS[p.place] || 0;
      return { place: p.place, athlete: a };
    }),
  }));

  const academies = [...academyTable.values()].sort(
    (x, y) => y.points - x.points || y.gold - x.gold || y.silver - x.silver || y.bronze - x.bronze
  );
  return { divisions, academies };
}

/**
 * Athlete ranking across every finished division, optionally filtered.
 * Points per podium: gold 9, silver 3, bronze 1.
 */
export async function athleteRankings({ sport, gender, belt, limit = 100 } = {}) {
  const divFilter = {};
  if (sport) {
    const ids = (await Tournament.find({ sport }, '_id').lean()).map((t) => t._id);
    divFilter.tournament = { $in: ids };
  }
  if (gender) divFilter.gender = gender;
  if (belt) divFilter.belt = belt;

  const podiums = await podiumsFor(divFilter);
  const table = new Map();
  for (const { podium } of podiums) {
    for (const p of podium) {
      if (!table.has(p.athlete)) table.set(p.athlete, { athlete: p.athlete, points: 0, gold: 0, silver: 0, bronze: 0 });
      const row = table.get(p.athlete);
      row.points += PLACE_POINTS[p.place] || 0;
      if (p.place === 1) row.gold += 1;
      if (p.place === 2) row.silver += 1;
      if (p.place === 3) row.bronze += 1;
    }
  }
  const rows = [...table.values()]
    .sort((x, y) => y.points - x.points || y.gold - x.gold || y.silver - x.silver)
    .slice(0, Number(limit) || 100);
  const athletes = await Athlete.find({ _id: { $in: rows.map((r) => r.athlete) } })
    .populate('academy', 'name')
    .lean({ virtuals: true });
  const byId = new Map(athletes.map((a) => [String(a._id), { ...a, name: `${a.firstName} ${a.lastName}` }]));
  return rows.map((r, i) => ({ rank: i + 1, ...r, athlete: byId.get(r.athlete) || { _id: r.athlete } }));
}

export async function academyRankings({ sport } = {}) {
  const athleteRows = await athleteRankings({ sport, limit: 100000 });
  const table = new Map();
  for (const r of athleteRows) {
    const ac = r.athlete.academy;
    const key = ac?._id ? String(ac._id) : null;
    if (!key) continue;
    if (!table.has(key)) table.set(key, { academy: ac, points: 0, gold: 0, silver: 0, bronze: 0, athletes: 0 });
    const row = table.get(key);
    row.points += r.points;
    row.gold += r.gold;
    row.silver += r.silver;
    row.bronze += r.bronze;
    row.athletes += 1;
  }
  return [...table.values()]
    .sort((x, y) => y.points - x.points || y.gold - x.gold)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

/** Match history and medals for one athlete profile. */
export async function athleteProfile(athleteId) {
  const athlete = await Athlete.findById(athleteId).populate('academy').lean({ virtuals: true });
  if (!athlete) throw new HttpError(404, 'Athlete not found');

  const [registrations, matches] = await Promise.all([
    Registration.find({ athlete: athleteId, status: { $ne: 'cancelled' } })
      .populate('tournament', 'name startDate city sport status')
      .populate('division', 'name status')
      .sort({ createdAt: -1 })
      .lean(),
    Match.find({ $or: [{ a: athleteId }, { b: athleteId }], status: 'completed', isBye: false })
      .populate({ path: 'a b', select: 'firstName lastName' })
      .populate('division', 'name')
      .populate('tournament', 'name startDate')
      .sort({ endedAt: -1 })
      .lean(),
  ]);

  const podiums = await podiumsFor({ _id: { $in: registrations.map((r) => r.division?._id).filter(Boolean) } });
  const medals = [];
  for (const { division, podium } of podiums) {
    const mine = podium.find((p) => p.athlete === String(athleteId));
    if (mine) {
      const reg = registrations.find((r) => String(r.division?._id) === String(division._id));
      medals.push({ place: mine.place, division: { _id: division._id, name: division.name }, tournament: reg?.tournament });
    }
  }

  const history = matches.map((m) => {
    const side = String(m.a?._id) === String(athleteId) ? 'a' : 'b';
    const opp = side === 'a' ? m.b : m.a;
    return {
      _id: m._id,
      tournament: m.tournament,
      division: m.division,
      roundName: m.roundName,
      opponent: opp ? { _id: opp._id, name: `${opp.firstName} ${opp.lastName}` } : null,
      won: String(m.winner) === String(athleteId),
      method: m.method,
      submissionType: m.submissionType,
      score: `${m.score?.[side]?.points ?? 0}–${m.score?.[side === 'a' ? 'b' : 'a']?.points ?? 0}`,
    };
  });

  const wins = history.filter((h) => h.won).length;
  return {
    athlete: { ...athlete, name: `${athlete.firstName} ${athlete.lastName}` },
    record: {
      wins,
      losses: history.length - wins,
      submissions: history.filter((h) => h.won && h.method === 'submission').length,
    },
    medals: medals.sort((x, y) => x.place - y.place),
    registrations,
    history,
  };
}

export async function academyProfile(academyId) {
  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw new HttpError(404, 'Academy not found');
  const athletes = await Athlete.find({ academy: academyId }).sort({ lastName: 1 }).lean({ virtuals: true });
  const rankings = await academyRankings();
  const mine = rankings.find((r) => String(r.academy?._id) === String(academyId));
  return {
    academy,
    athletes: athletes.map((a) => ({ ...a, name: `${a.firstName} ${a.lastName}` })),
    medals: mine ? { gold: mine.gold, silver: mine.silver, bronze: mine.bronze, points: mine.points, rank: mine.rank } : { gold: 0, silver: 0, bronze: 0, points: 0, rank: null },
  };
}
