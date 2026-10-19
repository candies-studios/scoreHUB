import assert from 'node:assert/strict';
import { decideByJudges } from '../src/utils/scoring.js';
import { tallyTokens, CATEGORIES } from '../src/models/Scorecard.js';
import {
  getRoom, addJudge, removeSocket, presence, startTimer, stopTimer, resetTimer,
  timerState, markSubmitted, dropRoom,
} from '../src/sockets/boutRoom.js';
import { parseOrigins } from '../src/config/env.js';

const pass = [];
const t = (name, fn) => {
  try { fn(); pass.push(name); }
  catch (e) { console.log('   ✗', name, '—', e.message); process.exitCode = 1; }
};

const judge = (seat, rounds) => ({
  seat,
  rounds: rounds.map(([b, r], i) => ({ roundNo: i + 1, blueScore: b, redScore: r, submitted: true })),
  totals: rounds.reduce((a, [b, r]) => ({ blue: a.blue + b, red: a.red + r }), { blue: 0, red: 0 }),
  verdict: null,
});
const withVerdict = (j) => ({
  ...j,
  verdict: j.totals.blue === j.totals.red ? 'draw' : j.totals.blue > j.totals.red ? 'blue' : 'red',
});

// ---- decision engine ----
t('unanimous decision for blue', () => {
  const d = decideByJudges(
    [judge(1, [[10, 9]]), judge(2, [[10, 9]]), judge(3, [[10, 9]])].map(withVerdict)
  );
  assert.equal(d.corner, 'blue');
  assert.equal(d.method, 'Unanimous Decision');
});

t('split decision when 2-1', () => {
  const d = decideByJudges(
    [judge(1, [[10, 9]]), judge(2, [[10, 9]]), judge(3, [[9, 10]])].map(withVerdict)
  );
  assert.equal(d.corner, 'blue');
  assert.equal(d.method, 'Split Decision');
  assert.deepEqual(d.split, { blue: 2, red: 1, draw: 0 });
});

t('majority decision when one card is even', () => {
  const d = decideByJudges(
    [judge(1, [[10, 9]]), judge(2, [[10, 9]]), judge(3, [[10, 10]])].map(withVerdict)
  );
  assert.equal(d.corner, 'blue');
  assert.equal(d.method, 'Majority Decision');
});

t('true draw when every card is even', () => {
  const d = decideByJudges(
    [judge(1, [[10, 10]]), judge(2, [[10, 10]]), judge(3, [[10, 10]])].map(withVerdict)
  );
  assert.equal(d.corner, 'draw');
  assert.equal(d.method, 'Draw');
});

t('1-1-1 tie falls through to aggregate points', () => {
  // blue 20-18, red 18-20, draw 19-19 -> aggregate blue 57 vs red 57 -> draw
  const d = decideByJudges(
    [judge(1, [[10, 9], [10, 9]]), judge(2, [[9, 10], [9, 10]]), judge(3, [[10, 9], [9, 10]])].map(withVerdict)
  );
  assert.equal(d.corner, 'draw');
});

t('aggregate tiebreak picks the higher point total', () => {
  // blue card 20-17, red card 18-20 -> votes 1-1, aggregate blue 38 red 37 -> blue
  const d = decideByJudges(
    [judge(1, [[10, 9], [10, 8]]), judge(2, [[9, 10], [9, 10]])].map(withVerdict)
  );
  assert.equal(d.corner, 'blue');
});

t('no submitted rounds yields no decision', () => {
  const d = decideByJudges([{ seat: 1, rounds: [], totals: { blue: 0, red: 0 }, verdict: 'draw' }]);
  assert.equal(d.corner, null);
});

// ---- token tally ----
t('tally weights 1=1, 0=0, +=2', () => {
  assert.equal(tallyTokens({ standup: ['1', '1', '0', '+'], takedowns: ['+'] }), 6);
});

t('tally of an empty card is zero', () => {
  assert.equal(tallyTokens({}), 0);
  assert.equal(tallyTokens(null), 0);
});

t('all four categories are counted', () => {
  const card = Object.fromEntries(CATEGORIES.map((c) => [c, ['1']]));
  assert.equal(tallyTokens(card), 4);
});

// ---- room state machine ----
t('presence counts unique judges, not sockets', () => {
  dropRoom('r1');
  const room = getRoom('r1');
  room.expectedJudges = 3;
  addJudge(room, { judgeId: 'j1', judgeName: 'A', seat: 1, socketId: 's1' });
  addJudge(room, { judgeId: 'j1', judgeName: 'A', seat: 1, socketId: 's1-dup' }); // same judge, 2nd tab
  addJudge(room, { judgeId: 'j2', judgeName: 'B', seat: 2, socketId: 's2' });
  const p = presence(room);
  assert.equal(p.joined, 2);
  assert.equal(p.allJoined, false);
});

t('allJoined flips true only at the full panel', () => {
  dropRoom('r2');
  const room = getRoom('r2');
  room.expectedJudges = 3;
  ['j1', 'j2', 'j3'].forEach((id, i) =>
    addJudge(room, { judgeId: id, judgeName: id, seat: i + 1, socketId: `s${i}` })
  );
  assert.equal(presence(room).allJoined, true);
});

t('a judge stays present while another tab is open', () => {
  dropRoom('r3');
  const room = getRoom('r3');
  room.expectedJudges = 2;
  addJudge(room, { judgeId: 'j1', judgeName: 'A', seat: 1, socketId: 'sA' });
  addJudge(room, { judgeId: 'j1', judgeName: 'A', seat: 1, socketId: 'sB' });
  removeSocket(room, 'sA');
  assert.equal(presence(room).joined, 1);
  removeSocket(room, 'sB');
  assert.equal(presence(room).joined, 0);
});

t('presence is ordered by seat', () => {
  dropRoom('r4');
  const room = getRoom('r4');
  addJudge(room, { judgeId: 'c', judgeName: 'C', seat: 3, socketId: 's3' });
  addJudge(room, { judgeId: 'a', judgeName: 'A', seat: 1, socketId: 's1' });
  addJudge(room, { judgeId: 'b', judgeName: 'B', seat: 2, socketId: 's2' });
  assert.deepEqual(presence(room).judges.map((j) => j.seat), [1, 2, 3]);
});

t('timer accumulates across a pause and resume', () => {
  dropRoom('r5');
  const room = getRoom('r5');
  startTimer(room, 300);
  room.timer.startedAt -= 5000; // pretend 5s elapsed
  stopTimer(room);
  assert.equal(timerState(room).elapsedSec, 5);
  assert.equal(timerState(room).running, false);

  startTimer(room);
  room.timer.startedAt -= 3000;
  assert.equal(timerState(room).elapsedSec, 8);
  assert.equal(timerState(room).remainingSec, 292);
});

t('starting an already-running timer does not double count', () => {
  dropRoom('r6');
  const room = getRoom('r6');
  startTimer(room, 60);
  room.timer.startedAt -= 4000;
  startTimer(room); // no-op
  assert.equal(timerState(room).elapsedSec, 4);
});

t('elapsed never exceeds the round duration', () => {
  dropRoom('r7');
  const room = getRoom('r7');
  startTimer(room, 10);
  room.timer.startedAt -= 60000;
  assert.equal(timerState(room).elapsedSec, 10);
  assert.equal(timerState(room).remainingSec, 0);
});

t('reset clears the clock for the next round', () => {
  dropRoom('r8');
  const room = getRoom('r8');
  startTimer(room, 300);
  room.timer.startedAt -= 9000;
  stopTimer(room);
  resetTimer(room, 180);
  const s = timerState(room);
  assert.equal(s.elapsedSec, 0);
  assert.equal(s.durationSec, 180);
  assert.equal(s.running, false);
});

t('duplicate submissions from one judge count once', () => {
  dropRoom('r9');
  const room = getRoom('r9');
  assert.equal(markSubmitted(room, 1, 'j1'), 1);
  assert.equal(markSubmitted(room, 1, 'j1'), 1);
  assert.equal(markSubmitted(room, 1, 'j2'), 2);
  assert.equal(markSubmitted(room, 2, 'j1'), 1); // separate round
});

// ---- CORS origin parsing (what lets the Pages site reach the API) ----
t('unset origin allows any', () => {
  assert.equal(parseOrigins(undefined), true);
  assert.equal(parseOrigins(''), true);
});

t('a bare * becomes true, not a literal entry', () => {
  // cors() matches an array by exact string, so ['*'] would block everything.
  assert.equal(parseOrigins('*'), true);
});

t('a single origin becomes a one-item allowlist', () => {
  assert.deepEqual(parseOrigins('https://me.github.io'), ['https://me.github.io']);
});

t('a comma list is split and trimmed', () => {
  assert.deepEqual(
    parseOrigins('https://me.github.io ,  http://localhost:5173'),
    ['https://me.github.io', 'http://localhost:5173']
  );
});

t('a trailing slash is stripped so it matches an Origin header', () => {
  // Browsers send "https://me.github.io" with no trailing slash.
  assert.deepEqual(parseOrigins('https://me.github.io/'), ['https://me.github.io']);
});

t('* anywhere in the list wins', () => {
  assert.equal(parseOrigins('https://me.github.io,*'), true);
});

console.log(`\n✅ ${pass.length} logic checks passed`);
pass.forEach((p) => console.log('   ✓', p));
