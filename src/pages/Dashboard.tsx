import { Link } from 'react-router-dom';
import { useSession } from '@/lib/session';

function Tile({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="ss-tile">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-600 text-3xl font-light text-brand-300">
        +
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

export default function Dashboard() {
  const { can } = useSession();
  const organiser = can('ADMIN', 'PROMOTER');

  return (
    <section className="py-10">
      <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-3">
        {organiser && <Tile to="/leagues/new" label="Create League" />}
        <Tile to="/leagues/upcoming" label="Upcoming League" />
        <Tile to="/leagues/past" label="Past League" />
      </div>

      {!organiser && (
        <p className="mt-10 text-center text-sm text-slate-400">
          Open the league you are working, then your bout, to reach your scoring sheet.
        </p>
      )}
    </section>
  );
}
