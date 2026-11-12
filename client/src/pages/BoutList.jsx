import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PillTable from '../components/PillTable.jsx';
import { boutApi } from '../api/resources.js';
import { errMsg } from '../api/client.js';

export default function BoutList() {
  const { id: leagueId } = useParams();
  const navigate = useNavigate();

  const [bouts, setBouts] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    boutApi
      .list({ league: leagueId })
      .then(setBouts)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [leagueId]);

  const rows = useMemo(
    () => (filter ? bouts.filter((b) => b.boutType === filter) : bouts),
    [bouts, filter]
  );

  const remove = async (bout) => {
    if (!window.confirm(`Delete bout #${bout.boutNo}?`)) return;
    try {
      await boutApi.remove(bout._id);
      setBouts((list) => list.filter((b) => b._id !== bout._id));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const columns = [
    { key: 'boutNo', label: 'Bout No.', width: '0.6fr' },
    {
      key: 'blue',
      label: 'Blue Corner',
      headClass: 'blue',
      cellClass: 'blue',
      render: (r) => r.blueCorner?.fighter?.name || '—',
    },
    {
      key: 'red',
      label: 'Red Corner',
      headClass: 'red',
      cellClass: 'red',
      render: (r) => r.redCorner?.fighter?.name || '—',
    },
    { key: 'boutName', label: 'Bout Name' },
    { key: 'boutType', label: 'Bout Type' },
    {
      key: 'score',
      label: 'Judges',
      render: (r) => (r.status === 'completed' ? 'Locked' : 'Memory sheet'),
      onClick: (r) => navigate(`/bouts/${r._id}/score`),
    },
    {
      key: 'analytics',
      label: 'Analytics',
      render: () => 'Fight stats',
      onClick: (r) => navigate(`/bouts/${r._id}/analytics`),
    },
    {
      key: 'live',
      label: 'Public',
      render: () => 'Live page',
      onClick: (r) => navigate(`/bouts/${r._id}/live`),
    },
    {
      key: 'edit',
      label: 'Edit',
      render: () => 'Edit/View',
      onClick: (r) => navigate(`/leagues/${leagueId}/bouts/${r._id}/edit`),
    },
    {
      key: 'summary',
      label: 'Summary',
      render: () => 'Summary',
      onClick: (r) => navigate(`/bouts/${r._id}/summary`),
    },
    {
      key: 'delete',
      label: 'Delete',
      width: '0.6fr',
      render: (r) => (
        <button className="icon-danger" onClick={() => remove(r)} aria-label="Delete bout">
          🗑
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="row-between">
        <span />
        <h2 className="page-title" style={{ margin: 0 }}>Bout List</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate(`/leagues/${leagueId}/bouts/new`)}
        >
          Add Bout
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0' }}>
        <select
          className="score-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ background: '#fff', color: 'var(--ink)' }}
        >
          <option value="">Bout Type</option>
          <option value="Professional">Professional</option>
          <option value="Amateur">Amateur</option>
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <div className="empty">Loading bouts…</div>
      ) : (
        <PillTable columns={columns} rows={rows} empty="No bouts scheduled yet." />
      )}

      <div style={{ marginTop: 22 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/leagues/${leagueId}`)}>
          Back
        </button>
      </div>
    </>
  );
}
