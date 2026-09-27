import type { JudgeCard } from './scoring';

/**
 * Structural shapes rather than Prisma's generated types, so this helper works
 * against any query that includes the judge seats and their submitted rounds —
 * and so the three callers (round submit, early finish, scoreboard) build
 * scorecards exactly the same way.
 */
export type SeatRow = {
  judgeId: string;
  seat: number;
  judge: { name: string };
};

export type RoundRow = {
  judgeId: string;
  roundNumber: number;
  blueScore: number;
  redScore: number;
};

export function buildJudgeCards(seats: SeatRow[], rounds: RoundRow[]): JudgeCard[] {
  return seats.map((seat) => ({
    judgeId: seat.judgeId,
    judgeName: seat.judge.name,
    seat: seat.seat,
    rounds: rounds
      .filter((r) => r.judgeId === seat.judgeId)
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map((r) => ({
        roundNumber: r.roundNumber,
        blue: r.blueScore,
        red: r.redScore,
      })),
  }));
}

/** Is this user seated as a judge on the bout? */
export function seatOf(
  seats: { judgeId: string; seat: number }[],
  userId: string,
): number | null {
  return seats.find((s) => s.judgeId === userId)?.seat ?? null;
}
