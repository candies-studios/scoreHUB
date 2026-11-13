import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { API_URL, IS_DEMO } from '@/lib/config';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Role, User } from '@/lib/types';

const ROLE_ORDER: Role[] = ['ADMIN', 'PROMOTER', 'REFEREE', 'JUDGE'];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  PROMOTER: 'Promoter',
  JUDGE: 'Judge',
  REFEREE: 'Referee',
};

/**
 * Sign in by choosing yourself.
 *
 * There is no password — at a live event the three judges are handed tablets
 * and pick their own name. The id still has to match a real, active user, so
 * every role check on the server keeps working.
 */
export default function Login() {
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [officials, setOfficials] = useState<User[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.auth
      .officials()
      .then((list) => {
        if (!cancelled) setOfficials(list.filter((u) => u.active !== false));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOfficials([]);
        setListError(
          err instanceof ApiError && err.status === 0
            ? err.message
            : 'The officials list is not published by this API yet — enter an id below, or add the /api/auth/officials route described in the README.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  async function choose(userId: string) {
    if (!userId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(userId.trim());
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    people: (officials ?? []).filter((u) => u.role === role),
  })).filter((g) => g.people.length > 0);

  return (
    <div className="ss-spotlight flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Logo size="lg" tagline />

      <div className="ss-card mt-10 w-full max-w-2xl">
        <h1 className="text-center text-lg font-bold text-white">Who is scoring?</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Pick your name. Your scorecards are recorded against it.
        </p>

        {officials === null && (
          <p className="py-10 text-center text-sm text-slate-400">Loading officials…</p>
        )}

        {grouped.map((group) => (
          <div key={group.role} className="mt-7">
            <p className="ss-label">{ROLE_LABEL[group.role]}</p>
            <div className="flex flex-wrap gap-3">
              {group.people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(person.id)}
                  className="ss-btn-ghost"
                >
                  {person.name}
                </button>
              ))}
            </div>
          </div>
        ))}

        {listError && (
          <div className="mt-7 rounded-xl border border-ink-500 bg-ink-700 p-4">
            <p className="text-xs text-amber-300">{listError}</p>
            <div className="mt-4 flex gap-3">
              <input
                className="ss-input"
                placeholder="Paste a user id"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') choose(manualId);
                }}
              />
              <button
                type="button"
                className="ss-btn-primary shrink-0"
                disabled={busy || !manualId.trim()}
                onClick={() => choose(manualId)}
              >
                Sign in
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-6 text-center text-sm font-medium text-redCorner-text">
            {error}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          {IS_DEMO ? 'Demo data — pick any name to explore' : `Connected to ${API_URL}`}
        </p>
      </div>
    </div>
  );
}
