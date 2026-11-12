import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteApi } from '../../api/tournamentApi.js';
import { BeltChip, Loading } from '../../components/events/parts.jsx';
import { BELTS, cap, fullName } from '../../utils/tournament.js';

export default function AthleteList() {
  const [q, setQ] = useState('');
  const [belt, setBelt] = useState('');
  const [gender, setGender] = useState('');
  const [list, setList] = useState(null);

  useEffect(() => {
    const t = setTimeout(
      () => athleteApi.list({ q: q || undefined, belt: belt || undefined, gender: gender || undefined }).then(setList).catch(() => setList([])),
      200
    );
    return () => clearTimeout(t);
  }, [q, belt, gender]);

  return (
    <>
      <section className="ev-hero">
        <div>
          <h1>Athletes</h1>
          <p>Profiles, records and medals across every event.</p>
        </div>
      </section>
      <div className="ev-filters">
        <input className="ev-input" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ev-input" value={belt} onChange={(e) => setBelt(e.target.value)}>
          <option value="">All belts</option>
          {BELTS.map((b) => <option key={b} value={b}>{cap(b)}</option>)}
        </select>
        <select className="ev-input" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">All</option><option value="male">Male</option><option value="female">Female</option>
        </select>
      </div>
      {!list ? (
        <Loading />
      ) : (
        <div className="card table-scroll">
          <table className="ev-table">
            <thead><tr><th>Name</th><th>Belt</th><th>Academy</th><th>Country</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a._id}>
                  <td><Link to={`/athletes/${a._id}`}>{fullName(a)}</Link></td>
                  <td><BeltChip belt={a.belt} /></td>
                  <td>{a.academy ? <Link to={`/academies/${a.academy._id}`}>{a.academy.name}</Link> : '—'}</td>
                  <td>{a.country || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <div className="empty">No athletes found.</div>}
        </div>
      )}
    </>
  );
}
