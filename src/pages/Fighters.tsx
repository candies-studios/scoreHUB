import { Link, useParams } from 'react-router-dom';
import { DataTable, ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/useApi';
import { useSession } from '@/lib/session';

export default function Fighters() {
  const { id = '' } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.fighters.listByLeague(id), [id]);
  const { run, pending } = useAction();

  if (loading) return <Loading label="Loading fighters…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const organiser = can('ADMIN', 'PROMOTER');

  async function remove(fighterId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this league?`)) return;
    await run(() => api.fighters.remove(fighterId));
    reload();
  }

  return (
    <DataTable
      title="Fighter List"
      backHref={`/leagues/${id}`}
      action={organiser ? { href: `/leagues/${id}/fighters/new`, label: 'Add Fighter' } : undefined}
      emptyMessage="No fighters on this league yet."
      columns={[
        { key: 'name', header: 'Fighter Name' },
        { key: 'team', header: 'Team' },
        { key: 'weight', header: 'Weight Class' },
        { key: 'record', header: 'Record' },
        ...(organiser
          ? [
              { key: 'edit', header: 'Edit' },
              { key: 'delete', header: 'Delete' },
            ]
          : []),
      ]}
      rows={(data ?? []).map((fighter) => ({
        id: fighter.id,
        cells: {
          name: fighter.name,
          team: fighter.team ?? '—',
          weight: fighter.weightClass ?? '—',
          record: fighter.record ?? '—',
          edit: (
            <Link
              to={`/leagues/${id}/fighters/${fighter.id}`}
              className="text-brand-300 hover:text-white"
            >
              Edit
            </Link>
          ),
          delete: (
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(fighter.id, fighter.name)}
              className="text-redCorner-text transition hover:text-white disabled:opacity-40"
            >
              Remove
            </button>
          ),
        },
      }))}
    />
  );
}
