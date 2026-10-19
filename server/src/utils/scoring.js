import Bout from '../models/Bout.js';
import Scorecard, { CATEGORIES, TOKENS, tallyTokens } from '../models/Scorecard.js';

export { CATEGORIES, TOKENS };

/** Ensure every judge on the panel has a scorecard for this bout. */
export async function ensureScorecards(boutId) {
  const bout = await Bout.findById(boutId);
  if (!bout) throw Object.assign(new Error('Bout not found'), { statusCode: 404 });

  const existing = await Scorecard.find({ bout: bout._id });
  const have = new Set(existing.map((s) => s.judge.toString()));

  const missing = bout.judges
    .map((judgeId, index) => ({ judgeId, seat: index + 1 }))
    .filter(({ judgeId }) => !have.has(judgeId.toString()));

  if (missing.length) {
    await Scorecard.insertMany(
      missing.map(({ judgeId, seat }) => ({
        bout: bout._id,
        judge: judgeId,
        judgeSeat: seat,
        rounds: [],
      })),
      { ordered: false }
    ).catch(() => {}); // ignore races on the unique (bout, judge) index
  }

  return Scorecard.find({ bout: bout._id }).populate('judge', 'name');
}

/** Append a token ("1" | "0" | "+") to a judge's category log for a round. */
export async function recordToken({ boutId, judgeId, roundNo, corner, category, token }) {
  if (!['blue', 'red'].includes(corner)) throw new Error(`Unknown corner: ${corner}`);
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown category: ${category}`);
  if (!TOKENS.includes(token)) throw new Error(`Unknown token: ${token}`);

  const card = await Scorecard.findOne({ bout: boutId, judge: judgeId });
  if (!card) throw Object.assign(new Error('Scorecard not found'), { statusCode: 404 });
  if (card.locked) throw Object.assign(new Error('Scorecard is locked'), { statusCode: 409 });

  const round = card.getRound(roundNo);
  if (round.submitted) {
    throw Object.assign(new Error('Round already submitted'), { statusCode: 409 });
  }

  round[corner][category].push(token);
  card.markModified('rounds'); // nested arrays inside a subdocument
  await card.save();

  return {
    roundNo,
    corner,
    category,
    tokens: round[corner][category],
    tally: { blue: tallyTokens(round.blue), red: tallyTokens(round.red) },
  };
}

/** Remove the most recent token from a category log (undo). */
export async function undoToken({ boutId, judgeId, roundNo, corner, category }) {
  const card = await Scorecard.findOne({ bout: boutId, judge: judgeId });
  if (!card) throw Object.assign(new Error('Scorecard not found'), { statusCode: 404 });

  const round = card.getRound(roundNo);
  if (round.submitted) {
    throw Object.assign(new Error('Round already submitted'), { statusCode: 409 });
  }

  round[corner][category].pop();
  card.markModified('rounds');
  await card.save();

  return {
    roundNo,
    corner,
    category,
    tokens: round[corner][category],
    tally: { blue: tallyTokens(round.blue), red: tallyTokens(round.red) },
  };
}

/** Lock in a judge's 10-point-must scores for a round. */
export async function submitRound({ boutId, judgeId, roundNo, blueScore, redScore, durationSec }) {
  const card = await Scorecard.findOne({ bout: boutId, judge: judgeId });
  if (!card) throw Object.assign(new Error('Scorecard not found'), { statusCode: 404 });

  const round = card.getRound(roundNo);
  round.blueScore = Number(blueScore);
  round.redScore = Number(redScore);
  round.durationSec = Number(durationSec || round.durationSec || 0);
  round.submitted = true;
  round.submittedAt = new Date();
  await card.save();

  const all = await Scorecard.find({ bout: boutId });
  const submittedCount = all.filter((c) => c.rounds.some((r) => r.roundNo === roundNo && r.submitted))
    .length;

  return {
    card,
    submittedCount,
    totalJudges: all.length,
    allSubmitted: submittedCount >= all.length && all.length > 0,
  };
}

/**
 * Aggregate every judge's card into the supervised combined scoreboard
 * and derive the decision winner when the bout went the distance.
 */
export async function buildSummary(boutId) {
  const bout = await Bout.findById(boutId)
    .populate('league')
    .populate({ path: 'blueCorner.fighter' })
    .populate({ path: 'redCorner.fighter' })
    .populate('judges', 'name')
    .populate('referee', 'name');

  if (!bout) throw Object.assign(new Error('Bout not found'), { statusCode: 404 });

  const cards = await Scorecard.find({ bout: bout._id })
    .populate('judge', 'name')
    .sort({ judgeSeat: 1 });

  const judges = cards.map((card) => {
    const rounds = card.rounds
      .slice()
      .sort((a, b) => a.roundNo - b.roundNo)
      .map((r) => ({
        roundNo: r.roundNo,
        blueScore: r.blueScore,
        redScore: r.redScore,
        submitted: r.submitted,
        blueTally: tallyTokens(r.blue),
        redTally: tallyTokens(r.red),
        blue: pickTokens(r.blue),
        red: pickTokens(r.red),
      }));

    const totals = rounds.reduce(
      (acc, r) => {
        acc.blue += r.blueScore ?? 0;
        acc.red += r.redScore ?? 0;
        return acc;
      },
      { blue: 0, red: 0 }
    );

    return {
      seat: card.judgeSeat,
      judgeId: card.judge?._id,
      judgeName: card.judge?.name || `Judge ${card.judgeSeat}`,
      rounds,
      totals,
      verdict: totals.blue === totals.red ? 'draw' : totals.blue > totals.red ? 'blue' : 'red',
    };
  });

  const decision = decideByJudges(judges);

  return {
    bout: {
      id: bout._id,
      boutNo: bout.boutNo,
      boutName: bout.boutName,
      boutType: bout.boutType,
      discipline: bout.discipline,
      boutDate: bout.boutDate,
      ringNo: bout.ringNo,
      totalRounds: bout.totalRounds,
      roundDurationSec: bout.roundDurationSec,
      status: bout.status,
      currentRound: bout.currentRound,
      result: bout.result,
      referee: bout.referee?.name || '',
    },
    league: bout.league
      ? {
          id: bout.league._id,
          name: bout.league.name,
          date: bout.league.date,
          location: bout.league.location,
          promoter: bout.league.promoter,
          logoUrl: bout.league.logoUrl,
        }
      : null,
    corners: {
      blue: cornerInfo(bout.blueCorner?.fighter),
      red: cornerInfo(bout.redCorner?.fighter),
    },
    judges,
    decision,
    // A finish (KO/TKO/Sub/DQ) always overrides the judges' cards.
    winner:
      bout.result?.winnerCorner && bout.result.method && bout.result.method !== 'Decision'
        ? { corner: bout.result.winnerCorner, method: bout.result.method }
        : decision,
  };
}

function pickTokens(cornerDoc) {
  return CATEGORIES.reduce((acc, cat) => {
    acc[cat] = cornerDoc?.[cat] || [];
    return acc;
  }, {});
}

function cornerInfo(fighter) {
  if (!fighter) return null;
  return {
    id: fighter._id,
    name: fighter.name,
    nickname: fighter.nickname,
    team: fighter.team,
    country: fighter.country,
    weightClass: fighter.weightClass,
    photoUrl: fighter.photoUrl,
    record: fighter.record,
  };
}

/** Majority of judges; ties fall back to aggregate points, then draw. Exported for tests. */
export function decideByJudges(judges) {
  const scored = judges.filter((j) => j.rounds.some((r) => r.submitted));
  if (!scored.length) return { corner: null, method: null, split: null };

  const votes = scored.reduce(
    (acc, j) => {
      acc[j.verdict] = (acc[j.verdict] || 0) + 1;
      return acc;
    },
    { blue: 0, red: 0, draw: 0 }
  );

  let corner = null;
  if (votes.blue > votes.red) corner = 'blue';
  else if (votes.red > votes.blue) corner = 'red';
  else {
    const agg = scored.reduce(
      (acc, j) => {
        acc.blue += j.totals.blue;
        acc.red += j.totals.red;
        return acc;
      },
      { blue: 0, red: 0 }
    );
    if (agg.blue > agg.red) corner = 'blue';
    else if (agg.red > agg.blue) corner = 'red';
    else corner = 'draw';
  }

  const method =
    corner === 'draw'
      ? 'Draw'
      : votes[corner] === scored.length
      ? 'Unanimous Decision'
      : votes.draw > 0
      ? 'Majority Decision'
      : 'Split Decision';

  return { corner, method, split: votes };
}
