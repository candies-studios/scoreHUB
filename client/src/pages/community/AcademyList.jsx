import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { academyApi } from '../../api/tournamentApi.js';
import { errMsg } from '../../api/client.js';
import { Loading } from '../../components/events/parts.jsx';

const EMPTY = { name: '', affiliation: '', city: '', country: 'India', headCoach: '' };

export default function AcademyList() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = () => academyApi.list({ q: q || undefined }).then(setList).catch(() => setList([]));
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    try {
      await academyApi.create(form);
      setForm(EMPTY);
      setOpen(false);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <>
      <section className="ev-hero">
        <div>
          <h1>Academies</h1>
          <p>Clubs and teams, their athletes and medal counts.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen((v) => !v)}>+ Add academy</button>
      </section>
      {open && (
        <form className="card inline-form" onSubmit={add} style={{ marginBottom: 18 }}>
          {Object.keys(EMPTY).map((k) => (
            <input key={k} placeholder={k === 'headCoach' ? 'Head coach' : k[0].toUpperCase() + k.slice(1)} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === 'name'} />
          ))}
          <button className="btn btn-primary btn-sm">Save</button>
          {error && <span className="error-text">{error}</span>}
        </form>
      )}
      <input className="ev-input" placeholder="Search academies" value={q} onChange={(e) => setQ(e.target.value)} />
      {!list ? (
        <Loading />
      ) : (
        <div className="academy-grid">
          {list.map((a) => (
            <Link key={a._id} to={`/academies/${a._id}`} className="card academy-card">
              <div className="avatar sm">{a.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
              <div>
                <strong>{a.name}</strong>
                <div className="muted">{[a.city, a.country].filter(Boolean).join(', ')}</div>
                <small className="muted">{a.affiliation && `${a.affiliation} · `}{a.athleteCount} athletes</small>
              </div>
            </Link>
          ))}
          {list.length === 0 && <div className="empty">No academies yet.</div>}
        </div>
      )}
    </>
  );
}
