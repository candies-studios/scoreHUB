import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api } from './api';
import type { Role, SessionUser } from './types';

/**
 * Who is signed in.
 *
 * The server holds the real session in an httpOnly cookie the browser cannot
 * read, so the client keeps a copy of the chosen official here purely to draw
 * the UI. The cookie remains the only thing the API trusts: if the two ever
 * disagree, the API answers 401 and `handleUnauthorized` clears this copy.
 */

const STORAGE_KEY = 'scorehub.session';

function readStored(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeStored(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage — the session simply ends on reload.
  }
}

interface SessionValue {
  user: SessionUser | null;
  signIn: (userId: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  /** Called by data hooks when the API rejects the cookie. */
  handleUnauthorized: () => void;
  can: (...roles: Role[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStored);

  const signIn = useCallback(async (userId: string) => {
    const { user: signedIn } = await api.auth.signIn(userId);
    writeStored(signedIn);
    setUser(signedIn);
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.signOut();
    } catch {
      // Clearing locally matters more than the server acknowledging it.
    }
    writeStored(null);
    setUser(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    writeStored(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    [user],
  );

  const value = useMemo(
    () => ({ user, signIn, signOut, handleUnauthorized, can }),
    [user, signIn, signOut, handleUnauthorized, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
