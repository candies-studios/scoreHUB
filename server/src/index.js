import http from 'node:http';
import env from './config/env.js';
import connectDB from './config/db.js';
import createApp from './app.js';
import initSockets from './sockets/index.js';

async function bootstrap() {
  await connectDB();

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
