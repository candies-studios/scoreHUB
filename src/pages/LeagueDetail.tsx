import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '@/components/DataTable';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { useSession } from '@/lib/session';

export default function LeagueDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useSession();
  const { data, error, loading, reload } = useApi(() => api.leagues.get(id), [id]);

  if (loading) return <Loading label="Loading league…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <ErrorNote message="League not found." />;

  const organiser = can('ADMIN', 'PROMOTER');

  return (
    <section className="py-6">
      <h1 className="mb-2 rounded-xl border border-ink-500 bg-ink-700 py-3 text-center text-base font-semibold text-white">
        {data.name}
      </h1>
      <p className="mb-8 text-center text-sm text-slate-400">
        {formatDate(data.startsAt)} · {formatTime(data.startsAt)} · {data.location}
        {data.promoterName ? ` · ${data.promoterName}` : ''}
      </p>

      <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-3">
        <Link to={`/leagues/${id}/fighters`} className="ss-tile">
          <span className="text-3xl font-bold text-brand-300">{data.fighters?.length ?? 0}</span>
          <span className="text-sm font-semibold">Fighters</span>
        </Link>
        <Link to={`/leagues/${id}/bouts`} className="ss-tile">
          <span className="text-3xl font-bold text-brand-300">{data.bouts?.length ?? 0}</span>
          <span className="text-sm font-semibold">Bouts</span>
        </Link>
        <Link to={`/leagues/${id}/officials`} className="ss-tile">
          <span className="text-3xl font-bold text-brand-300">·</span>
          <span className="text-sm font-semibold">Officials</span>
        </Link>
      </div>

      <div className="mt-10 flex items-center justify-between gap-4">
        <button type="button" className="ss-btn-ghost" onClick={() => navigate(-1)}>
          Back
        </button>
        {organiser && (
          <Link to={`/leagues/${id}/edit`} className="ss-btn-primary">
            Edit league
          </Link>
        )}
      </div>
    </section>
  );
}
