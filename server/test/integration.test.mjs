/**
 * End-to-end test: boots the real HTTP + Socket.IO server against a MongoDB,
 * then drives a full bout through three judges over websockets.
 *
 * Requires a reachable MongoDB. Either:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/scorehub_test npm run test:e2e
 * or let it fall back to mongodb-memory-server (devDependency) when installed.
 */
import mongoose from 'mongoose';
import http from 'node:http';
import { io } from 'socket.io-client';

const PORT = 5099;
const BASE = `http://localhost:${PORT}`;

let mem = null;
let uri = process.env.MONGO_TEST_URI;

if (!uri) {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mem = await MongoMemoryServer.create();
    uri = mem.getUri('scorehub_test');
  } catch {
    console.error('No MongoDB available. Set MONGO_TEST_URI, or install mongodb-memory-server.');
    process.exit(2);
  }
}

process.env.MONGO_URI = uri;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';

const ok = [];
const bad = [];
const check = (label, cond, extra = '') => (cond ? ok.push(label) : bad.push(`${label} — ${extra}`));

const connectDB = (await import('../src/config/db.js')).default;
const createApp = (await import('../src/app.js')).default;
const initSockets = (await import('../src/sockets/index.js')).default;
const { EVT } = await import('../src/sockets/events.js');

const League = (await import('../src/models/League.js')).default;
const Fighter = (await import('../src/models/Fighter.js')).default;
const Official = (await import('../src/models/Official.js')).default;
const Bout = (await import('../src/models/Bout.js')).default;
const Scorecard = (await import('../src/models/Scorecard.js')).default;

await connectDB(uri);
await Promise.all([League, Fighter, Official, Bout, Scorecard].map((M) => M.deleteMany({})));

const server = http.createServer(createApp());
initSockets(server);
await new Promise((r) => server.listen(PORT, r));

// ---------- fixtures ----------
const league = await League.create({
  name: 'Test Cup', date: new Date(), time: '19:00', location: 'Mumbai', promoter: 'P',
});
const [blue, red] = await Fighter.create([
  { league: league._id, name: 'Blue Guy', team: 'A' },
  { league: league._id, name: 'Red Guy', team: 'B' },
]);
const judges = await Official.insertMany(
  [1, 2, 3].map((i) => ({ league: league._id, kind: 'judge', name: `Judge ${i}` }))
);
const bout = await Bout.create({
  league: league._id, boutNo: 1, boutName: 'Flyweight', boutDate: new Date(),
  totalRounds: 2, roundDurationSec: 60,
  blueCorner: { fighter: blue._id }, redCorner: { fighter: red._id },
  judges: judges.map((j) => j._id),
});

// ---------- REST (all open, no tokens) ----------
check('health endpoint', (await (await fetch(`${BASE}/api/health`)).json()).status === 'ok');

const leagues = await (await fetch(`${BASE}/api/leagues`)).json();
check('leagues readable without a token', Array.isArray(leagues) && leagues.length === 1);

const created = await fetch(`${BASE}/api/leagues`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Open League', date: new Date(), time: '20:00', location: 'Pune' }),
});
check('anyone can create a league', created.status === 201, `got ${created.status}`);
await League.deleteOne({ name: 'Open League' });

const cards = await (await fetch(`${BASE}/api/bouts/${bout._id}/scorecards`)).json();
check('a scorecard exists per panel judge', cards.length === 3, `got ${cards.length}`);

const oneCard = await (
  await fetch(`${BASE}/api/bouts/${bout._id}/scorecards?judge=${judges[0]._id}`)
).json();
check('scorecards can be filtered to one judge', oneCard.length === 1, `got ${oneCard.length}`);

// ---------- realtime ----------
const connect = () =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

const join = (s, boutId, judgeId) =>
  new Promise((r) => s.emit(EVT.JOIN, { boutId: String(boutId), judgeId }, r));

const sockets = await Promise.all(judges.map(() => connect()));
check('sockets connect with no token', sockets.every((s) => s.connected));

const acks = [];
for (let i = 0; i < sockets.length; i += 1) {
  acks.push(await join(sockets[i], bout._id, String(judges[i]._id)));
}
check('all three joins acked as judge', acks.every((a) => a.ok && a.role === 'judge'));
check('seats assigned 1..3', acks.map((a) => a.seat).sort().join(',') === '1,2,3',
  acks.map((a) => a.seat).join(','));
check('presence reaches 3/3', acks.at(-1).presence.allJoined, JSON.stringify(acks.at(-1).presence));

// An id that is not on this panel must be refused.
const stranger = await Official.create({ league: league._id, kind: 'judge', name: 'Not On Panel' });
const strangerSock = await connect();
const strangerAck = await join(strangerSock, bout._id, String(stranger._id));
check('a judge off the panel is refused', strangerAck?.ok === false, JSON.stringify(strangerAck));
strangerSock.close();

// A supervisor joins with no judgeId.
const supervisor = await connect();
const supAck = await join(supervisor, bout._id, null);
check('supervisor joins without an id', supAck.ok && supAck.role === 'supervisor', JSON.stringify(supAck));
check('supervisor does not take a judge seat', supAck.presence.joined === 3, JSON.stringify(supAck.presence));

const timers = sockets.map((s) => new Promise((r) => s.once(EVT.TIMER, r)));
sockets[0].emit(EVT.START_ROUND, { boutId: String(bout._id), roundNo: 1 });
check('round start broadcasts to every judge', (await Promise.all(timers)).every((t) => t.running));

const tok = (s, payload) =>
  new Promise((r) => s.emit(EVT.SCORE_TOKEN, { boutId: String(bout._id), ...payload }, r));

const a = await tok(sockets[0], { roundNo: 1, corner: 'blue', category: 'standup', token: '1' });
check('token recorded', a.ok && a.tokens.join('') === '1', JSON.stringify(a));

await tok(sockets[0], { roundNo: 1, corner: 'blue', category: 'standup', token: '+' });
const undone = await new Promise((r) =>
  sockets[0].emit(EVT.SCORE_UNDO,
    { boutId: String(bout._id), roundNo: 1, corner: 'blue', category: 'standup' }, r)
);
check('undo removes only the last token', undone.tokens.join(',') === '1', JSON.stringify(undone.tokens));

const supBlocked = await tok(supervisor, { roundNo: 1, corner: 'blue', category: 'standup', token: '1' });
check('a supervisor cannot score', supBlocked?.ok !== true, JSON.stringify(supBlocked));

const submit = (s, payload) =>
  new Promise((r) => s.emit(EVT.SUBMIT_ROUND, { boutId: String(bout._id), ...payload }, r));

const first = await submit(sockets[0], { roundNo: 1, blueScore: 10, redScore: 9 });
check('round stays open after the first card', first.allSubmitted === false);

const roundComplete = new Promise((r) => sockets[0].once(EVT.ROUND_COMPLETE, r));
await submit(sockets[1], { roundNo: 1, blueScore: 10, redScore: 9 });
const third = await submit(sockets[2], { roundNo: 1, blueScore: 9, redScore: 10 });
check('round closes on the last card', third.allSubmitted === true);
check('round advances to 2', (await roundComplete).nextRound === 2);

sockets[0].emit(EVT.START_ROUND, { boutId: String(bout._id), roundNo: 2 });
const finishedP = new Promise((r) => sockets[1].once(EVT.BOUT_FINISHED, r));
for (const s of sockets) await submit(s, { roundNo: 2, blueScore: 10, redScore: 9 });
const summary = await finishedP;

check('bout finished broadcast carries the summary', Boolean(summary?.bout));
check('decision goes to blue', summary.decision.corner === 'blue', JSON.stringify(summary.decision));
check('method is a decision', /Decision/.test(summary.decision.method), summary.decision.method);
check('summary has three judge columns', summary.judges.length === 3);

const late = await tok(sockets[0], { roundNo: 2, corner: 'blue', category: 'standup', token: '1' });
check('scoring a submitted round is refused', late.ok === false, JSON.stringify(late));

const rest = await (await fetch(`${BASE}/api/bouts/${bout._id}/summary`)).json();
check('REST summary agrees on the winner', rest.winner.corner === 'blue');
check('bout is marked completed', rest.bout.status === 'completed', rest.bout.status);

// ---------- KO path ----------
const koBout = await Bout.create({
  league: league._id, boutNo: 2, boutDate: new Date(), totalRounds: 3, roundDurationSec: 60,
  blueCorner: { fighter: blue._id }, redCorner: { fighter: red._id },
  judges: judges.map((j) => j._id),
});
const koSockets = await Promise.all(judges.map(() => connect()));
for (let i = 0; i < koSockets.length; i += 1) await join(koSockets[i], koBout._id, String(judges[i]._id));
koSockets[0].emit(EVT.START_ROUND, { boutId: String(koBout._id), roundNo: 1 });

const koFinished = new Promise((r) => koSockets[2].once(EVT.BOUT_FINISHED, r));
koSockets[0].emit(EVT.FINISH, { boutId: String(koBout._id), method: 'Head KO', winnerCorner: 'red' });
const ko = await koFinished;
check('a KO ends the bout for everyone', ko.winner.corner === 'red' && ko.winner.method === 'Head KO',
  JSON.stringify(ko.winner));

// ---------- report ----------
console.log(`\n✅ ${ok.length} passed`);
ok.forEach((o) => console.log('   ✓', o));
if (bad.length) {
  console.log(`\n❌ ${bad.length} failed`);
  bad.forEach((b) => console.log('   ✗', b));
}

[...sockets, ...koSockets, supervisor].forEach((s) => s.close());
server.close();
await mongoose.disconnect();
if (mem) await mem.stop();
process.exit(bad.length ? 1 : 0);
