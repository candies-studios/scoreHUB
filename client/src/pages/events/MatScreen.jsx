import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { tournamentApi } from '../../api/tournamentApi.js';
import { getSocket } from '../../api/socket.js';
import { MAT_EVT } from '../../hooks/useMatchSocket.js';
import { Loading } from '../../components/events/parts.jsx';
import { fullName } from '../../utils/tournament.js';

/** "Now on mat N" — for a screen beside the mat, or the table worker's queue. */
export default function MatScreen() {
  const { id, mat } = useParams();
  const [data, setData] = useState(null);

  const load = useCallback(() => tournamentApi.schedule(id, mat).then(setData).catch(() => {}), [id, mat]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const watch = () => socket.emit(MAT_EVT.WATCH_MAT, { tournamentId: id, mat: Number(mat) });
    const onUpdate = (u) => String(u.mat) === String(mat) && load();
    socket.on('connect', watch);
    socket.on(MAT_EVT.MAT_UPDATE, onUpdate);
    if (socket.connected) watch();
    const t = setInterval(load, 15000);
    return () => {
      socket.off('connect', watch);
      socket.off(MAT_EVT.MAT_UPDATE, onUpdate);
      clearInterval(t);
    };
  }, [id, mat, load]);

  if (!data) return <Loading what="Loading mat" />;
  const m = data.mats[Number(mat) - 1];
  if (!m) return <div className="empty">Mat {mat} does not exist.</div>;
  const queue = m.matches.filter((x) => x.status === 'ready' || x.status === 'pending');
  const done = m.matches.filter((x) => x.status === 'completed');

  return (
    <div className="mat-screen">
      <header className="row-between">
        <div>
          <Link to={`/events/${id}?tab=schedule`} className="muted">← {data.tournament.name}</Link>
          <h1>Mat {mat}</h1>
        </div>
        <div className="btn-row">
          {Array.from({ length: data.tournament.mats }, (_, i) => (
            <Link key={i} className={`btn btn-sm ${i + 1 === Number(mat) ? 'btn-primary' : 'btn-ghost'}`} to={`/events/${id}/mats/${i + 1}`}>
              {i + 1}
            </Link>
          ))}
        </div>
      </header>

      <section className="card mat-now">
        <h3>Now</h3>
        {m.current ? (
          <MatchLine m={m.current} big />
        ) : queue[0] ? (
          <p className="muted">Nothing live. Next up is #{queue[0].order}.</p>
        ) : (
          <p className="muted">Mat is finished for the day.</p>
        )}
      </section>

      <section className="card">
        <h3>Up next</h3>
        {queue.length === 0 && <p className="muted">Queue is empty.</p>}
        <ol className="mat-list">
          {queue.map((x) => <li key={x._id} className={`mat-item ${x.status}`}><MatchLine m={x} /></li>)}
        </ol>
      </section>

      {done.length > 0 && (
        <section className="card">
          <h3>Finished ({done.length})</h3>
          <ol className="mat-list">
            {done.slice(-8).reverse().map((x) => <li key={x._id} className="mat-item completed"><MatchLine m={x} /></li>)}
          </ol>
        </section>
      )}
    </div>
  );
}

function MatchLine({ m, big }) {
  return (
    <div className={`match-line ${big ? 'big' : ''}`}>
      <span className="mat-order">#{m.order}</span>
      <div className="match-line-body">
        <div className="mat-names">
          <span className={m.winner && String(m.winner._id) === String(m.a?._id) ? 'won' : ''}>{m.a ? fullName(m.a) : 'TBD'}</span>
          <span className="muted"> vs </span>
          <span className={m.winner && String(m.winner._id) === String(m.b?._id) ? 'won' : ''}>{m.b ? fullName(m.b) : 'TBD'}</span>
        </div>
        <small className="muted">{m.division?.name} · {m.roundName}</small>
      </div>
      <div className="btn-row">
        {m.a && m.b && (
          <Link className="btn btn-sm btn-primary" to={`/matches/${m._id}/scoreboard`}>{m.status === 'completed' ? 'View' : 'Scoreboard'}</Link>
        )}
        {m.status === 'live' && <Link className="btn btn-sm btn-ghost" to={`/matches/${m._id}/display`}>Display</Link>}
      </div>
    </div>
  );
}
