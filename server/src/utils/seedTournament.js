/**
 * Demo data for the tournament module:
 *   - 6 academies, 48 athletes
 *   - a finished event with drawn, fully played brackets (so results,
 *     medal tables, rankings and athlete profiles have something to show)
 *   - an upcoming event open for registration with partly-filled divisions
 *
 *   npm run seed:events      (leaves league/judge data alone)
 */
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Academy from '../models/Academy.js';
import Athlete from '../models/Athlete.js';
import Tournament from '../models/Tournament.js';
import Division from '../models/Division.js';
import Registration from '../models/Registration.js';
import Match from '../models/Match.js';
import { generateBracket, scheduleTournament, finishMatch } from './tournamentService.js';

const ACADEMIES = [
  { name: 'Crosstrain Fight Club', city: 'Mumbai', country: 'India', affiliation: 'Crosstrain' },
  { name: 'Evolve Combat', city: 'Pune', country: 'India', affiliation: 'Evolve' },
  { name: 'Tribe MMA', city: 'Bengaluru', country: 'India', affiliation: 'Tribe' },
  { name: 'Gracie Barra Delhi', city: 'New Delhi', country: 'India', affiliation: 'Gracie Barra' },
  { name: 'Alliance Hyderabad', city: 'Hyderabad', country: 'India', affiliation: 'Alliance' },
  { name: 'Checkmat Goa', city: 'Panaji', country: 'India', affiliation: 'Checkmat' },
];

const FIRST = ['Arjun', 'Rohit', 'Kabir', 'Vikram', 'Aditya', 'Rahul', 'Karan', 'Ishaan', 'Dev', 'Nikhil', 'Sahil', 'Yash',
  'Aman', 'Varun', 'Pranav', 'Rohan', 'Siddharth', 'Manav', 'Neel', 'Tanmay'];
const FIRST_F = ['Ananya', 'Priya', 'Sneha', 'Kavya', 'Meera', 'Riya', 'Tara', 'Ishita'];
const LAST = ['Mehra', 'Sharma', 'Singh', 'Patil', 'Iyer', 'Reddy', 'Nair', 'Kulkarni', 'Desai', 'Rao', 'Joshi', 'Bose'];

const pick = (arr, i) => arr[i % arr.length];
const SUBS = ['Armbar', 'Rear naked choke', 'Triangle', 'Kimura', 'Guillotine', 'Heel hook', 'Bow and arrow'];

async function main() {
  await connectDB();
  await Promise.all([Academy, Athlete, Tournament, Division, Registration, Match].map((M) => M.deleteMany({})));

  const academies = await Academy.create(ACADEMIES);

  const athletes = [];
  for (let i = 0; i < 40; i += 1) {
    athletes.push({
      firstName: pick(FIRST, i),
      lastName: pick(LAST, i * 7 + 3),
      gender: 'male',
      belt: i < 20 ? 'blue' : 'white',
      birthYear: 1990 + (i % 12),
      weightKg: i % 2 ? 74 : 86,
      country: 'India',
      academy: academies[i % academies.length]._id,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    athletes.push({
      firstName: pick(FIRST_F, i),
      lastName: pick(LAST, i * 5 + 1),
      gender: 'female',
      belt: 'white',
      birthYear: 1994 + (i % 8),
      weightKg: 58,
      country: 'India',
      academy: academies[(i + 2) % academies.length]._id,
    });
  }
  const people = await Athlete.create(athletes);
  const men = people.filter((p) => p.gender === 'male');
  const women = people.filter((p) => p.gender === 'female');

  const day = 86400000;
  const now = Date.now();

  // ---------------- finished event ----------------
  const past = await Tournament.create({
    name: 'Western India BJJ Championship',
    sport: 'bjj',
    startDate: new Date(now - 30 * day),
    endDate: new Date(now - 30 * day),
    venue: 'NSCI Dome',
    city: 'Mumbai',
    country: 'India',
    organizer: 'ScoreHub Events',
    description: 'IBJJF-style gi championship. Single elimination, double bronze.',
    mats: 3,
    matchDurationSec: 300,
    fee: { amount: 1500, currency: 'INR' },
    status: 'completed',
  });

  const pastDivs = await Division.create([
    { tournament: past._id, ageGroup: 'Adult', gender: 'male', belt: 'blue', weightClass: '-76 kg', maxWeightKg: 76 },
    { tournament: past._id, ageGroup: 'Adult', gender: 'male', belt: 'blue', weightClass: '-88 kg', maxWeightKg: 88 },
    { tournament: past._id, ageGroup: 'Adult', gender: 'male', belt: 'white', weightClass: '-76 kg', maxWeightKg: 76 },
    { tournament: past._id, ageGroup: 'Adult', gender: 'female', belt: 'white', weightClass: '-64 kg', maxWeightKg: 64 },
  ]);

  const enter = (t, div, list) =>
    Registration.create(
      list.map((a) => ({ tournament: t._id, division: div._id, athlete: a._id, academy: a.academy, paid: true, checkedIn: true, weighedIn: true }))
    );

  await enter(past, pastDivs[0], men.filter((a) => a.belt === 'blue' && a.weightKg === 74));
  await enter(past, pastDivs[1], men.filter((a) => a.belt === 'blue' && a.weightKg === 86));
  await enter(past, pastDivs[2], men.filter((a) => a.belt === 'white' && a.weightKg === 74).slice(0, 7));
  await enter(past, pastDivs[3], women.slice(0, 4));

  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const d of pastDivs) await generateBracket(d._id, { random: rnd });
  await scheduleTournament(past._id);

  // Play every match with plausible scores.
  for (let guard = 0; guard < 50; guard += 1) {
    const ready = await Match.find({ tournament: past._id, status: 'ready' });
    if (!ready.length) break;
    for (const m of ready) {
      const r = rnd();
      if (r < 0.35) {
        await finishMatch(m._id, { winner: rnd() < 0.5 ? 'a' : 'b', method: 'submission', submissionType: pick(SUBS, Math.floor(rnd() * 100)) });
      } else {
        const a = { points: Math.floor(rnd() * 5) * 2, advantages: Math.floor(rnd() * 3), penalties: Math.floor(rnd() * 2) };
        const b = { points: Math.floor(rnd() * 5) * 2, advantages: Math.floor(rnd() * 3), penalties: Math.floor(rnd() * 2) };
        if (a.points === b.points && a.advantages === b.advantages && a.penalties === b.penalties) a.advantages += 1;
        m.score = { a, b };
        m.clock = { running: false, startedAt: null, elapsedMs: 300000 };
        m.startedAt = new Date(past.startDate.getTime() + 3600000);
        await m.save();
        await finishMatch(m._id, { method: 'points' });
      }
    }
  }

  // ---------------- upcoming event ----------------
  const next = await Tournament.create({
    name: 'ScoreHub Open Grappling Series — Pune',
    sport: 'bjj',
    startDate: new Date(now + 21 * day),
    endDate: new Date(now + 22 * day),
    venue: 'Shree Shiv Chhatrapati Sports Complex',
    city: 'Pune',
    country: 'India',
    organizer: 'ScoreHub Events',
    description: 'Gi and No-Gi divisions for white to brown belts. Weigh-in on the day, in uniform.',
    rules: 'IBJJF rules. Adult matches 5 minutes. Heel hooks allowed for brown belts in No-Gi only.',
    registrationOpens: new Date(now - 7 * day),
    registrationCloses: new Date(now + 18 * day),
    mats: 4,
    matchDurationSec: 300,
    fee: { amount: 1800, currency: 'INR' },
    status: 'registration',
  });

  const upDivs = [];
  for (const uniform of ['gi', 'nogi'])
    for (const belt of ['white', 'blue'])
      for (const [weightClass, maxWeightKg] of [['-76 kg', 76], ['-88 kg', 88]])
        upDivs.push({ tournament: next._id, ageGroup: 'Adult', gender: 'male', belt, weightClass, maxWeightKg, uniform });
  upDivs.push({ tournament: next._id, ageGroup: 'Adult', gender: 'female', belt: 'white', weightClass: '-64 kg', maxWeightKg: 64, uniform: 'gi' });
  const created = await Division.create(upDivs);

  const giWhite76 = created.find((d) => d.uniform === 'gi' && d.belt === 'white' && d.maxWeightKg === 76);
  const giBlue88 = created.find((d) => d.uniform === 'gi' && d.belt === 'blue' && d.maxWeightKg === 88);
  await enter(next, giWhite76, men.filter((a) => a.belt === 'white' && a.weightKg === 74).slice(0, 5));
  await enter(next, giBlue88, men.filter((a) => a.belt === 'blue' && a.weightKg === 86).slice(0, 6));
  await Registration.updateMany({ tournament: next._id }, { $set: { checkedIn: false, weighedIn: false, paid: false } });

  console.log(`[seed:events] ${academies.length} academies, ${people.length} athletes`);
  console.log(`[seed:events] finished event: ${past.name} (${pastDivs.length} divisions, all played)`);
  console.log(`[seed:events] upcoming event: ${next.name} (${created.length} divisions, registration open)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
