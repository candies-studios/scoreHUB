import { useParams } from 'react-router-dom';
import { DataTable, ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';

/**
 * Who is working this league — every judge seat and referee assigned across
 * the card, so the promoter can see coverage at a glance before the doors open.
 */
export default function Officials() {
  const { id = '' } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi(() => api.bouts.listByLeague(id), [id]);

  if (loading) return <Loading label="Loading officials…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const bouts = data ?? [];

  return (
    <DataTable
      title="League Officials"
      backHref={`/leagues/${id}`}
      emptyMessage="No bouts have officials assigned yet."
      columns={[
        { key: 'bout', header: 'Bout' },
        { key: 'j1', header: 'Judge 1' },
        { key: 'j2', header: 'Judge 2' },
        { key: 'j3', header: 'Judge 3' },
        { key: 'ref', header: 'Referee' },
      ]}
      rows={bouts.map((bout) => {
        const seats = [...(bout.judges ?? [])].sort((a, b) => a.seat - b.seat);
        const nameAt = (seat: number) =>
          seats.find((s) => s.seat === seat)?.judge?.name ?? (
            <span className="text-slate-500">unassigned</span>
          );
        return {
          id: bout.id,
          cells: {
            bout: `#${bout.boutNumber} ${bout.boutName ?? bout.discipline}`,
            j1: nameAt(1),
            j2: nameAt(2),
            j3: nameAt(3),
            ref: bout.referee?.name ?? <span className="text-slate-500">unassigned</span>,
          },
        };
      })}
    />
  );
}
