/**
 * In-browser stand-in for the ScoreHUB backend.
 *
 * Active when config.js names no `apiUrl`, or sets `demo: true`. Every call the
 * real client makes is answered from memory, so the whole product can be shown
 * without a server, a database or a network. Nothing is saved: a refresh
 * restores the seed.
 *
 * It implements the same shapes as the real API so the UI code is identical in
 * both modes — there is no "if demo" branching in any screen.
 */

import { decideBout } from './scoring';
import { buildJudgeCards } from './cards';
import type {
  Bout,
  BoutInput,
  Fighter,
  FighterInput,
  League,
  LeagueInput,
  SessionUser,
  User,
  UserInput,
} from './types';

/** A touch of latency so loading states are visible rather than flashing. */
const LATENCY = 180;
const wait = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));

let seq = 1000;
const id = (prefix: string) => `${prefix}${(seq += 1)}`;

function daysFromNow(days: number, hour = 19, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const users: User[] = [
  { id: 'u1', name: 'Sushil Chandanshive', email: 'sushil@scorehub.in', role: 'ADMIN', phone: '9876543210', active: true },
  { id: 'u2', name: 'Ashutosh Malgaonkar', email: 'ashutosh@scorehub.in', role: 'PROMOTER', phone: '9876543211', active: true },
  { id: 'u3', name: 'Poonam Deshmukh', email: 'poonam@scorehub.in', role: 'JUDGE', phone: '9876543212', active: true },
  { id: 'u4', name: 'Ayush Kulkarni', email: 'ayush@scorehub.in', role: 'JUDGE', phone: '9876543213', active: true },
  { id: 'u5', name: 'Sandeep Rawat', email: 'sandeep@scorehub.in', role: 'JUDGE', phone: '9876543214', active: true },
  { id: 'u6', name: 'Deepak Salvi', email: 'deepak@scorehub.in', role: 'REFEREE', phone: '9876543215', active: true },
];

const leagues: League[] = [
  {
    id: 'l1', name: 'WDS 8', startsAt: daysFromNow(6, 19, 0), location: 'Nerul, Navi Mumbai',
    promoterName: 'WDS Promotions', logoUrl: null,
    amateurMmaBouts: 3, proMmaBouts: 3, amateurBjjBouts: 2, proBjjBouts: 1,
    amateurK1Bouts: 0, proK1Bouts: 0, createdById: 'u1',
    _count: { bouts: 3, fighters: 6 },
  },
  {
    id: 'l2', name: 'Apex Fight Series 41', startsAt: daysFromNow(20, 21, 0), location: 'Noida',
    promoterName: 'Apex Combat', logoUrl: null,
    amateurMmaBouts: 4, proMmaBouts: 2, amateurBjjBouts: 1, proBjjBouts: 0,
    amateurK1Bouts: 2, proK1Bouts: 0, createdById: 'u1',
    _count: { bouts: 0, fighters: 0 },
  },
  {
    id: 'l0', name: 'WDS 7', startsAt: daysFromNow(-45, 19, 0), location: 'Thane',
    promoterName: 'WDS Promotions', logoUrl: null,
    amateurMmaBouts: 5, proMmaBouts: 2, amateurBjjBouts: 0, proBjjBouts: 0,
    amateurK1Bouts: 1, proK1Bouts: 0, createdById: 'u1',
    _count: { bouts: 1, fighters: 2 },
  },
];

const fighters: Fighter[] = [
  { id: 'f1', leagueId: 'l1', name: 'Arjun Rane', photoUrl: null, contactNo: '9820011223', coachName: 'R. Mehta', team: 'Mumbai Fight Club', weightClass: 'Flyweight', record: '8-2-0' },
  { id: 'f2', leagueId: 'l1', name: 'Kabir Shaikh', photoUrl: null, contactNo: '9820011224', coachName: 'S. Pawar', team: 'Pune Combat Academy', weightClass: 'Flyweight', record: '11-3-0' },
  { id: 'f3', leagueId: 'l1', name: 'Rohit Tamang', photoUrl: null, contactNo: null, coachName: null, team: 'Darjeeling Warriors', weightClass: 'Bantamweight', record: '6-1-0' },
  { id: 'f4', leagueId: 'l1', name: 'Imran Qureshi', photoUrl: null, contactNo: null, coachName: 'A. Khan', team: 'Hyderabad Top Team', weightClass: 'Bantamweight', record: '9-4-1' },
  { id: 'f5', leagueId: 'l1', name: 'Neha Salunkhe', photoUrl: null, contactNo: null, coachName: null, team: 'Nerul MMA', weightClass: "Women's Strawweight", record: '5-0-0' },
  { id: 'f6', leagueId: 'l1', name: 'Priya Naik', photoUrl: null, contactNo: null, coachName: null, team: 'Goa Grapple House', weightClass: "Women's Strawweight", record: '4-2-0' },
  { id: 'f7', leagueId: 'l0', name: 'Tomas Rivera', photoUrl: null, contactNo: null, coachName: null, team: 'Entram Gym', weightClass: 'Lightweight', record: '8-2-0' },
  { id: 'f8', leagueId: 'l0', name: 'Yusuf Demir', photoUrl: null, contactNo: null, coachName: null, team: 'Istanbul MMA', weightClass: 'Lightweight', record: '10-3-0' },
];

type Seat = { id: string; boutId: string; judgeId: string; seat: number; judge: { id: string; name: string } };

const seats: Seat[] = [
  { id: 's1', boutId: 'b1', judgeId: 'u3', seat: 1, judge: { id: 'u3', name: 'Poonam Deshmukh' } },
  { id: 's2', boutId: 'b1', judgeId: 'u4', seat: 2, judge: { id: 'u4', name: 'Ayush Kulkarni' } },
  { id: 's3', boutId: 'b1', judgeId: 'u5', seat: 3, judge: { id: 'u5', name: 'Sandeep Rawat' } },
  { id: 's4', boutId: 'b2', judgeId: 'u3', seat: 1, judge: { id: 'u3', name: 'Poonam Deshmukh' } },
  { id: 's5', boutId: 'b2', judgeId: 'u4', seat: 2, judge: { id: 'u4', name: 'Ayush Kulkarni' } },
  { id: 's6', boutId: 'b2', judgeId: 'u5', seat: 3, judge: { id: 'u5', name: 'Sandeep Rawat' } },
  { id: 's7', boutId: 'b3', judgeId: 'u3', seat: 1, judge: { id: 'u3', name: 'Poonam Deshmukh' } },
  { id: 's8', boutId: 'b3', judgeId: 'u4', seat: 2, judge: { id: 'u4', name: 'Ayush Kulkarni' } },
  { id: 's9', boutId: 'b3', judgeId: 'u5', seat: 3, judge: { id: 'u5', name: 'Sandeep Rawat' } },
  { id: 's10', boutId: 'b0', judgeId: 'u3', seat: 1, judge: { id: 'u3', name: 'Poonam Deshmukh' } },
  { id: 's11', boutId: 'b0', judgeId: 'u4', seat: 2, judge: { id: 'u4', name: 'Ayush Kulkarni' } },
  { id: 's12', boutId: 'b0', judgeId: 'u5', seat: 3, judge: { id: 'u5', name: 'Sandeep Rawat' } },
];

type Round = {
  id: string; boutId: string; judgeId: string; roundNumber: number;
  tally: unknown; blueScore: number; redScore: number; submitted: boolean; submittedAt: string | null;
};

/** WDS 7 bout 1 is finished, so "Past leagues" has a real result to show. */
const rounds: Round[] = [
  ...[1, 2, 3].flatMap((r) =>
    (['u3', 'u4', 'u5'] as const).map((j, i) => ({
      id: `r-b0-${r}-${j}`, boutId: 'b0', judgeId: j, roundNumber: r,
      tally: {},
      blueScore: r === 2 && i === 2 ? 9 : 10,
      redScore: r === 2 && i === 2 ? 10 : 9,
      submitted: true, submittedAt: daysFromNow(-45),
    })),
  ),
];

function bout(partial: Partial<Bout> & Pick<Bout, 'id' | 'leagueId' | 'boutNumber'>): Bout {
  return {
    boutName: null, discipline: 'MMA', boutType: 'PROFESSIONAL',
    boutDate: daysFromNow(6), ringNo: '1', totalRounds: 3, roundDuration: 300,
    currentRound: 0, status: 'SCHEDULED',
    blueFighterId: null, redFighterId: null, refereeId: 'u6',
    resultType: null, winnerId: null, endRound: null, endTimeSec: null,
    resultNote: null, startedAt: null, completedAt: null,
    ...partial,
  } as Bout;
}

const bouts: Bout[] = [
  bout({ id: 'b1', leagueId: 'l1', boutNumber: 1, boutName: 'Flyweight', blueFighterId: 'f1', redFighterId: 'f2', totalRounds: 3, roundDuration: 300 }),
  bout({ id: 'b2', leagueId: 'l1', boutNumber: 2, boutName: 'Bantamweight', boutType: 'AMATEUR', blueFighterId: 'f3', redFighterId: 'f4', totalRounds: 3, roundDuration: 180 }),
  bout({ id: 'b3', leagueId: 'l1', boutNumber: 3, boutName: "Women's Strawweight", boutType: 'AMATEUR', discipline: 'BJJ', blueFighterId: 'f5', redFighterId: 'f6', totalRounds: 3, roundDuration: 300, ringNo: '2' }),
  bout({
    id: 'b0', leagueId: 'l0', boutNumber: 1, boutName: 'Lightweight',
    blueFighterId: 'f7', redFighterId: 'f8', totalRounds: 3, roundDuration: 300,
    currentRound: 3, status: 'COMPLETED', resultType: 'DECISION_SPLIT', winnerId: 'f7',
    resultNote: 'Blue corner wins by split decision.',
    boutDate: daysFromNow(-45), startedAt: daysFromNow(-45), completedAt: daysFromNow(-45),
  }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class DemoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let session: SessionUser | null = null;

const fighterById = (fid: string | null) => fighters.find((f) => f.id === fid) ?? null;

function hydrate(b: Bout): Bout {
  return {
    ...b,
    blueFighter: fighterById(b.blueFighterId),
    redFighter: fighterById(b.redFighterId),
    referee: users.find((u) => u.id === b.refereeId)
      ? { id: b.refereeId as string, name: users.find((u) => u.id === b.refereeId)!.name }
      : null,
    judges: seats.filter((s) => s.boutId === b.id).sort((a, c) => a.seat - c.seat),
    roundScores: rounds.filter((r) => r.boutId === b.id),
    league: leagues.find((l) => l.id === b.leagueId),
  };
}

/**
 * The other two judges turn their cards in a moment after you do.
 *
 * In a real event three tablets are scoring at once; in a demo there is one
 * person clicking. Filling the other seats keeps the round-lock, the
 * scoreboard and the final decision behaving exactly as they would live.
 */
function fillOtherJudges(boutId: string, roundNumber: number, blueScore: number, redScore: number, exceptJudgeId: string) {
  const others = seats.filter((s) => s.boutId === boutId && s.judgeId !== exceptJudgeId);
  others.forEach((seat, index) => {
    if (rounds.some((r) => r.boutId === boutId && r.judgeId === seat.judgeId && r.roundNumber === roundNumber)) {
      return;
    }
    // One judge sees it the other way now and then — that is what makes a split.
    const flip = index === others.length - 1 && Math.random() < 0.34;
    rounds.push({
      id: id('r'),
      boutId,
      judgeId: seat.judgeId,
      roundNumber,
      tally: {},
      blueScore: flip ? redScore : blueScore,
      redScore: flip ? blueScore : redScore,
      submitted: true,
      submittedAt: new Date().toISOString(),
    });
  });
}

function decide(boutId: string) {
  const b = bouts.find((x) => x.id === boutId);
  if (!b) return null;
  const cards = buildJudgeCards(
    seats.filter((s) => s.boutId === boutId),
    rounds.filter((r) => r.boutId === boutId && r.submitted),
  );
  const outcome = decideBout(cards);
  b.status = 'COMPLETED';
  b.resultType = outcome.resultType;
  b.winnerId = outcome.winner === 'BLUE' ? b.blueFighterId : outcome.winner === 'RED' ? b.redFighterId : null;
  b.resultNote = outcome.summary;
  b.completedAt = new Date().toISOString();
  return outcome;
}

// ---------------------------------------------------------------------------
// The API surface
// ---------------------------------------------------------------------------

export const demoApi = {
  auth: {
    officials: () => wait(users.filter((u) => u.active !== false)),
    signIn: (userId: string) => {
      const user = users.find((u) => u.id === userId && u.active !== false);
      if (!user) throw new DemoError('That account is no longer available', 401);
      session = { id: user.id, name: user.name, email: user.email, role: user.role };
      return wait({ user: session });
    },
    signOut: () => {
      session = null;
      return wait({ signedOut: true });
    },
  },

  users: {
    list: (role?: string) => wait(role ? users.filter((u) => u.role === role) : [...users]),
    create: (input: UserInput) => {
      const user: User = { id: id('u'), active: true, ...input };
      users.push(user);
      return wait(user);
    },
    update: (uid: string, input: UserInput) => {
      const user = users.find((u) => u.id === uid);
      if (!user) throw new DemoError('Official not found', 404);
      Object.assign(user, input);
      return wait(user);
    },
    deactivate: (uid: string) => {
      const user = users.find((u) => u.id === uid);
      if (user) user.active = false;
      return wait({ deactivated: uid });
    },
  },

  leagues: {
    list: (filter?: 'upcoming' | 'past') => {
      const now = Date.now();
      const list = leagues.filter((l) =>
        filter === 'past' ? new Date(l.startsAt).getTime() < now
        : filter === 'upcoming' ? new Date(l.startsAt).getTime() >= now
        : true,
      );
      return wait([...list].sort((a, b) =>
        filter === 'past'
          ? new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
          : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ));
    },
    get: (lid: string) => {
      const league = leagues.find((l) => l.id === lid);
      if (!league) throw new DemoError('League not found', 404);
      return wait({
        ...league,
        fighters: fighters.filter((f) => f.leagueId === lid),
        bouts: bouts.filter((b) => b.leagueId === lid),
      });
    },
    create: (input: LeagueInput) => {
      const league: League = { id: id('l'), createdById: session?.id ?? 'u1', logoUrl: null, ...input };
      leagues.push(league);
      return wait(league);
    },
    update: (lid: string, input: LeagueInput) => {
      const league = leagues.find((l) => l.id === lid);
      if (!league) throw new DemoError('League not found', 404);
      Object.assign(league, input);
      return wait(league);
    },
    remove: (lid: string) => {
      const index = leagues.findIndex((l) => l.id === lid);
      if (index >= 0) leagues.splice(index, 1);
      return wait({ deleted: lid });
    },
  },

  fighters: {
    listByLeague: (lid: string) => wait(fighters.filter((f) => f.leagueId === lid)),
    get: (fid: string) => {
      const fighter = fighters.find((f) => f.id === fid);
      if (!fighter) throw new DemoError('Fighter not found', 404);
      return wait(fighter);
    },
    create: (lid: string, input: FighterInput) => {
      const fighter = { id: id('f'), leagueId: lid, ...input } as Fighter;
      fighters.push(fighter);
      return wait(fighter);
    },
    update: (fid: string, input: FighterInput) => {
      const fighter = fighters.find((f) => f.id === fid);
      if (!fighter) throw new DemoError('Fighter not found', 404);
      Object.assign(fighter, input);
      return wait(fighter);
    },
    remove: (fid: string) => {
      const index = fighters.findIndex((f) => f.id === fid);
      if (index >= 0) fighters.splice(index, 1);
      return wait({ deleted: fid });
    },
  },

  bouts: {
    listByLeague: (lid: string) =>
      wait(bouts.filter((b) => b.leagueId === lid).sort((a, b) => a.boutNumber - b.boutNumber).map(hydrate)),
    get: (bid: string) => {
      const b = bouts.find((x) => x.id === bid);
      if (!b) throw new DemoError('Bout not found', 404);
      return wait(hydrate(b));
    },
    create: (lid: string, input: BoutInput) => {
      const created = bout({ ...input, id: id('b'), leagueId: lid, boutNumber: input.boutNumber });
      bouts.push(created);
      input.judgeIds.filter(Boolean).forEach((judgeId, index) => {
        const judge = users.find((u) => u.id === judgeId);
        seats.push({ id: id('s'), boutId: created.id, judgeId, seat: index + 1, judge: { id: judgeId, name: judge?.name ?? 'Judge' } });
      });
      return wait(hydrate(created));
    },
    update: (bid: string, input: BoutInput) => {
      const b = bouts.find((x) => x.id === bid);
      if (!b) throw new DemoError('Bout not found', 404);
      Object.assign(b, input);
      // Seats are replaced wholesale, as the real API does.
      for (let i = seats.length - 1; i >= 0; i -= 1) if (seats[i].boutId === bid) seats.splice(i, 1);
      input.judgeIds.filter(Boolean).forEach((judgeId, index) => {
        const judge = users.find((u) => u.id === judgeId);
        seats.push({ id: id('s'), boutId: bid, judgeId, seat: index + 1, judge: { id: judgeId, name: judge?.name ?? 'Judge' } });
      });
      return wait(hydrate(b));
    },
    remove: (bid: string) => {
      const index = bouts.findIndex((b) => b.id === bid);
      if (index >= 0) bouts.splice(index, 1);
      return wait({ deleted: bid });
    },
    start: (bid: string) => {
      const b = bouts.find((x) => x.id === bid);
      if (!b) throw new DemoError('Bout not found', 404);
      b.status = 'LIVE';
      b.currentRound = b.currentRound || 1;
      b.startedAt = b.startedAt ?? new Date().toISOString();
      return wait(hydrate(b));
    },
    submitRound: (
      bid: string,
      input: { roundNumber: number; tally: unknown; blueScore: number; redScore: number },
    ) => {
      const b = bouts.find((x) => x.id === bid);
      if (!b) throw new DemoError('Bout not found', 404);
      if (b.status === 'COMPLETED') throw new DemoError('This bout is already complete', 409);

      const judgeId = session?.id ?? 'u3';
      const existing = rounds.find(
        (r) => r.boutId === bid && r.judgeId === judgeId && r.roundNumber === input.roundNumber,
      );
      if (existing?.submitted) throw new DemoError('You have already submitted this round', 409);

      rounds.push({
        id: id('r'), boutId: bid, judgeId, roundNumber: input.roundNumber,
        tally: input.tally, blueScore: input.blueScore, redScore: input.redScore,
        submitted: true, submittedAt: new Date().toISOString(),
      });
      fillOtherJudges(bid, input.roundNumber, input.blueScore, input.redScore, judgeId);

      b.status = 'LIVE';
      const isFinalRound = input.roundNumber >= b.totalRounds;
      if (!isFinalRound) b.currentRound = input.roundNumber + 1;

      const outcome = isFinalRound ? decide(bid) : null;
      return wait({ roundComplete: true, outcome: outcome ? { summary: outcome.summary } : null });
    },
    finish: (
      bid: string,
      input: { resultType: string; winnerCorner?: 'BLUE' | 'RED' | null; endRound?: number },
    ) => {
      const b = bouts.find((x) => x.id === bid);
      if (!b) throw new DemoError('Bout not found', 404);
      const winner = input.winnerCorner === 'BLUE' ? b.blueFighterId : input.winnerCorner === 'RED' ? b.redFighterId : null;
      const name = fighterById(winner)?.name;
      const summary = input.winnerCorner
        ? `${name ?? input.winnerCorner} wins by ${input.resultType.replace(/_/g, ' ').toLowerCase()} in round ${input.endRound ?? (b.currentRound || 1)}.`
        : `No contest in round ${input.endRound ?? (b.currentRound || 1)}.`;
      b.status = 'COMPLETED';
      b.resultType = input.resultType;
      b.winnerId = winner;
      b.endRound = input.endRound ?? b.currentRound ?? null;
      b.resultNote = summary;
      b.completedAt = new Date().toISOString();
      return wait({ summary });
    },
  },

  health: () => wait({ ok: true, service: 'demo' }),
};
