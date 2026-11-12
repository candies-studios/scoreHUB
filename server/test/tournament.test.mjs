/**
 * End-to-end test of the tournament module: create an event, divisions,
 * register athletes, draw brackets, schedule mats, score a match live over
 * the socket, finish every match and check podiums, medal table and rankings.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/scorehub_tournament_test node test/tournament.test.mjs
 */
import mongoose from 'mongoose';
import http from 'node:http';
import { io } from 'socket.io-client';

const PORT = 5098;
const BASE = `http://127.0.0.1:${PORT}`;

let mem = null;
let uri = process.env.MONGO_TEST_URI;
if (!uri) {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mem = await MongoMemoryServer.create();
    uri = mem.getUri('scorehub_tournament_test');
  } catch {
    console.error('No MongoDB available. Set MONGO_TEST_URI, or install mongodb-memory-server.');
    process.exit(2);
  }
}
process.env.NODE_ENV = 'test';

const ok = [];
const bad = [];
const check = (label, cond, extra = '') => (cond ? ok.push(label) : bad.push(`${label} — ${extra}`));

const connectDB = (await import('../src/config/db.js')).default;
const createApp = (await import('../src/app.js')).default;
const initSockets = (await import('../src/sockets/index.js')).default;
const { MAT_EVT } = await import('../src/sockets/matHandlers.js');

await connectDB(uri);
await mongoose.connection.db.dropDatabase();

const app = createApp();
const server = http.createServer(app);
app.set('io', initSockets(server));
await new Promise((r) => server.listen(PORT, r));

const call = async (method, path, body) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

try {
  // ---------- event ----------
  const today = new Date();
  const { data: event, status: s1 } = await call('POST', '/tournaments', {
    name: 'Mumbai Open', sport: 'bjj', startDate: new Date(today.getTime() + 86400000 * 7),
    city: 'Mumbai', mats: 2, matchDurationSec: 300, fee: { amount: 1500, currency: 'INR' },
  });
  check('create tournament', s1 === 201 && event._id, JSON.stringify(event));
  check('registration open by default', event.registrationOpen === true);

  const gen = await call('POST', `/tournaments/${event._id}/divisions/generate`, {
    genders: ['male'], ageGroups: ['Adult'], belts: ['blue', 'white'],
    weights: [{ label: '-76 kg', maxKg: 76 }, { label: '-88 kg', maxKg: 88 }],
  });
  check('generate 4 divisions from a template', gen.data.created === 4, JSON.stringify(gen.data));
  const again = await call('POST', `/tournaments/${event._id}/divisions/generate`, {
    genders: ['male'], ageGroups: ['Adult'], belts: ['blue'], weights: [{ label: '-76 kg', maxKg: 76 }],
  });
  check('generator skips existing divisions', again.data.created === 0);

  const { data: divisions } = await call('GET', `/tournaments/${event._id}/divisions`);
  const blue76 = divisions.find((d) => d.name === 'Adult / Male / Blue / -76 kg / Gi');
  const white88 = divisions.find((d) => d.belt === 'white' && d.maxWeightKg === 88);
  check('division names are generated', Boolean(blue76), divisions.map((d) => d.name).join(' | '));

  // ---------- registration ----------
  const academies = ['Alpha BJJ', 'Beta Grappling', 'Gamma MMA'];
  const regIds = [];
  for (let i = 0; i < 7; i += 1) {
    const r = await call('POST', `/tournaments/${event._id}/registrations`, {
      division: blue76._id,
      newAthlete: {
        firstName: `Blue${i + 1}`, lastName: 'Test', gender: 'male', belt: 'blue',
        birthYear: 1995, weightKg: 74, academyName: academies[i % 3],
      },
    });
    if (r.status !== 201) bad.push(`register blue ${i} — ${JSON.stringify(r.data)}`);
    regIds.push(r.data._id);
  }
  check('7 athletes registered in blue -76', regIds.filter(Boolean).length === 7);
  const { data: acs } = await call('GET', '/academies');
  check('academies auto-created and reused by name', acs.length === 3, acs.map((a) => a.name).join(','));

  const wrongBelt = await call('POST', `/tournaments/${event._id}/registrations`, {
    division: white88._id,
    newAthlete: { firstName: 'Purple', lastName: 'Guy', gender: 'male', belt: 'purple' },
  });
  check('belt mismatch is rejected', wrongBelt.status === 400, JSON.stringify(wrongBelt.data));

  const female = await call('POST', `/tournaments/${event._id}/registrations`, {
    division: white88._id,
    newAthlete: { firstName: 'Ana', lastName: 'W', gender: 'female', belt: 'white' },
  });
  check('gender mismatch is rejected', female.status === 400);
  const { data: allAthletes } = await call('GET', '/athletes');
  check('rejected entries leave no orphan athlete profiles', allAthletes.length === 7, String(allAthletes.length));

  for (let i = 0; i < 3; i += 1) {
    await call('POST', `/tournaments/${event._id}/registrations`, {
      division: white88._id,
      newAthlete: { firstName: `White${i + 1}`, lastName: 'Test', gender: 'male', belt: 'white', academyName: academies[i] },
    });
  }

  const dup = await call('POST', `/tournaments/${event._id}/registrations`, {
    division: blue76._id,
    athlete: (await call('GET', `/tournaments/${event._id}/registrations?division=${blue76._id}`)).data[0].athlete._id,
  });
  check('duplicate registration is refused', dup.status === 409, JSON.stringify(dup.data));

  const w = await call('PATCH', `/registrations/${regIds[0]}`, { checkedIn: true, weighedIn: true, weighInKg: 77.2, paid: true });
  check('weigh-in over the limit is flagged', /over the 76 kg limit/.test(w.data.warning || ''), JSON.stringify(w.data));

  // ---------- brackets ----------
  const all = await call('POST', `/tournaments/${event._id}/brackets`);
  check('draw all: two divisions drawn, two skipped (empty)', all.data.drawn.length === 2 && all.data.skipped.length === 2,
    JSON.stringify(all.data));

  const { data: b1 } = await call('GET', `/divisions/${blue76._id}/bracket`);
  check('7 athletes → 8-slot elimination, 7 matches, 1 bye', b1.matches.length === 7 && b1.matches.filter((m) => m.isBye).length === 1,
    `${b1.matches.length} / ${b1.matches.filter((m) => m.isBye).length}`);
  check('division resolved as single elimination', b1.division.resolvedBracketType === 'single_elim');

  const { data: b2 } = await call('GET', `/divisions/${white88._id}/bracket`);
  check('3 athletes → round robin with 3 matches', b2.division.resolvedBracketType === 'round_robin' && b2.matches.length === 3);

  const late = await call('POST', `/tournaments/${event._id}/registrations`, {
    division: blue76._id,
    newAthlete: { firstName: 'Late', lastName: 'Comer', gender: 'male', belt: 'blue' },
  });
  check('registration after the draw is refused', late.status === 409);

  // ---------- schedule ----------
  const { data: sched } = await call('POST', `/tournaments/${event._id}/schedule`);
  const matsUsed = sched.mats.filter((m) => m.matches.length).length;
  check('schedule spreads divisions over both mats', matsUsed === 2, JSON.stringify(sched.mats.map((m) => m.matches.length)));
  const total = sched.mats.reduce((n, m) => n + m.matches.length, 0);
  check('schedule lists every non-bye match', total === 6 + 3, String(total));
  const mat1 = sched.mats[0].matches;
  check('mat order runs early rounds first', mat1.every((m, i) => i === 0 || mat1[i - 1].round <= m.round));

  // ---------- live scoreboard over the socket ----------
  const first = b1.matches.find((m) => m.status === 'ready' && m.round === 1);
  const sock = io(BASE, { transports: ['websocket'] });
  const display = io(BASE, { transports: ['websocket'] });
  await Promise.all([sock, display].map((s) => new Promise((r) => s.on('connect', r))));
  const emit = (s, evt, payload) => new Promise((r) => s.emit(evt, payload, r));

  const joined = await new Promise((r) => {
    display.once(MAT_EVT.STATE, r);
    display.emit(MAT_EVT.JOIN, { matchId: first._id });
  });
  check('display receives match state on join', String(joined._id) === String(first._id));

  const seen = new Promise((r) => display.once(MAT_EVT.STATE, r));
  await emit(sock, MAT_EVT.CLOCK, { matchId: first._id, action: 'start' });
  const live = await seen;
  check('clock start makes the match live for every screen', live.status === 'live' && live.clock.running);

  await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'a', field: 'points', delta: 2 });
  await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'b', field: 'points', delta: 2 });
  const adv = await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'b', field: 'advantages', delta: 1 });
  check('score + advantage recorded', adv.match.score.b.points === 2 && adv.match.score.b.advantages === 1, JSON.stringify(adv));
  check('leader is computed (b on advantages)', adv.match.leader.leader === 'b' && adv.match.leader.method === 'advantages');

  const neg = await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'a', field: 'penalties', delta: -1 });
  check('scores never go below zero', neg.ok && neg.match.score.a.penalties === 0);
  const tooBig = await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'a', field: 'points', delta: 10 });
  check('absurd deltas are rejected', tooBig.ok === false);

  const fin = await emit(sock, MAT_EVT.FINISH, { matchId: first._id, method: 'points' });
  check('finish by scoreboard → b wins on advantages', fin.ok && fin.match.method === 'advantages' &&
    String(fin.match.winner._id) === String(fin.match.b._id), JSON.stringify(fin.match?.method));

  const nextOf = (await call('GET', `/divisions/${blue76._id}/bracket`)).data.matches.find((m) => m.key === first.nextKey);
  const slot = first.nextSlot;
  check('winner advanced into the next match', String(nextOf[slot]?._id) === String(fin.match.winner._id));

  const again2 = await emit(sock, MAT_EVT.SCORE, { matchId: first._id, side: 'a', field: 'points', delta: 2 });
  check('a finished match cannot be scored', again2.ok === false);

  const reopen = await call('POST', `/matches/${first._id}/reopen`);
  check('reopen undoes the advancement', reopen.status === 200 && reopen.data.status === 'ready', JSON.stringify(reopen.data.status));
  const nextAfter = (await call('GET', `/divisions/${blue76._id}/bracket`)).data.matches.find((m) => m.key === first.nextKey);
  check('next match slot cleared after reopen', !nextAfter[slot]);

  // ---------- play every remaining match via REST ----------
  for (const divId of [blue76._id, white88._id]) {
    for (let guard = 0; guard < 20; guard += 1) {
      const { data } = await call('GET', `/divisions/${divId}/bracket`);
      const ready = data.matches.filter((m) => m.status === 'ready' || m.status === 'live');
      if (!ready.length) break;
      for (const m of ready) {
        const r = await call('POST', `/matches/${m._id}/result`, { winner: 'a', method: 'submission', submissionType: 'Armbar' });
        if (r.status !== 200) bad.push(`finish ${m.key} — ${JSON.stringify(r.data)}`);
      }
    }
  }

  const { data: done1 } = await call('GET', `/divisions/${blue76._id}/bracket`);
  check('elimination division completes', done1.division.status === 'completed', done1.division.status);
  check('elimination podium has 1 gold, 1 silver, 2 bronze',
    done1.podium.map((p) => p.place).sort().join('') === '1233', JSON.stringify(done1.podium.map((p) => p.place)));
  check('podium carries athlete names', done1.podium.every((p) => p.athlete.firstName));

  const { data: done2 } = await call('GET', `/divisions/${white88._id}/bracket`);
  check('round robin podium has 3 places', done2.podium.length === 3, JSON.stringify(done2.podium));

  const { data: results } = await call('GET', `/tournaments/${event._id}/results`);
  const medals = results.academies.reduce((n, a) => n + a.gold + a.silver + a.bronze, 0);
  check('medal table counts every podium (4 + 3)', medals === 7, String(medals));
  check('academy points use 9/3/1', results.academies.reduce((n, a) => n + a.points, 0) === 9 + 3 + 1 + 1 + 9 + 3 + 1);

  const { data: rank } = await call('GET', '/rankings/athletes?sport=bjj');
  check('athlete ranking lists medallists, champion first', rank.length === 7 && rank[0].points === 9 && rank[0].athlete.name,
    JSON.stringify(rank.slice(0, 2)));
  const { data: arank } = await call('GET', '/rankings/academies');
  check('academy ranking is ordered by points', arank.every((r, i) => i === 0 || arank[i - 1].points >= r.points));

  const champ = rank[0].athlete._id;
  const { data: profile } = await call('GET', `/athletes/${champ}`);
  check('athlete profile shows a gold and a winning record', profile.medals[0]?.place === 1 && profile.record.wins >= 1,
    JSON.stringify({ medals: profile.medals, record: profile.record }));
  check('athlete history lists submission wins', profile.history.some((h) => h.won && h.method === 'submission'));

  const { data: acad } = await call('GET', `/academies/${acs[0]._id}`);
  check('academy profile lists its athletes', acad.athletes.length >= 3, String(acad.athletes.length));

  const { data: upcoming } = await call('GET', '/tournaments?scope=upcoming');
  check('event is listed as upcoming with a registration count', upcoming[0]?.registrationCount === 10, JSON.stringify(upcoming[0]?.registrationCount));

  const redraw = await call('POST', `/divisions/${blue76._id}/bracket`);
  check('redraw after play needs force', redraw.status === 409);

  const del = await call('DELETE', `/tournaments/${event._id}`);
  const left = await mongoose.connection.db.collection('matches').countDocuments();
  check('deleting the event removes its matches', del.status === 200 && left === 0);

  sock.close();
  display.close();
} catch (err) {
  bad.push(`crashed — ${err.stack}`);
}

console.log(`\n✅ tournament: ${ok.length} passed`);
ok.forEach((o) => console.log('   ✓', o));
if (bad.length) {
  console.log(`\n❌ ${bad.length} failed`);
  bad.forEach((b) => console.log('   ✗', b));
}
server.close();
await mongoose.disconnect();
if (mem) await mem.stop();
process.exit(bad.length ? 1 : 0);
