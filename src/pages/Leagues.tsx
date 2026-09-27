import { Link } from 'react-router-dom';
import { DataTable, ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useApi, useAction } from '@/lib/useApi';
import { useSession } from '@/lib/session';

export default function Leagues({ filter }: { filter: 'upcoming' | 'past' }) {
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.leagues.list(filter), [filter]);
  const { run, pending } = useAction();

  if (loading) return <Loading label="Loading leagues…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const leagues = data ?? [];
  const isAdmin = can('ADMIN');

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" and everything on its card? This cannot be undone.`)) {
      return;
    }
    await run(() => api.leagues.remove(id));
    reload();
  }

  return (
    <DataTable
      title={filter === 'past' ? 'Past League' : 'Upcoming League'}
      backHref="/"
      action={can('ADMIN', 'PROMOTER') ? { href: '/leagues/new', label: 'Create League' } : undefined}
      emptyMessage={
        filter === 'past' ? 'No leagues have finished yet.' : 'No leagues are scheduled.'
      }
      columns={[
        { key: 'name', header: 'League Name' },
        { key: 'date', header: 'League Date' },
        { key: 'time', header: 'League Time' },
        { key: 'location', header: 'League Location' },
        { key: 'open', header: filter === 'past' ? 'View' : 'Edit' },
        ...(isAdmin ? [{ key: 'delete', header: 'Delete' }] : []),
      ]}
      rows={leagues.map((league) => ({
        id: league.id,
        cells: {
          name: league.name,
          date: formatDate(league.startsAt),
          time: formatTime(league.startsAt),
          location: league.location,
          open: (
            <Link to={`/leagues/${league.id}`} className="text-brand-300 hover:text-white">
              {filter === 'past' ? 'View' : 'Edit/View'}
            </Link>
          ),
          delete: (
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(league.id, league.name)}
              aria-label={`Delete ${league.name}`}
              className="text-redCorner-text transition hover:text-white disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M10 4h4M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ),
        },
      }))}
    />
  );
}
