import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { buildJudgeCards } from '@/lib/cards';
import { decideBout, totalCard } from '@/lib/scoring';
import { useApi } from '@/lib/useApi';
import { useSession } from '@/lib/session';
import { useBoutSocket } from '@/lib/useBoutSocket';

/**
 * The combined card, readable by anyone signed in.
 *
 * Totals are computed with the same functions the API uses, so the number on
 * the wall and the number written to the database can never disagree.
 */
export default function Scoreboard() {
  const { boutId = '' } = useParams<{ boutId: string }>();
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(() => api.bouts.get(boutId), [boutId]);

  const socket = useBoutSocket(
    user && data
      ? {
          boutId,
          userId: `${user.id}:viewer`,
          name: user.name,
          role: 'VIEWER',
          expectedJudges: data.judges?.length ?? 3,
          roundDuration: data.roundDuration,
          currentRound: data.currentRound || 1,
        }
      : null,
  );

  // A round locking or the bout finishing means new numbers to fetch.
  const lockSignal = `${socket.round}:${socket.roundLocked}:${socket.finished?.resultType ?? ''}`;
  useEffect(() => {
    reload();
  }, [lockSignal, reload]);

  if (loading) return <Loading label="Loading scoreboard…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <ErrorNote message="Bout not found." />;

  const seats = (data.judges ?? []).map((j) => ({
    judgeId: j.judgeId,
    seat: j.seat,
    judge: { name: j.judge?.name ?? 'Judge' },
  }));
  const submitted = (data.roundScores ?? []).filter((r) => r.submitted);
  const cards = buildJudgeCards(seats, submitted);
  const totals = cards.map(totalCard);
  const outcome = data.status === 'COMPLETED' ? decideBout(cards) : null;

  const rounds = Array.from({ length: data.totalRounds }, (_, i) => i + 1);
  const blueName = data.blueFighter?.name ?? 'Blue corner';
  const redName = data.redFighter?.name ?? 'Red corner';

  return (
    <section className="py-6">
      <h1 className="mb-6 text-center text-base font-semibold text-slate-200">Scoreboard</h1>

      <div className="ss-card">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-blueCorner-text">
              Blue
            </p>
            <p className="text-2xl font-bold text-white">{blueName}</p>
          </div>
          <p className="text-center text-sm text-slate-400">
            Bout #{data.boutNumber} · {data.boutName ?? data.discipline}
            <br />
            {data.status === 'COMPLETED'
              ? 'Final'
              : `Round ${data.currentRound || 1} of ${data.totalRounds}`}
          </p>
          <div className="text-center sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-redCorner-text">
              Red
            </p>
            <p className="text-2xl font-bold text-white">{redName}</p>
          </div>
        </div>

        {outcome && (
          <p className="mt-6 rounded-xl border border-brand-500/40 bg-brand-900/30 px-4 py-3 text-center text-sm font-semibold text-brand-200">
            {data.resultNote ?? outcome.summary}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-2 text-center text-sm tabular-nums">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400">
              <th className="text-left font-medium">Judge</th>
              {rounds.map((r) => (
                <th key={r} className="font-medium">
                  R{r}
                </th>
              ))}
              <th className="font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const total = totals.find((t) => t.judgeId === card.judgeId);
              return (
                <tr key={card.judgeId}>
                  <td className="rounded-l-xl bg-ink-700 px-4 py-3 text-left font-medium text-slate-200">
                    Seat {card.seat} · {card.judgeName}
                  </td>
                  {rounds.map((r) => {
                    const row = card.rounds.find((x) => x.roundNumber === r);
                    return (
                      <td key={r} className="bg-ink-700 px-2 py-3 text-slate-200">
                        {row ? (
                          <span>
                            <span className="text-blueCorner-text">{row.blue}</span>
                            <span className="text-slate-500"> – </span>
                            <span className="text-redCorner-text">{row.red}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="rounded-r-xl bg-ink-600 px-4 py-3 font-semibold">
                    <span className="text-blueCorner-text">{total?.blue ?? 0}</span>
                    <span className="text-slate-500"> – </span>
                    <span className="text-redCorner-text">{total?.red ?? 0}</span>
                  </td>
                </tr>
              );
            })}
            {cards.length === 0 && (
              <tr>
                <td colSpan={rounds.length + 2} className="py-10 text-slate-400">
                  No judges are seated on this bout yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        {socket.connected ? 'Live — updates as each round locks.' : 'Not connected to the realtime server.'}
      </p>

      <div className="mt-8 flex justify-between">
        <Link to={`/leagues/${data.leagueId}/bouts`} className="ss-btn-ghost">
          Back to the card
        </Link>
        <button type="button" className="ss-btn-ghost" onClick={reload}>
          Refresh
        </button>
      </div>
    </section>
  );
}
