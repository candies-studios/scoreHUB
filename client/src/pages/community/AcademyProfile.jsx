import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { academyApi } from '../../api/tournamentApi.js';
import { errMsg } from '../../api/client.js';
import { BeltChip, Loading, Stat } from '../../components/events/parts.jsx';
import { fullName } from '../../utils/tournament.js';

export default function AcademyProfile() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    academyApi.profile(id).then(setP).catch((e) => setError(errMsg(e)));
  }, [id]);
  if (error) return <p className="error-text">{error}</p>;
  if (!p) return <Loading what="Loading academy" />;
  const { academy, athletes, medals } = p;

  return (
    <>
      <header className="profile-head">
        <div className="avatar">{academy.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div>
          <h1>{academy.name}</h1>
          <p className="muted">
            {[academy.city, academy.country].filter(Boolean).join(', ')}
            {academy.affiliation ? ` · ${academy.affiliation}` : ''}
            {academy.headCoach ? ` · Head coach ${academy.headCoach}` : ''}
          </p>
          {academy.website && <a href={academy.website} target="_blank" rel="noreferrer">{academy.website}</a>}
        </div>
      </header>
      <div className="ev-stats">
        <Stat label="Ranking" value={medals.rank ? `#${medals.rank}` : '—'} />
        <Stat label="Points" value={medals.points} />
        <Stat label="Gold" value={medals.gold} />
        <Stat label="Silver" value={medals.silver} />
        <Stat label="Bronze" value={medals.bronze} />
        <Stat label="Athletes" value={athletes.length} />
      </div>
      <section className="card">
        <h3>Athletes</h3>
        <table className="ev-table">
          <tbody>
            {athletes.map((a) => (
              <tr key={a._id}>
                <td><Link to={`/athletes/${a._id}`}>{fullName(a)}</Link></td>
                <td><BeltChip belt={a.belt} /></td>
                <td className="muted">{a.gender}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {athletes.length === 0 && <p className="muted">No athletes listed.</p>}
      </section>
    </>
  );
}
