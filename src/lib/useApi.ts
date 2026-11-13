import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';
import { isUnauthorized, useSession } from './session';

/**
 * Loads data from the API and re-runs when `deps` change.
 *
 * A 401 means the session cookie is gone or was never sent, so the stored user
 * is cleared and the router sends the viewer back to sign-in.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const { handleUnauthorized } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          handleUnauthorized();
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The loader closure is recreated every render; `deps` is the real signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload };
}

/** Wraps a mutating call with pending + error state for form buttons. */
export function useAction() {
  const { handleUnauthorized } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        if (isUnauthorized(err)) {
          handleUnauthorized();
          return null;
        }
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
        return null;
      } finally {
        setPending(false);
      }
    },
    [handleUnauthorized],
  );

  return { run, pending, error, setError };
}
