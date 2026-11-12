import http from 'node:http';
import env from './config/env.js';
import connectDB from './config/db.js';
import createApp from './app.js';
import initSockets from './sockets/index.js';
import { seedIfEmpty } from './utils/seed.js';

async function bootstrap() {
  await connectDB();

  /**
   * Seed a brand-new database on first boot.
   *
   * Render's free tier gives no shell, so there is no way to run `npm run seed`
   * against a fresh Atlas cluster. Without this the API comes up healthy, the
   * site renders, and every list is empty with nothing explaining why.
   *
   * It only ever touches a database with zero leagues, so it cannot overwrite
   * real event data. Set AUTO_SEED=false to turn it off.
   */
  if (process.env.AUTO_SEED !== 'false') {
    try {
      await seedIfEmpty();
    } catch (err) {
      // A seeding problem must never stop the API from serving.
      console.error('[scorehub] auto-seed failed:', err.message);
    }
  }

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);

  server.listen(env.port, () => {
    console.log(`[scorehub] API listening on port ${env.port} (${env.nodeEnv})`);
    console.log(
      `[scorehub] CORS origins: ${
        env.clientOrigin === true ? 'any (set CLIENT_ORIGIN to restrict)' : env.clientOrigin.join(', ')
      }`
    );
  });

  const shutdown = (signal) => {
    console.log(`\n[scorehub] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
