import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repo-root .env first, then allow a server-local .env to override.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/scorehub',
  // `true` reflects whatever Origin the request carries; an array is an allowlist.
  // A bare '*' in the list means "any origin", which cors() expresses as `true`
  // rather than a literal '*' entry (an array is matched by exact string).
  clientOrigin: parseOrigins(process.env.CLIENT_ORIGIN),
  uploadsDir: path.resolve(__dirname, '../../uploads'),
};

export function parseOrigins(raw) {
  const list = (raw || '*')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, '')) // a trailing slash never matches an Origin header
    .filter(Boolean);

  if (list.length === 0 || list.includes('*')) return true;
  return list;
}

export default env;
