import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { athleteApi } from '../../api/tournamentApi.js';
import { errMsg, mediaUrl } from '../../api/client.js';
import { BeltChip, Loading, Medal, Stat } from '../../components/events/parts.jsx';
import { METHOD_LABEL, cap } from '../../utils/tournament.js';

export default function AthleteProfile() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    athleteApi.profile(id).then(setP).catch((e) => setError(errMsg(e)));
  }, [id]);
  if (error) return <p className="error-text">{error}</p>;
  if (!p) return <Loading what="Loading athlete" />;
  const a = p.athlete;
  const upcoming = p.registrations.filter((r) => r.tournament && r.tournament.status !== 'completed' && new Date(r.tournament.startDate) >= new Date(Date.now() - 86400000));

  return (
    <>
      <header className="profile-head">
        <div className="avatar">{a.photoUrl ? <img src={mediaUrl(a.photoUrl)} alt="" /> : `${a.firstName[0]}${a.lastName[0]}`}</div>
        <div>
          <h1>{a.name}</h1>
          <p className="muted">
            <BeltChip belt={a.belt} /> · {cap(a.gender)}
            {a.birthYear ? ` · born ${a.birthYear}` : ''}
            {a.country ? ` · ${a.country}` : ''}
          </p>
          {a.academy && <p><Link to={`/academies/${a.academy._id}`}>{a.academy.name}</Link></p>}
        </div>
      </header>

      <div className="ev-stats">
        <Stat label="Wins" value={p.record.wins} />
        <Stat label="Losses" value={p.record.losses} />
        <Stat label="By submission" value={p.record.submissions} />
        <Stat label="Medals" value={p.medals.length} />
      </div>

      <div className="ev-columns">
        <section className="card">
          <h3>Medals</h3>
          {p.medals.length === 0 && <p className="muted">No podiums yet.</p>}
          {p.medals.map((m) => (
            <div className="podium-row" key={m.division._id}>
              <Medal place={m.place} />
              <span>
                <Link to={`/events/${m.tournament?._id}?tab=results`}>{m.tournament?.name}</Link>
                <br /><small className="muted">{m.division.name}</small>
              </span>
            </div>
          ))}
          {upcoming.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>Upcoming</h3>
              {upcoming.map((r) => (
                <p key={r._id}>
                  <Link to={`/events/${r.tournament._id}`}>{r.tournament.name}</Link>
                  <br /><small className="muted">{r.division?.name} · {new Date(r.tournament.startDate).toLocaleDateString()}</small>
                </p>
              ))}
            </>
          )}
        </section>
        <section className="card">
          <h3>Match history</h3>
          {p.history.length === 0 && <p className="muted">No matches yet.</p>}
          <table className="ev-table">
            <tbody>
              {p.history.map((h) => (
                <tr key={h._id}>
                  <td><span className={`wl ${h.won ? 'w' : 'l'}`}>{h.won ? 'W' : 'L'}</span></td>
                  <td>
                    vs {h.opponent ? <Link to={`/athletes/${h.opponent._id}`}>{h.opponent.name}</Link> : '—'}
                    <br /><small className="muted">{h.tournament?.name} · {h.roundName}</small>
                  </td>
                  <td>{METHOD_LABEL[h.method] || h.method}{h.submissionType ? ` · ${h.submissionType}` : ''}<br /><small className="muted">{h.score}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
