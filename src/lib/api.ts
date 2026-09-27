import { API_URL, IS_DEMO } from './config';
import { demoApi } from './demoBackend';
import type {
  Bout,
  BoutInput,
  Fighter,
  FighterInput,
  League,
  LeagueInput,
  SessionUser,
  User,
  UserInput,
} from './types';

/**
 * Typed client for the ScoreHUB API.
 *
 * Every call sends the session cookie (`credentials: 'include'`), so the API
 * must answer with `Access-Control-Allow-Credentials: true` and an explicit
 * origin — see README, "What the backend needs". The API wraps every response
 * as `{ ok: true, data }` or `{ ok: false, error, details }`.
 */

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

async function request<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { body, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...rest.headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    // A CORS rejection and an offline backend look identical from here.
    throw new ApiError(
      `Cannot reach the ScoreHUB API at ${API_URL}. Check it is running and that this origin is allowed by its CORS settings.`,
      0,
    );
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok === false) {
    const message =
      payload && payload.ok === false ? payload.error : `Request failed (${response.status})`;
    const details = payload && payload.ok === false ? payload.details : undefined;
    throw new ApiError(message, response.status, details);
  }

  return payload.data;
}

const liveApi = {
  auth: {
    /**
     * Officials available to sign in as.
     *
     * The Next.js login page read these straight from the database in a server
     * component. A static client has no such route, so it needs a public
     * endpoint — see README, "What the backend needs". Until that exists this
     * throws and the sign-in screen falls back to entering an id by hand.
     */
    officials: () => request<User[]>('/api/auth/officials'),
    /** Passwordless: the official picks their own name at the cage. */
    signIn: (userId: string) =>
      request<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: { userId } }),
    signOut: () => request<{ signedOut: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  users: {
    list: (role?: string) =>
      request<User[]>(`/api/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
    create: (input: UserInput) => request<User>('/api/users', { method: 'POST', body: input }),
    update: (id: string, input: UserInput) =>
      request<User>(`/api/users/${id}`, { method: 'PUT', body: input }),
    deactivate: (id: string) =>
      request<{ deactivated: string }>(`/api/users/${id}`, { method: 'DELETE' }),
  },

  leagues: {
    list: (filter?: 'upcoming' | 'past') =>
      request<League[]>(`/api/leagues${filter ? `?filter=${filter}` : ''}`),
    get: (id: string) => request<League>(`/api/leagues/${id}`),
    create: (input: LeagueInput) =>
      request<League>('/api/leagues', { method: 'POST', body: input }),
    update: (id: string, input: LeagueInput) =>
      request<League>(`/api/leagues/${id}`, { method: 'PUT', body: input }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/api/leagues/${id}`, { method: 'DELETE' }),
  },

  fighters: {
    listByLeague: (leagueId: string) => request<Fighter[]>(`/api/leagues/${leagueId}/fighters`),
    get: (id: string) => request<Fighter>(`/api/fighters/${id}`),
    create: (leagueId: string, input: FighterInput) =>
      request<Fighter>(`/api/leagues/${leagueId}/fighters`, { method: 'POST', body: input }),
    update: (id: string, input: FighterInput) =>
      request<Fighter>(`/api/fighters/${id}`, { method: 'PUT', body: input }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/api/fighters/${id}`, { method: 'DELETE' }),
  },

  bouts: {
    listByLeague: (leagueId: string) => request<Bout[]>(`/api/leagues/${leagueId}/bouts`),
    get: (id: string) => request<Bout>(`/api/bouts/${id}`),
    create: (leagueId: string, input: BoutInput) =>
      request<Bout>(`/api/leagues/${leagueId}/bouts`, { method: 'POST', body: input }),
    update: (id: string, input: BoutInput) =>
      request<Bout>(`/api/bouts/${id}`, { method: 'PUT', body: input }),
    remove: (id: string) => request<{ deleted: string }>(`/api/bouts/${id}`, { method: 'DELETE' }),
    start: (id: string) => request<Bout>(`/api/bouts/${id}/start`, { method: 'POST' }),
    submitRound: (
      id: string,
      input: { roundNumber: number; tally: unknown; blueScore: number; redScore: number },
    ) =>
      request<{ roundComplete: boolean; outcome: { summary: string } | null }>(
        `/api/bouts/${id}/rounds`,
        { method: 'POST', body: input },
      ),
    finish: (
      id: string,
      input: {
        resultType: string;
        winnerCorner?: 'BLUE' | 'RED' | null;
        endRound?: number;
        endTimeSec?: number;
        note?: string | null;
      },
    ) => request<{ summary: string }>(`/api/bouts/${id}/finish`, { method: 'POST', body: input }),
  },

  health: () => request<unknown>('/api/health'),
};

/**
 * One object, two implementations. Screens import `api` and never know which
 * is behind it, so the demo exercises the same code paths as production.
 */
export const api = (IS_DEMO ? (demoApi as unknown as typeof liveApi) : liveApi);
