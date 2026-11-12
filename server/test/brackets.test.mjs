import assert from 'node:assert/strict';
import {
  nextPow2,
  seedPositions,
  arrangeEntrants,
  buildSingleElimination,
  buildRoundRobin,
  buildBracket,
  decideWinner,
  placements,
  roundRobinStandings,
  assignDivisionsToMats,
  roundName,
} from '../src/utils/brackets.js';

const pass = [];
const t = (name, fn) => {
  try { fn(); pass.push(name); }
  catch (e) { console.log('   ✗', name, '—', e.message); process.exitCode = 1; }
};

// Deterministic PRNG so draws are reproducible in tests.
const rng = (seed = 42) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const people = (n, academyOf = () => '') =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, academy: academyOf(i) }));

/** Play a whole elimination bracket, top athlete always winning. */
function playOut(plan) {
  const byKey = new Map(plan.matches.map((m) => [m.key, m]));
  for (let r = 1; r <= plan.totalRounds; r += 1) {
    for (const m of plan.matches.filter((x) => x.round === r && x.status !== 'completed')) {
      assert.ok(m.a && m.b, `${m.key} should have both athletes by round ${r}`);
      m.winner = m.a;
      m.status = 'completed';
      if (m.next) byKey.get(m.next.key)[m.next.slot] = m.winner;
    }
  }
}

t('nextPow2 rounds up to a bracket size', () => {
  assert.deepEqual([1, 2, 3, 5, 8, 9].map(nextPow2), [2, 2, 4, 8, 8, 16]);
});

t('seed positions keep top seeds apart', () => {
  assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const s16 = seedPositions(16);
  assert.equal(new Set(s16).size, 16);
  // 1 and 2 in opposite halves
  assert.ok(s16.indexOf(1) < 8 && s16.indexOf(2) >= 8);
});

t('round names count back from the final', () => {
  assert.equal(roundName(3, 3), 'Final');
  assert.equal(roundName(2, 3), 'Semi-final');
  assert.equal(roundName(1, 3), 'Quarter-final');
  assert.equal(roundName(1, 4), 'Round of 16');
});

t('a 5-athlete bracket has 3 byes that auto-advance', () => {
  const plan = buildSingleElimination(people(5), { random: rng() });
  assert.equal(plan.size, 8);
  assert.equal(plan.matches.length, 7);
  const byes = plan.matches.filter((m) => m.isBye);
  assert.equal(byes.length, 3);
  byes.forEach((m) => assert.ok(m.winner && m.status === 'completed'));
  // every athlete appears exactly once in round 1
  const r1 = plan.matches.filter((m) => m.round === 1).flatMap((m) => [m.a, m.b]).filter(Boolean);
  assert.equal(new Set(r1).size, 5);
});

t('byes go to the top seeds', () => {
  const entrants = people(5).map((p, i) => ({ ...p, seed: i + 1 }));
  const plan = buildSingleElimination(entrants, { random: rng() });
  const byeWinners = plan.matches.filter((m) => m.isBye).map((m) => m.winner).sort();
  assert.deepEqual(byeWinners, ['p1', 'p2', 'p3']);
});

t('every elimination bracket size plays out to one champion', () => {
  for (let n = 2; n <= 33; n += 1) {
    const plan = buildSingleElimination(people(n), { random: rng(n) });
    playOut(plan);
    const final = plan.matches.find((m) => m.round === plan.totalRounds);
    assert.ok(final.winner, `n=${n} has a champion`);
    assert.equal(plan.matches.length, plan.size - 1);
  }
});

t('team-mates are separated into different halves', () => {
  // 8 athletes, 2 academies of 4 → each half should hold 2 + 2, never 4 + 0.
  const plan = buildSingleElimination(people(8, (i) => (i < 4 ? 'A' : 'B')), { random: rng(7) });
  const academy = (id) => (Number(id.slice(1)) <= 4 ? 'A' : 'B');
  const r1 = plan.matches.filter((m) => m.round === 1);
  // no first-round match between team-mates
  r1.forEach((m) => assert.notEqual(academy(m.a), academy(m.b), `${m.key} pits team-mates`));
});

t('arrangeEntrants keeps explicit seeds first', () => {
  const list = arrangeEntrants(
    [{ id: 'x' }, { id: 'y', seed: 2 }, { id: 'z', seed: 1 }],
    rng()
  );
  assert.deepEqual(list.slice(0, 2).map((e) => e.id), ['z', 'y']);
});

t('round robin of 4 has 6 matches, everyone fights 3 times', () => {
  const plan = buildRoundRobin(people(4));
  assert.equal(plan.matches.length, 6);
  const count = {};
  plan.matches.forEach((m) => [m.a, m.b].forEach((id) => (count[id] = (count[id] || 0) + 1)));
  Object.values(count).forEach((c) => assert.equal(c, 3));
  const pairs = new Set(plan.matches.map((m) => [m.a, m.b].sort().join('-')));
  assert.equal(pairs.size, 6);
});

t('round robin of 3 has 3 matches and no byes stored', () => {
  const plan = buildRoundRobin(people(3));
  assert.equal(plan.matches.length, 3);
  plan.matches.forEach((m) => assert.ok(m.a && m.b));
});

t('auto format: 2 → elimination, 3–4 → round robin, 5+ → elimination', () => {
  assert.equal(buildBracket(people(2)).type, 'single_elim');
  assert.equal(buildBracket(people(3)).type, 'round_robin');
  assert.equal(buildBracket(people(4)).type, 'round_robin');
  assert.equal(buildBracket(people(5)).type, 'single_elim');
  assert.equal(buildBracket(people(4), 'single_elim').type, 'single_elim');
});

t('fewer than 2 athletes cannot be drawn', () => {
  assert.throws(() => buildSingleElimination(people(1)));
  assert.throws(() => buildRoundRobin([]));
});

t('decideWinner: points, then advantages, then fewer penalties', () => {
  const s = (a, b) => ({ a: { points: a[0], advantages: a[1], penalties: a[2] }, b: { points: b[0], advantages: b[1], penalties: b[2] } });
  assert.deepEqual(decideWinner(s([4, 0, 0], [2, 3, 0])), { leader: 'a', method: 'points' });
  assert.deepEqual(decideWinner(s([2, 1, 0], [2, 2, 0])), { leader: 'b', method: 'advantages' });
  assert.deepEqual(decideWinner(s([2, 1, 2], [2, 1, 1])), { leader: 'b', method: 'penalties' });
  assert.deepEqual(decideWinner(s([0, 0, 0], [0, 0, 0])), { leader: null, method: 'decision' });
});

t('elimination podium: gold, silver and two bronzes', () => {
  const plan = buildSingleElimination(people(8), { random: rng(3) });
  playOut(plan);
  const podium = placements('single_elim', plan.matches);
  assert.equal(podium.filter((p) => p.place === 1).length, 1);
  assert.equal(podium.filter((p) => p.place === 2).length, 1);
  assert.equal(podium.filter((p) => p.place === 3).length, 2);
  assert.equal(new Set(podium.map((p) => p.athlete)).size, 4);
});

t('a bye in the semis does not award a phantom bronze', () => {
  const plan = buildSingleElimination(people(3), { random: rng(5) });
  playOut(plan);
  const podium = placements('single_elim', plan.matches);
  assert.equal(podium.length, 3); // gold, silver, one bronze
});

t('round-robin standings: wins, then subs, then point difference', () => {
  const ids = ['a', 'b', 'c'];
  const m = (a, b, winner, method = 'points', pa = 0, pb = 0) => ({
    a, b, winner, method, status: 'completed', score: { a: { points: pa }, b: { points: pb } },
  });
  const matches = [m('a', 'b', 'a', 'submission'), m('b', 'c', 'b', 'points', 4, 0), m('c', 'a', 'c', 'points', 2, 0)];
  const table = roundRobinStandings(ids, matches);
  // all 1-1; a and b have a sub/none... a has 1 sub → first
  assert.equal(table[0].athlete, 'a');
  const podium = placements('round_robin', matches, ids);
  assert.equal(podium.length, 3);
  assert.equal(podium[0].athlete, 'a');
});

t('round-robin podium waits until every match is done', () => {
  const plan = buildRoundRobin(people(3));
  plan.matches[0].status = 'completed';
  plan.matches[0].winner = plan.matches[0].a;
  assert.deepEqual(placements('round_robin', plan.matches, ['p1', 'p2', 'p3']), []);
});

t('mat assignment balances match load', () => {
  const plan = assignDivisionsToMats(
    [
      { division: 'd1', matchCount: 15 },
      { division: 'd2', matchCount: 7 },
      { division: 'd3', matchCount: 7 },
      { division: 'd4', matchCount: 1 },
    ],
    2
  );
  const load = { 1: 0, 2: 0 };
  const counts = { d1: 15, d2: 7, d3: 7, d4: 1 };
  for (const [d, mat] of plan) load[mat] += counts[d];
  assert.ok(Math.abs(load[1] - load[2]) <= 1, JSON.stringify(load));
});

console.log(`\n✅ brackets: ${pass.length} passed`);
pass.forEach((p) => console.log('   ✓', p));
