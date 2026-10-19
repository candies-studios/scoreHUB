import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PillTable from '../components/PillTable.jsx';
import { leagueApi } from '../api/resources.js';
import { errMsg } from '../api/client.js';
import { fmtDate, fmtTime12 } from '../utils/format.js';

export default function LeagueList({ scope = 'upcoming' }) {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    leagueApi
      .list(scope)
      .then(setLeagues)
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
        <PillTable columns={columns} rows={leagues} empty={`No ${title.toLowerCase()}s yet.`} />
      )}

      <div style={{ marginTop: 22 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </>
  );
}
