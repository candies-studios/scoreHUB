import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PillTable from '../components/PillTable.jsx';
import { leagueApi } from '../api/resources.js';
import { errMsg, API_URL } from '../api/client.js';
import { fmtDate, fmtTime12 } from '../utils/format.js';

export default function LeagueList({ scope = 'upcoming' }) {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState([]);
  const [totalLeagues, setTotalLeagues] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([leagueApi.list(scope), leagueApi.list('all')])
      .then(([scoped, all]) => {
        setLeagues(scoped);
        setTotalLeagues(all.length);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [scope]);

  const remove = async (league) => {
    if (!window.confirm(`Delete "${league.name}" and all its bouts?`)) return;
    try {
      await leagueApi.remove(league._id);
      setLeagues((list) => list.filter((l) => l._id !== league._id));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const columns = [
    { key: 'name', label: 'League Name' },
    { key: 'date', label: 'League Date', render: (r) => fmtDate(r.date) },
    { key: 'time', label: 'League Time', render: (r) => fmtTime12(r.time) },
    { key: 'location', label: 'League Location' },
    {
      key: 'bouts',
      label: 'Bouts',
      render: () => 'View',
      onClick: (r) => navigate(`/leagues/${r._id}/bouts`),
    },
    {
      key: 'edit',
      label: 'Edit',
      render: () => 'Edit/View',
      onClick: (r) => navigate(`/leagues/${r._id}`),
    },
    {
      key: 'delete',
      label: 'Delete',
      width: '0.7fr',
      render: (r) => (
        <button className="icon-danger" onClick={() => remove(r)} aria-label="Delete league">
          🗑
        </button>
      ),
    },
  ];

  const title = scope === 'past' ? 'Past League' : 'Upcoming League';

  return (
    <>
      <h2 className="page-title">{title}</h2>
      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <div className="empty">Loading leagues…</div>
      ) : (
        <PillTable
          columns={columns}
          rows={leagues}
          empty={
            totalLeagues === 0 ? (
              <EmptyDatabaseHint />
            ) : (
              `No ${title.toLowerCase()}s yet.`
            )
          }
        />
      )}

      <div style={{ marginTop: 22 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </>
  );
}

/**
 * The API answered, but there is not a single event in the database.
 *
 * "No upcoming leagues yet" is technically true and completely unhelpful here —
 * it reads like the app is working when actually nothing was ever loaded. Say
 * what is wrong and how to fix it.
 */
function EmptyDatabaseHint() {
  return (
    <div style={{ padding: '28px 16px', lineHeight: 1.7 }}>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>The database is empty.</p>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.88rem', margin: '0 0 8px' }}>
        ScoreHub is connected to its API{API_URL ? ` at ${API_URL}` : ''} and that API
        replied normally &mdash; it just has no events in it yet.
      </p>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.88rem', margin: 0 }}>
        The server seeds itself from the bundled WDS roster the first time it starts
        against an empty database. If you are seeing this, restart the API service once
        and reload. To load it by hand instead:{' '}
        <code>MONGO_URI=&quot;&hellip;&quot; npm run seed</code>
      </p>
    </div>
  );
}
