import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rankingApi } from '../../api/tournamentApi.js';
import { BeltChip, Loading, Tabs } from '../../components/events/parts.jsx';
import { BELTS, SPORTS, cap } from '../../utils/tournament.js';

export default function Rankings() {
  const [kind, setKind] = useState('athletes');
  const [sport, setSport] = useState('');
  const [gender, setGender] = useState('');
  const [belt, setBelt] = useState('');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null);
    const p = { sport: sport || undefined };
    (kind === 'athletes'
      ? rankingApi.athletes({ ...p, gender: gender || undefined, belt: belt || undefined })
      : rankingApi.academies(p)
    )
      .then(setRows)
      .catch(() => setRows([]));
  }, [kind, sport, gender, belt]);

  return (
    <>
      <section className="ev-hero">
        <div>
          <h1>Rankings</h1>
          <p>Points from every finished division: gold 9 · silver 3 · bronze 1.</p>
        </div>
      </section>
      <div className="ev-toolbar">
        <Tabs value={kind} onChange={setKind} tabs={[{ value: 'athletes', label: 'Athletes' }, { value: 'academies', label: 'Academies' }]} />
        <div className="ev-filters">
          <select className="ev-input" value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {kind === 'athletes' && (
            <>
              <select className="ev-input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">All</option><option value="male">Male</option><option value="female">Female</option>
              </select>
              <select className="ev-input" value={belt} onChange={(e) => setBelt(e.target.value)}>
                <option value="">All belts</option>
                {BELTS.map((b) => <option key={b} value={b}>{cap(b)}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
      {!rows ? (
        <Loading what="Loading rankings" />
      ) : rows.length === 0 ? (
        <div className="empty">No results yet for this filter.</div>
      ) : (
        <div className="card table-scroll">
          <table className="ev-table rank-table">
            <thead>
              <tr>
                <th>#</th><th>{kind === 'athletes' ? 'Athlete' : 'Academy'}</th>
                {kind === 'athletes' ? <th>Academy</th> : <th>Athletes</th>}
                <th>🥇</th><th>🥈</th><th>🥉</th><th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={kind === 'athletes' ? r.athlete._id : r.academy._id}>
                  <td className="rank">{r.rank}</td>
                  {kind === 'athletes' ? (
                    <>
                      <td><Link to={`/athletes/${r.athlete._id}`}>{r.athlete.name}</Link> <BeltChip belt={r.athlete.belt} /></td>
                      <td>{r.athlete.academy ? <Link to={`/academies/${r.athlete.academy._id}`}>{r.athlete.academy.name}</Link> : '—'}</td>
                    </>
                  ) : (
                    <>
                      <td><Link to={`/academies/${r.academy._id}`}>{r.academy.name}</Link></td>
                      <td>{r.athletes}</td>
                    </>
                  )}
                  <td>{r.gold}</td><td>{r.silver}</td><td>{r.bronze}</td>
                  <td><strong>{r.points}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
