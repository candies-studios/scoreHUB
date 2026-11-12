import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tournamentApi, divisionApi, athleteApi } from '../../api/tournamentApi.js';
import { errMsg, mediaUrl } from '../../api/client.js';
import { AthleteLink, BeltChip, Loading, Medal, Stat, StatusBadge, Tabs } from '../../components/events/parts.jsx';
import Bracket from '../../components/events/Bracket.jsx';
import { ADULT_BELTS, BELTS, cap, fmtDateRange, fullName, money, sportLabel } from '../../utils/tournament.js';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'participants', label: 'Participants' },
  { value: 'register', label: 'Register' },
  { value: 'brackets', label: 'Brackets' },
  { value: 'schedule', label: 'Mats & schedule' },
  { value: 'results', label: 'Results' },
];

export default function EventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [event, setEvent] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([tournamentApi.get(id), tournamentApi.divisions(id)])
      .then(([t, d]) => {
        setEvent(t);
        setDivisions(d);
      })
      .catch((e) => setError(errMsg(e)));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="error-text">{error}</p>;
  if (!event) return <Loading what="Loading event" />;

  const setTab = (v) => setParams({ tab: v }, { replace: true });

  return (
    <>
      <header className="ev-header">
        {event.coverUrl && <img className="ev-header-cover" src={mediaUrl(event.coverUrl)} alt="" />}
        <div className="ev-header-body">
          <div className="event-meta">
            <StatusBadge status={event.status} />
            <span className="muted">{sportLabel(event.sport)}</span>
          </div>
          <h1>{event.name}</h1>
          <p className="muted">
            {fmtDateRange(event.startDate, event.endDate)} · {[event.venue, event.city, event.country].filter(Boolean).join(', ')}
          </p>
          {event.organizer && <p className="muted">Organised by {event.organizer}</p>}
        </div>
        <div className="ev-header-actions">
          {event.registrationOpen && (
            <button className="btn btn-primary" onClick={() => setTab('register')}>Register · {money(event.fee)}</button>
          )}
          {event.livestreamUrl && (
            <a className="btn btn-ghost" href={event.livestreamUrl} target="_blank" rel="noreferrer">▶ Livestream</a>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/events/${id}/manage`)}>Organiser panel</button>
        </div>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="ev-panel">
        {tab === 'overview' && <Overview event={event} divisions={divisions} />}
        {tab === 'participants' && <Participants id={id} divisions={divisions} />}
        {tab === 'register' && <Register event={event} divisions={divisions} onDone={() => { load(); setTab('participants'); }} />}
        {tab === 'brackets' && <Brackets divisions={divisions} />}
        {tab === 'schedule' && <Schedule id={id} />}
        {tab === 'results' && <Results id={id} />}
      </div>
    </>
  );
}

function Overview({ event, divisions }) {
  return (
    <div className="ev-overview">
      <div className="ev-stats">
        <Stat label="Registered" value={event.stats?.registrations ?? 0} />
        <Stat label="Academies" value={event.stats?.academies ?? 0} />
        <Stat label="Divisions" value={divisions.length} />
        <Stat label="Mats" value={event.mats} />
      </div>
      <div className="ev-columns">
        <section className="card">
          <h3>About</h3>
          <p className="prewrap">{event.description || 'No description yet.'}</p>
          {event.rules && (
            <>
              <h3>Rules</h3>
              <p className="prewrap">{event.rules}</p>
            </>
          )}
        </section>
        <section className="card">
          <h3>Key info</h3>
          <dl className="ev-dl">
            <dt>Entry fee</dt><dd>{money(event.fee)}</dd>
            <dt>Registration</dt>
            <dd>
              {event.registrationOpen ? 'Open' : 'Closed'}
              {event.registrationCloses && ` · closes ${new Date(event.registrationCloses).toLocaleDateString()}`}
            </dd>
            <dt>Match length</dt><dd>{Math.round(event.matchDurationSec / 60)} min (adult default)</dd>
            <dt>Approval</dt><dd>{event.requireApproval ? 'Organiser approves entries' : 'Automatic'}</dd>
            {event.contactEmail && (<><dt>Contact</dt><dd><a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a></dd></>)}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Participants({ id, divisions }) {
  const [regs, setRegs] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    tournamentApi.registrations(id).then(setRegs).catch(() => setRegs([]));
  }, [id]);
  if (!regs) return <Loading what="Loading participants" />;

  const rx = q.trim().toLowerCase();
  const visible = regs.filter((r) => r.status !== 'cancelled' && (!rx || fullName(r.athlete).toLowerCase().includes(rx) || (r.academy?.name || '').toLowerCase().includes(rx)));
  const byDiv = new Map();
  for (const r of visible) {
    const k = String(r.division?._id);
    if (!byDiv.has(k)) byDiv.set(k, []);
    byDiv.get(k).push(r);
  }
  return (
    <>
      <input className="ev-input" placeholder="Search athlete or academy" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="muted">{visible.length} entries</p>
      <div className="div-list">
        {divisions.filter((d) => byDiv.has(String(d._id))).map((d) => (
          <section className="card div-card" key={d._id}>
            <header className="row-between">
              <h4>{d.name}</h4>
              <span className="muted">{byDiv.get(String(d._id)).length}</span>
            </header>
            <ul className="plain">
              {byDiv.get(String(d._id)).map((r) => (
                <li key={r._id}>
                  <AthleteLink athlete={{ ...r.athlete, academy: r.academy }} />
                  {r.status === 'pending' && <span className="badge">Pending</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {visible.length === 0 && <div className="empty">No registrations yet.</div>}
    </>
  );
}

const NEW = { firstName: '', lastName: '', gender: 'male', belt: 'white', birthYear: '', weightKg: '', country: 'India', academyName: '', email: '' };

function Register({ event, divisions, onDone }) {
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState(NEW);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [athlete, setAthlete] = useState(null);
  const [division, setDivision] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'existing' || search.trim().length < 2) return setFound([]);
    const t = setTimeout(() => athleteApi.list({ q: search, limit: 10 }).then(setFound).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [search, mode]);

  const who = mode === 'existing' ? athlete : form;
  const eligible = useMemo(
    () =>
      divisions.filter(
        (d) =>
          d.status === 'open' &&
          (!who || d.gender === 'open' || d.gender === who.gender) &&
          (!who || d.belt === 'all' || d.belt === who.belt)
      ),
    [divisions, who]
  );

  if (!event.registrationOpen) {
    return <div className="empty">Registration is closed for this event. The organiser can still add late entries from the organiser panel.</div>;
  }

  const on = (k) => (e) => setForm((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { division };
      if (mode === 'existing') body.athlete = athlete?._id;
      else
        body.newAthlete = {
          ...form,
          birthYear: form.birthYear ? Number(form.birthYear) : undefined,
          weightKg: form.weightKg ? Number(form.weightKg) : 0,
        };
      const reg = await tournamentApi.register(event._id, body);
      setMsg(`${fullName(reg.athlete)} is registered in ${reg.division.name}${reg.status === 'pending' ? ' — waiting for organiser approval' : ''}.`);
      setForm(NEW);
      setAthlete(null);
      setDivision('');
      setTimeout(onDone, 1400);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card ev-form" onSubmit={submit}>
      <h3>Register for {event.name}</h3>
      <Tabs
        value={mode}
        onChange={(v) => { setMode(v); setDivision(''); }}
        tabs={[{ value: 'new', label: 'New athlete' }, { value: 'existing', label: 'I have a profile' }]}
      />
      {mode === 'new' ? (
        <div className="form-grid">
          <div className="field"><label>First name</label><input value={form.firstName} onChange={on('firstName')} required /></div>
          <div className="field"><label>Last name</label><input value={form.lastName} onChange={on('lastName')} required /></div>
          <div className="field">
            <label>Gender</label>
            <select value={form.gender} onChange={(e) => { on('gender')(e); setDivision(''); }}>
              <option value="male">Male</option><option value="female">Female</option>
            </select>
          </div>
          <div className="field">
            <label>Belt / grade</label>
            <select value={form.belt} onChange={(e) => { on('belt')(e); setDivision(''); }}>
              {(event.sport === 'bjj' ? ADULT_BELTS : BELTS).map((b) => <option key={b} value={b}>{cap(b)}</option>)}
            </select>
          </div>
          <div className="field"><label>Birth year</label><input type="number" min="1940" max="2025" value={form.birthYear} onChange={on('birthYear')} /></div>
          <div className="field"><label>Weight (kg)</label><input type="number" step="0.1" value={form.weightKg} onChange={on('weightKg')} /></div>
          <div className="field"><label>Academy / team</label><input value={form.academyName} onChange={on('academyName')} placeholder="Type your academy name" /></div>
          <div className="field"><label>Country</label><input value={form.country} onChange={on('country')} /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={on('email')} /></div>
        </div>
      ) : (
        <div className="stack">
          <input className="ev-input" placeholder="Search your name" value={search} onChange={(e) => setSearch(e.target.value)} />
          {athlete ? (
            <div className="picked">
              <strong>{fullName(athlete)}</strong> <BeltChip belt={athlete.belt} /> <span className="muted">{athlete.academy?.name}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAthlete(null)}>Change</button>
            </div>
          ) : (
            <ul className="plain pick-list">
              {found.map((a) => (
                <li key={a._id}>
                  <button type="button" onClick={() => { setAthlete(a); setDivision(''); }}>
                    {fullName(a)} · {cap(a.belt)} · {a.academy?.name || 'No academy'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="field" style={{ marginTop: 18 }}>
        <label>Division</label>
        <select value={division} onChange={(e) => setDivision(e.target.value)} required>
          <option value="">{eligible.length ? 'Choose a division' : 'No open division matches this athlete'}</option>
          {eligible.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.registrationCount} registered)</option>)}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}
      {msg && <p className="ok-text">{msg}</p>}
      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" disabled={busy || !division || (mode === 'existing' && !athlete)}>
          {busy ? 'Registering…' : `Register · ${money(event.fee)}`}
        </button>
      </div>
      {event.fee?.amount > 0 && <p className="hint muted">Entry fee is paid to the organiser; they mark entries as paid in the organiser panel.</p>}
    </form>
  );
}

function Brackets({ divisions }) {
  const drawn = divisions.filter((d) => d.status !== 'open');
  const [sel, setSel] = useState(drawn[0]?._id || '');
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!sel) return;
    setData(null);
    divisionApi.bracket(sel).then(setData).catch(() => setData(null));
  }, [sel]);

  if (!drawn.length) return <div className="empty">Brackets are published once the organiser draws them.</div>;
  return (
    <div className="bk-layout">
      <aside className="bk-divs">
        {drawn.map((d) => (
          <button key={d._id} className={`bk-div ${sel === d._id ? 'active' : ''}`} onClick={() => setSel(d._id)}>
            <span>{d.name}</span>
            <small className="muted">{d.registrationCount} athletes · {d.status === 'completed' ? 'finished' : `${d.matchesDone}/${d.matchCount} done`}</small>
          </button>
        ))}
      </aside>
      <div className="bk-main">{data ? <Bracket data={data} /> : <Loading what="Loading bracket" />}</div>
    </div>
  );
}

function Schedule({ id }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => tournamentApi.schedule(id).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);
  if (!data) return <Loading what="Loading schedule" />;
  const any = data.mats.some((m) => m.matches.length);
  if (!any) return <div className="empty">The mat schedule is published after brackets are drawn.</div>;
  return (
    <div className="mats">
      {data.mats.map((mat) => (
        <section className="card mat-col" key={mat.mat}>
          <header className="row-between">
            <h3>Mat {mat.mat}</h3>
            <Link className="btn btn-ghost btn-sm" to={`/events/${id}/mats/${mat.mat}`}>Mat screen</Link>
          </header>
          {mat.matches.length === 0 && <p className="muted">Nothing scheduled.</p>}
          <ol className="mat-list">
            {mat.matches.map((m) => (
              <li key={m._id} className={`mat-item ${m.status}`}>
                <span className="mat-order">#{m.order}</span>
                <div>
                  <div className="mat-names">
                    {m.a ? fullName(m.a) : 'TBD'} <span className="muted">vs</span> {m.b ? fullName(m.b) : 'TBD'}
                  </div>
                  <small className="muted">{m.division?.name} · {m.roundName}</small>
                </div>
                <span className="mat-status">
                  {m.status === 'live' ? <Link className="live-dot" to={`/matches/${m._id}/display`}>LIVE</Link> : m.status === 'completed' ? '✓' : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Results({ id }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    tournamentApi.results(id).then(setData).catch(() => setData({ divisions: [], academies: [] }));
  }, [id]);
  if (!data) return <Loading what="Loading results" />;
  const finished = data.divisions.filter((d) => d.podium.length);
  if (!finished.length) return <div className="empty">No results yet.</div>;
  return (
    <div className="ev-columns results">
      <section className="card">
        <h3>Academy medal table</h3>
        <table className="ev-table">
          <thead><tr><th>#</th><th>Academy</th><th>🥇</th><th>🥈</th><th>🥉</th><th>Pts</th></tr></thead>
          <tbody>
            {data.academies.map((a, i) => (
              <tr key={a.academy?._id || i}>
                <td>{i + 1}</td>
                <td>{a.academy?._id ? <Link to={`/academies/${a.academy._id}`}>{a.academy.name}</Link> : a.academy?.name}</td>
                <td>{a.gold}</td><td>{a.silver}</td><td>{a.bronze}</td><td><strong>{a.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint muted">Points: gold 9 · silver 3 · bronze 1</p>
      </section>
      <section className="stack">
        {finished.map(({ division, podium }) => (
          <div className="card div-card" key={division._id}>
            <h4>{division.name}</h4>
            {podium.map((p) => (
              <div className="podium-row" key={`${p.place}-${p.athlete._id}`}>
                <Medal place={p.place} />
                <AthleteLink athlete={p.athlete} />
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
