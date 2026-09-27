import { useEffect, useState } from 'react';
import { formatClock } from '@/lib/scoring';

/**
 * Counts up from the instant the round started, shared by every judge because
 * the start timestamp comes from the server rather than each browser.
 */
export function RoundTimer({
  startedAt,
  duration,
}: {
  startedAt: number | null;
  duration: number;
}) {
  // 0 until a round is running, so a stopped clock reads 00:00.
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt && now ? Math.floor((now - startedAt) / 1000) : 0;
  const overrun = elapsed > duration;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold tabular-nums ${
        overrun
          ? 'border-redCorner-border bg-redCorner-bg text-redCorner-text'
          : startedAt
            ? 'border-brand-300 bg-ink-800 text-slate-100'
            : 'border-ink-500 bg-ink-700 text-slate-400'
      }`}
      aria-live="off"
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 8v3.5l2 1.5M8 2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {formatClock(elapsed)}
      <span className="text-xs font-normal text-slate-400">/ {formatClock(duration)}</span>
    </div>
  );
}
