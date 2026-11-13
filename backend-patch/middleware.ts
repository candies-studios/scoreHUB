import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the static client.
 *
 * Add this file at the ROOT of the ScoreHUB repo (next to package.json), not
 * inside src/. Without it the browser blocks every call the static site makes,
 * and the failure looks like the API being down.
 *
 * `Access-Control-Allow-Origin` must name an exact origin — the wildcard `*`
 * is rejected whenever credentials are included, and the session cookie is a
 * credential. Set ALLOWED_ORIGINS to a comma-separated list, e.g.
 *
 *   ALLOWED_ORIGINS=https://vchandanshive34.github.io,http://localhost:5173
 */

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    // Caches must not serve one origin's response to another.
    Vary: 'Origin',
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  // Preflight: answer before the route handler runs.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
