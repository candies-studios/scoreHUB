import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import League from '../models/League.js';
import Fighter from '../models/Fighter.js';
import Official from '../models/Official.js';
import Bout from '../models/Bout.js';
import Scorecard from '../models/Scorecard.js';
import { ensureScorecards } from './scoring.js';

const JUDGES = [
  { name: 'Sushil Chandanshive', contactNo: '9876543210', bloodGroup: 'B+' },
  { name: 'Ashutosh Malgaonkar', contactNo: '9876543211', bloodGroup: 'B+' },
  { name: 'Poonam Kadam', contactNo: '9876543212', bloodGroup: 'B-' },
];

const FIGHTERS = [
  {
    name: 'Arjun Mehra',
    nickname: 'The Storm',
    team: 'Crosstrain Fight Club',
    country: 'India',
    weightClass: 'Flyweight',
    weightKg: 56.7,
    record: { wins: 8, losses: 2, draws: 0 },
  },
  {
    name: 'Rohit Sharma',
    nickname: 'Iron',
    team: 'Evolve Combat',
    country: 'India',
    weightClass: 'Flyweight',
    weightKg: 56.4,
    record: { wins: 7, losses: 3, draws: 1 },
  },
  {
    name: 'Kabir Singh',
    nickname: 'Rampage',
    team: 'Tribe MMA',
    country: 'India',
    weightClass: 'Lightweight',
    weightKg: 70.3,
    record: { wins: 11, losses: 1, draws: 0 },
  },
  {
    name: 'Imran Qureshi',
    nickname: 'Bulldozer',
    team: 'Alpha Cage',
    country: 'India',
    weightClass: 'Lightweight',
    weightKg: 70.0,
    record: { wins: 9, losses: 4, draws: 0 },
  },
];

async function seed() {
  await connectDB();
  console.log('[seed] clearing existing data…');

  await Promise.all([
    League.deleteMany({}),
    Fighter.deleteMany({}),
    Official.deleteMany({}),
    Bout.deleteMany({}),
    Scorecard.deleteMany({}),
  ]);

  const league = await League.create({
    name: 'ScoreHub Championship 1',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    time: '19:30',
    location: 'Nerul, Navi Mumbai',
    promoter: 'Sanjivan',
    bouts: { proMMA: 4, amateurMMA: 2 },
  });

  const fighters = await Fighter.insertMany(
    FIGHTERS.map((f) => ({ ...f, league: league._id }))
  );

  const judges = await Official.insertMany(
    JUDGES.map((j) => ({ ...j, league: league._id, kind: 'judge' }))
  );

  const referee = await Official.create({
    league: league._id,
    kind: 'referee',
    name: 'Deepak Rane',
    contactNo: '9876500000',
  });

  const bouts = await Bout.create([
    {
      league: league._id,
      boutNo: 1,
      boutName: 'Flyweight',
      boutType: 'Professional',
      discipline: 'MMA',
      boutDate: league.date,
      ringNo: 1,
      totalRounds: 3,
      roundDurationSec: 300,
      blueCorner: { fighter: fighters[0]._id },
      redCorner: { fighter: fighters[1]._id },
      judges: judges.map((j) => j._id),
      referee: referee._id,
    },
    {
      league: league._id,
      boutNo: 2,
      boutName: 'Lightweight',
      boutType: 'Professional',
      discipline: 'MMA',
      boutDate: league.date,
      ringNo: 1,
      totalRounds: 3,
      roundDurationSec: 300,
      blueCorner: { fighter: fighters[2]._id },
      redCorner: { fighter: fighters[3]._id },
      judges: judges.map((j) => j._id),
      referee: referee._id,
    },
  ]);

  for (const bout of bouts) await ensureScorecards(bout._id);

  console.log(`[seed] league "${league.name}" with ${bouts.length} bouts and 3 judges ready.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
