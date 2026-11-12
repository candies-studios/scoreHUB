import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import env from './config/env.js';

import leagueRoutes from './routes/league.routes.js';
import fighterRoutes from './routes/fighter.routes.js';
import officialRoutes from './routes/official.routes.js';
import boutRoutes from './routes/bout.routes.js';
import fightRoutes from './routes/fight.routes.js';
import { tournamentRouter, divisionRouter, registrationRouter } from './routes/tournament.routes.js';
import academyRoutes from './routes/academy.routes.js';
import athleteRoutes from './routes/athlete.routes.js';
import matchRoutes from './routes/match.routes.js';
import rankingRoutes from './routes/ranking.routes.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.use('/uploads', express.static(env.uploadsDir));

  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', service: 'scorehub', time: new Date().toISOString() })
  );

  app.use('/api/leagues', leagueRoutes);
  app.use('/api/fighters', fighterRoutes);
  app.use('/api/officials', officialRoutes);
  app.use('/api/bouts', boutRoutes);
  // Analytics layer — separate namespace so the judge endpoints are untouched.
  app.use('/api/fights', fightRoutes);

  // Tournament module — events, divisions, registration, brackets, mats, rankings.
  app.use('/api/tournaments', tournamentRouter);
  app.use('/api/divisions', divisionRouter);
  app.use('/api/registrations', registrationRouter);
  app.use('/api/academies', academyRoutes);
  app.use('/api/athletes', athleteRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/rankings', rankingRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
