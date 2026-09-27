/** Shapes the ScoreHUB API returns. Mirrors prisma/schema.prisma. */

export type Role = 'ADMIN' | 'PROMOTER' | 'JUDGE' | 'REFEREE';
export type Discipline = 'MMA' | 'BJJ' | 'K1';
export type BoutType = 'PROFESSIONAL' | 'AMATEUR';
export type BoutStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
export type Corner = 'BLUE' | 'RED';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  active?: boolean;
}

export interface League {
  id: string;
  name: string;
  startsAt: string;
  location: string;
  promoterName: string;
  logoUrl: string | null;
  amateurMmaBouts: number;
  proMmaBouts: number;
  amateurBjjBouts: number;
  proBjjBouts: number;
  amateurK1Bouts: number;
  proK1Bouts: number;
  createdById: string | null;
  _count?: { bouts: number; fighters: number };
  fighters?: Fighter[];
  bouts?: Bout[];
}

export interface Fighter {
  id: string;
  leagueId: string;
  name: string;
  photoUrl: string | null;
  contactNo: string | null;
  coachName: string | null;
  team: string | null;
  weightClass: string | null;
  record: string | null;
}

export interface BoutJudgeSeat {
  id: string;
  boutId: string;
  judgeId: string;
  seat: number;
  judge?: { id: string; name: string };
}

export interface RoundScoreRow {
  id: string;
  boutId: string;
  judgeId: string;
  roundNumber: number;
  tally: unknown;
  blueScore: number;
  redScore: number;
  submitted: boolean;
  submittedAt: string | null;
}

export interface Bout {
  id: string;
  leagueId: string;
  boutNumber: number;
  boutName: string | null;
  discipline: Discipline;
  boutType: BoutType;
  boutDate: string;
  ringNo: string | null;
  totalRounds: number;
  roundDuration: number;
  currentRound: number;
  status: BoutStatus;
  blueFighterId: string | null;
  redFighterId: string | null;
  refereeId: string | null;
  resultType: string | null;
  winnerId: string | null;
  endRound: number | null;
  endTimeSec: number | null;
  resultNote: string | null;
  startedAt: string | null;
  completedAt: string | null;
  league?: League;
  blueFighter?: Fighter | null;
  redFighter?: Fighter | null;
  referee?: { id: string; name: string } | null;
  judges?: BoutJudgeSeat[];
  roundScores?: RoundScoreRow[];
}

/** Request payloads, matching src/lib/validation.ts on the server. */

export interface LeagueInput {
  name: string;
  startsAt: string;
  location: string;
  promoterName: string;
  logoUrl?: string | null;
  amateurMmaBouts: number;
  proMmaBouts: number;
  amateurBjjBouts: number;
  proBjjBouts: number;
  amateurK1Bouts: number;
  proK1Bouts: number;
}

export interface FighterInput {
  name: string;
  photoUrl?: string | null;
  contactNo?: string | null;
  coachName?: string | null;
  team?: string | null;
  weightClass?: string | null;
  record?: string | null;
}

export interface BoutInput {
  boutNumber: number;
  boutName?: string | null;
  discipline: Discipline;
  boutType: BoutType;
  boutDate: string;
  ringNo?: string | null;
  totalRounds: number;
  roundDuration: number;
  blueFighterId?: string | null;
  redFighterId?: string | null;
  refereeId?: string | null;
  judgeIds: string[];
}

export interface UserInput {
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
}
