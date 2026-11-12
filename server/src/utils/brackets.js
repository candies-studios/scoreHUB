/**
 * Tournament bracket engine — pure functions, no database.
 *
 * Everything here works on plain objects so it can be unit-tested and reused
 * by the REST routes, the socket handlers and the seed script alike.
 *
 *   seedPositions(size)          standard seed order for a power-of-two draw
 *   arrangeEntrants(entrants)    seed + keep team-mates apart
 *   buildSingleElimination(...)  match skeleton with byes and next-match links
 *   buildRoundRobin(...)         every-one-fights-everyone schedule
 *   decideWinner(score)          BJJ-style points → advantages → penalties
 *   placements(...)              podium from finished matches
 */

export const ROUND_ROBIN_MAX = 4;

/** Smallest power of two >= n (minimum 2). */
export function nextPow2(n) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Standard bracket seed order. For size 8 → [1, 8, 4, 5, 2, 7, 3, 6]:
 * seed 1 and 2 can only meet in the final, 1-4 only in the semis, and so on.
 */
export function seedPositions(size) {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

/**
 * Order entrants into seed rank so that athletes from the same academy are
 * spread as far apart as the draw allows.
 *
 * Entrants with an explicit `seed` keep it. The rest are dealt out one academy
 * at a time (largest team first), which, combined with seedPositions(), puts
 * team-mates into different halves/quarters of the bracket.
 *
 * @param {Array<{id:string, academy?:string, seed?:number}>} entrants
 * @param {() => number} random  injectable for deterministic tests
 */
export function arrangeEntrants(entrants, random = Math.random) {
  const seeded = entrants
    .filter((e) => Number(e.seed) > 0)
    .sort((a, b) => Number(a.seed) - Number(b.seed));
  const rest = shuffle(entrants.filter((e) => !(Number(e.seed) > 0)), random);

  const groups = new Map();
  for (const e of rest) {
    const key = e.academy ? String(e.academy) : `__solo_${e.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);

  const dealt = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) if (q.length) dealt.push(q.shift());
  }
  return [...seeded, ...dealt];
}

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Human label for a round given how many rounds the bracket has. */
export function roundName(round, totalRounds) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-final';
  if (fromEnd === 2) return 'Quarter-final';
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/**
 * Build a single-elimination bracket.
 *
 * Returns matches as plain objects keyed by `key` ("r1m3"), each with
 * `next: { key, slot }` pointing at the match its winner goes to. First-round
 * byes are resolved immediately: the bye match is marked completed and its
 * athlete is copied into the next match.
 *
 * Both beaten semi-finalists take bronze (IBJJF style), so there is no
 * third-place match.
 *
 * @param {Array<{id:string, academy?:string, seed?:number}>} entrants
 */
export function buildSingleElimination(entrants, { random = Math.random } = {}) {
  if (entrants.length < 2) throw new Error('A bracket needs at least 2 athletes');

  const ranked = arrangeEntrants(entrants, random);
  const size = nextPow2(ranked.length);
  const totalRounds = Math.log2(size);
  const positions = seedPositions(size);
  const slots = positions.map((seed) => ranked[seed - 1] || null); // null = bye

  const matches = [];
  const byKey = new Map();

  for (let round = 1; round <= totalRounds; round += 1) {
    const count = size / 2 ** round;
    for (let pos = 1; pos <= count; pos += 1) {
      const m = {
        key: `r${round}m${pos}`,
        round,
        position: pos,
        roundName: roundName(round, totalRounds),
        a: null,
        b: null,
        winner: null,
        status: 'pending',
        isBye: false,
        method: null,
        next:
          round < totalRounds
            ? { key: `r${round + 1}m${Math.ceil(pos / 2)}`, slot: pos % 2 === 1 ? 'a' : 'b' }
            : null,
      };
      if (round === 1) {
        m.a = slots[(pos - 1) * 2]?.id ?? null;
        m.b = slots[(pos - 1) * 2 + 1]?.id ?? null;
      }
      matches.push(m);
      byKey.set(m.key, m);
    }
  }

  // Resolve byes: a first-round match with one athlete is an automatic win.
  for (const m of matches.filter((x) => x.round === 1)) {
    if (m.a && m.b) {
      m.status = 'ready';
      continue;
    }
    m.isBye = true;
    m.status = 'completed';
    m.method = 'bye';
    m.winner = m.a || m.b || null;
    if (m.winner && m.next) byKey.get(m.next.key)[m.next.slot] = m.winner;
  }

  // A second-round match whose both feeders were byes is now ready.
  for (const m of matches) {
    if (m.status === 'pending' && m.a && m.b) m.status = 'ready';
  }

  return { type: 'single_elim', size, totalRounds, matches };
}

/**
 * Round robin via the circle method. Every athlete meets every other once.
 * Used for small divisions (2–4) where an elimination bracket would give
 * someone a single match and a medal.
 */
export function buildRoundRobin(entrants) {
  if (entrants.length < 2) throw new Error('A round robin needs at least 2 athletes');
  const ids = entrants.map((e) => e.id);
  if (ids.length % 2) ids.push(null);

  const n = ids.length;
  const rounds = n - 1;
  const matches = [];
  let arr = [...ids];

  for (let r = 1; r <= rounds; r += 1) {
    let pos = 0;
    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) {
        pos += 1;
        matches.push({
          key: `r${r}m${pos}`,
          round: r,
          position: pos,
          roundName: `Round ${r}`,
          a,
          b,
          winner: null,
          status: 'ready',
          isBye: false,
          method: null,
          next: null,
        });
      }
    }
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return { type: 'round_robin', size: entrants.length, totalRounds: rounds, matches };
}

/** Pick the format for a division. 'auto' → round robin up to ROUND_ROBIN_MAX. */
export function buildBracket(entrants, type = 'auto', opts = {}) {
  const resolved =
    type === 'auto' ? (entrants.length <= ROUND_ROBIN_MAX && entrants.length > 2 ? 'round_robin' : 'single_elim') : type;
  return resolved === 'round_robin'
    ? buildRoundRobin(entrants)
    : buildSingleElimination(entrants, opts);
}

/* ------------------------------------------------------------------ */
/* Match scoring                                                        */
/* ------------------------------------------------------------------ */

/** BJJ point values for the scoreboard buttons. */
export const BJJ_POINTS = {
  takedown: 2,
  sweep: 2,
  kneeOnBelly: 2,
  guardPass: 3,
  mount: 4,
  backControl: 4,
};

export const FINISH_METHODS = ['submission', 'dq', 'walkover', 'injury'];
export const DECISION_METHODS = ['points', 'advantages', 'penalties', 'decision'];

export const emptyScore = () => ({
  a: { points: 0, advantages: 0, penalties: 0 },
  b: { points: 0, advantages: 0, penalties: 0 },
});

/**
 * Who leads on the scoreboard, and by which criterion.
 * Returns { leader: 'a'|'b'|null, method }.
 * A null leader with method 'decision' means a referee's decision is needed.
 */
export function decideWinner(score = emptyScore()) {
  const a = score.a || {};
  const b = score.b || {};
  const cmp = (x, y) => (x > y ? 'a' : y > x ? 'b' : null);

  const byPoints = cmp(a.points || 0, b.points || 0);
  if (byPoints) return { leader: byPoints, method: 'points' };
  const byAdv = cmp(a.advantages || 0, b.advantages || 0);
  if (byAdv) return { leader: byAdv, method: 'advantages' };
  // Fewer penalties wins.
  const byPen = cmp(b.penalties || 0, a.penalties || 0);
  if (byPen) return { leader: byPen, method: 'penalties' };
  return { leader: null, method: 'decision' };
}

/**
 * Round-robin standings: wins, then wins by submission, then points scored
 * minus conceded. Ties after that are broken by the head-to-head result.
 */
export function roundRobinStandings(athleteIds, matches) {
  const table = new Map(
    athleteIds.map((id) => [String(id), { athlete: String(id), wins: 0, losses: 0, subs: 0, diff: 0 }])
  );
  for (const m of matches) {
    if (m.status !== 'completed' || !m.winner) continue;
    const w = String(m.winner);
    const l = String(m.a) === w ? String(m.b) : String(m.a);
    const ws = String(m.a) === w ? 'a' : 'b';
    const ls = ws === 'a' ? 'b' : 'a';
    const diff = (m.score?.[ws]?.points || 0) - (m.score?.[ls]?.points || 0);
    if (table.has(w)) {
      const row = table.get(w);
      row.wins += 1;
      if (m.method === 'submission') row.subs += 1;
      row.diff += diff;
    }
    if (table.has(l)) {
      const row = table.get(l);
      row.losses += 1;
      row.diff -= diff;
    }
  }
  const h2h = (x, y) => {
    const m = matches.find(
      (mm) =>
        mm.status === 'completed' &&
        [String(mm.a), String(mm.b)].includes(x) &&
        [String(mm.a), String(mm.b)].includes(y)
    );
    if (!m || !m.winner) return 0;
    return String(m.winner) === x ? -1 : 1;
  };
  return [...table.values()].sort(
    (p, q) => q.wins - p.wins || q.subs - p.subs || q.diff - p.diff || h2h(p.athlete, q.athlete)
  );
}

/**
 * Podium for a division once its matches are done.
 * Returns [{ athlete, place }] with place 1, 2, 3 (two bronzes in elimination).
 * Unfinished brackets return whatever is already decided.
 */
export function placements(type, matches, athleteIds = []) {
  if (type === 'round_robin') {
    const done = matches.length > 0 && matches.every((m) => m.status === 'completed');
    if (!done) return [];
    return roundRobinStandings(athleteIds, matches)
      .slice(0, 3)
      .map((row, i) => ({ athlete: row.athlete, place: i + 1 }));
  }

  const totalRounds = Math.max(0, ...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === totalRounds);
  const out = [];
  if (final?.status === 'completed' && final.winner) {
    out.push({ athlete: String(final.winner), place: 1 });
    const runnerUp = String(final.a) === String(final.winner) ? final.b : final.a;
    if (runnerUp) out.push({ athlete: String(runnerUp), place: 2 });
  }
  if (totalRounds >= 2) {
    for (const semi of matches.filter((m) => m.round === totalRounds - 1)) {
      if (semi.status !== 'completed' || !semi.winner || semi.isBye) continue;
      const loser = String(semi.a) === String(semi.winner) ? semi.b : semi.a;
      if (loser) out.push({ athlete: String(loser), place: 3 });
    }
  }
  return out;
}

/** Ranking points per placement (gold / silver / bronze), IBJJF-style 9/3/1. */
export const PLACE_POINTS = { 1: 9, 2: 3, 3: 1 };

/**
 * Spread matches over mats.
 *
 * Divisions are assigned whole to the least-loaded mat (so one bracket stays
 * on one mat, as organisers prefer), then each mat's matches are ordered by
 * round so early rounds of every division run before any final.
 *
 * @param {Array<{division:string, matchCount:number}>} divisions
 * @param {number} mats
 * @returns {Map<string, number>} division id → mat number (1-based)
 */
export function assignDivisionsToMats(divisions, mats) {
  const load = Array.from({ length: Math.max(1, mats) }, () => 0);
  const result = new Map();
  const sorted = [...divisions].sort((a, b) => b.matchCount - a.matchCount);
  for (const d of sorted) {
    let best = 0;
    for (let i = 1; i < load.length; i += 1) if (load[i] < load[best]) best = i;
    load[best] += d.matchCount;
    result.set(String(d.division), best + 1);
  }
  return result;
}
