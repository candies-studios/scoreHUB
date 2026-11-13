import { Link, useParams } from 'react-router-dom';
import { DataTable, ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSession } from '@/lib/session';
import type { BoutStatus } from '@/lib/types';

const STATUS_TONE: Record<BoutStatus, string> = {
  SCHEDULED: 'text-slate-300',
  LIVE: 'text-emerald-300',
  COMPLETED: 'text-brand-300',
  CANCELLED: 'text-redCorner-text',
};

export default function Bouts() {
  const { id = '' } = useParams<{ id: string }>();
  const { can, user } = useSession();
  const { data, error, loading, reload } = useApi(() => api.bouts.listByLeague(id), [id]);

  if (loading) return <Loading label="Loading bout card…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const organiser = can('ADMIN', 'PROMOTER');

  return (
    <DataTable
      title="Bout Card"
      backHref={`/leagues/${id}`}
      action={organiser ? { href: `/leagues/${id}/bouts/new`, label: 'Add Bout' } : undefined}
      emptyMessage="No bouts on this card yet."
      columns={[
        { key: 'no', header: 'Bout' },
        { key: 'matchup', header: 'Matchup' },
        { key: 'class', header: 'Class' },
        { key: 'rounds', header: 'Format' },
        { key: 'status', header: 'Status' },
        { key: 'score', header: 'Score' },
        ...(organiser ? [{ key: 'edit', header: 'Edit' }] : []),
      ]}
      rows={(data ?? []).map((bout) => {
        const seated =
          bout.judges?.some((j) => j.judgeId === user?.id) || bout.refereeId === user?.id;
        return {
          id: bout.id,
          cells: {
            no: `#${bout.boutNumber}`,
            matchup: `${bout.blueFighter?.name ?? 'TBC'} vs ${bout.redFighter?.name ?? 'TBC'}`,
            class: bout.boutName ?? bout.discipline,
            rounds: `${bout.totalRounds} × ${Math.round(bout.roundDuration / 60)} min`,
            status: <span className={STATUS_TONE[bout.status]}>{bout.status}</span>,
            score: (
              <Link
                to={
                  bout.status === 'COMPLETED' || !seated
                    ? `/bouts/${bout.id}/scoreboard`
                    : `/bouts/${bout.id}/score`
                }
                className="text-brand-300 hover:text-white"
              >
                {bout.status === 'COMPLETED' || !seated ? 'Scoreboard' : 'Memory Sheet'}
              </Link>
            ),
            edit: (
              <Link
                to={`/leagues/${id}/bouts/${bout.id}`}
                className="text-brand-300 hover:text-white"
              >
                Edit
              </Link>
            ),
          },
        };
      })}
    />
  );
}
