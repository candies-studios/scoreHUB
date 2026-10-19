import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boutApi } from '../api/resources.js';
import { errMsg } from '../api/client.js';
import { TextField } from '../components/Field.jsx';
import { fmtDate, fmtDuration } from '../utils/format.js';
import '../styles/scoring.css';

export default function Scoreboard() {
  const { boutId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    boutApi
      .summary(boutId)
      .then(setData)
      .catch((e) => setError(errMsg(e)));
  };

  useEffect(load, [boutId]);

  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">Loading scoreboard…</div>;

  const { bout, league, corners, judges, winner } = data;

  const winnerLabel =
    winner?.corner === 'blue'
      ? corners.blue?.name
      : winner?.corner === 'red'
      ? corners.red?.name
      : winner?.corner === 'draw'
      ? 'Draw'
      : winner?.corner === 'nc'
      ? 'No Contest'
      : 'Pending';

  const reset = async () => {
    if (!window.confirm('Clear every judge card and reopen this bout?')) return;
    try {
      await boutApi.reset(boutId);
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <>
      <div className="banner">Supervised Combined Scoreboard</div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(180px, 260px))',
          gap: '14px 22px',
          marginBottom: 26,
        }}
      >
        <TextField label="League Name" value={league?.name || '—'} readOnly />
        <TextField label="Date" value={fmtDate(bout.boutDate)} readOnly />
        <TextField label="Promoter" value={league?.promoter || '—'} readOnly />
        <TextField label="Location" value={league?.location || '—'} readOnly />
        <TextField label="Style" value={`${bout.boutType} ${bout.discipline}`} readOnly />
        <TextField label="Time of Round" value={fmtDuration(bout.roundDurationSec)} readOnly />
        <TextField label="Bout No." value={bout.boutNo} readOnly />
        <TextField label="Referee" value={bout.referee || '—'} readOnly />
        <TextField label="Result by" value={winner?.method || 'Pending'} readOnly />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
        }}
      >
        <CornerStrip corner="blue" fighter={corners.blue} />
        <CornerStrip corner="red" fighter={corners.red} />
      </div>

      <div className="judge-columns">
        {judges.map((j) => (
          <div className="judge-col" key={j.seat}>
            <h4>Judge {j.seat}</h4>
            <div className="judge-name">{j.judgeName}</div>

            <div className="score-grid">
              <div className="h dark">Round No.</div>
              <div className="h blue">Blue Corner</div>
              <div className="h red">Red Corner</div>

              {j.rounds.filter((r) => r.submitted).map((r) => (
                <FragmentRow key={r.roundNo} r={r} />
              ))}

              <div className="h dark">Total score</div>
              <div className="v blue">{j.totals.blue || ''}</div>
              <div className="v red">{j.totals.red || ''}</div>
            </div>
          </div>
        ))}
        {judges.length === 0 && <div className="empty">No judge cards recorded.</div>}
      </div>

      <div className="winner-bar">
        <div className="cap-blue" />
        <div className="mid">
          <div>
            Winner
            <strong>{winnerLabel}</strong>
            {winner?.method && (
              <span style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                by {winner.method}
              </span>
            )}
          </div>
        </div>
        <div className="cap-red" />
      </div>

      <div className="row-between" style={{ marginTop: 26 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          Back
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reset}>
            Reset bout
          </button>
        </div>
      </div>
    </>
  );
}

function FragmentRow({ r }) {
  return (
    <>
      <div className="h dark">Round No.{r.roundNo}</div>
      <div className="v blue">{r.blueScore ?? '—'}</div>
      <div className="v red">{r.redScore ?? '—'}</div>
    </>
  );
}

function CornerStrip({ corner, fighter }) {
  return (
    <div className={`corner-strip ${corner}`}>
      <div className="title">{corner === 'blue' ? 'Blue Corner' : 'Red Corner'}</div>
      <div className="cells">
        <div>Name</div>
        <div>{fighter?.name || '—'}</div>
        <div>Team</div>
        <div>{fighter?.team || '—'}</div>
      </div>
    </div>
  );
}
