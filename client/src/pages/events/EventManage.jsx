import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { tournamentApi, divisionApi, registrationApi } from '../../api/tournamentApi.js';
import { errMsg } from '../../api/client.js';
import { BeltChip, Loading, StatusBadge, Tabs } from '../../components/events/parts.jsx';
import Bracket from '../../components/events/Bracket.jsx';
import { ADULT_BELTS, AGE_GROUPS, BELTS, WEIGHT_TEMPLATES, cap, fullName } from '../../utils/tournament.js';

export default function EventManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'divisions';
  const [event, setEvent] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      Promise.all([tournamentApi.get(id), tournamentApi.divisions(id)])
        .then(([t, d]) => {
          setEvent(t);
          setDivisions(d);
        })
        .catch((e) => setError(errMsg(e))),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, ok) => {
    setError('');
    setFlash('');
    try {
      const r = await fn();
      if (ok) setFlash(typeof ok === 'function' ? ok(r) : ok);
      await load();
      return r;
    } catch (e) {
      setError(errMsg(e));
      return null;
    }
  };

  if (!event) return error ? <p className="error-text">{error}</p> : <Loading what="Loading organiser panel" />;

  const removeEvent = async () => {
    if (!window.confirm(`Delete "${event.name}" with all divisions, registrations and matches?`)) return;
    await tournamentApi.remove(id);
    navigate('/events');
  };

  return (
    <>
      <div className="row-between ev-manage-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>Organiser panel</p>
          <h2 style={{ margin: '4px 0' }}>{event.name}</h2>
          <StatusBadge status={event.status} />
        </div>
        <div className="btn-row">
          <Link className="btn btn-ghost btn-sm" to={`/events/${id}`}>Public page</Link>
          <Link className="btn btn-ghost btn-sm" to={`/events/${id}/edit`}>Edit details</Link>
          <button className="btn btn-red btn-sm" onClick={removeEvent}>Delete</button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={[
          { value: 'divisions', label: 'Divisions', count: divisions.length },
          { value: 'registrations', label: 'Registrations', count: event.stats?.registrations },
          { value: 'brackets', label: 'Brackets & mats' },
        ]}
      />

      {error && <p className="error-text">{error}</p>}
      {flash && <p className="ok-text">{flash}</p>}

      <div className="ev-panel">
        {tab === 'divisions' && <DivisionsAdmin event={event} divisions={divisions} act={act} />}
        {tab === 'registrations' && <RegistrationsAdmin event={event} divisions={divisions} act={act} />}
        {tab === 'brackets' && <BracketsAdmin event={event} divisions={divisions} act={act} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function DivisionsAdmin({ event, divisions, act }) {
  const belts = event.sport === 'bjj' ? ADULT_BELTS : BELTS;
  const [tpl, setTpl] = useState({
    genders: ['male'], ageGroups: ['Adult'], belts: ['white', 'blue'], uniform: 'gi', weightSet: 'ibjjf',
    custom: '-70:70, -80:80, +80:0',
  });
  const [one, setOne] = useState({ ageGroup: 'Adult', gender: 'male', belt: 'all', weightClass: 'Open', maxWeightKg: 0, uniform: 'gi', bracketType: 'auto' });

  const toggle = (k, v) =>
    setTpl((t) => ({ ...t, [k]: t[k].includes(v) ? t[k].filter((x) => x !== v) : [...t[k], v] }));

  const generate = async () => {
    const custom = tpl.custom
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [label, max] = s.split(':');
        return { label: /kg/i.test(label) ? label.trim() : `${label.trim()} kg`, maxKg: Number(max) || 0 };
      });
    // One template per gender so men and women each get their own weight table.
    let total = 0;
    for (const g of tpl.genders) {
      const weights =
        tpl.weightSet === 'ibjjf' ? WEIGHT_TEMPLATES[g] : tpl.weightSet === 'open' ? [{ label: 'Open', maxKg: 0 }] : custom;
      const r = await act(() =>
        tournamentApi.generateDivisions(event._id, { genders: [g], ageGroups: tpl.ageGroups, belts: tpl.belts, weights, uniform: tpl.uniform })
      );
      total += r?.created || 0;
    }
    await act(async () => null, `${total} division(s) created`);
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Generate divisions</h3>
        <p className="muted">Creates every combination you tick. Existing divisions are skipped.</p>
        <div className="gen-grid">
          <fieldset>
            <legend>Gender</legend>
            {['male', 'female'].map((g) => (
              <label key={g} className="ev-check"><input type="checkbox" checked={tpl.genders.includes(g)} onChange={() => toggle('genders', g)} />{cap(g)}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Age group</legend>
            {AGE_GROUPS.map((a) => (
              <label key={a} className="ev-check"><input type="checkbox" checked={tpl.ageGroups.includes(a)} onChange={() => toggle('ageGroups', a)} />{a}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Belt</legend>
            {[...belts, 'all'].map((b) => (
              <label key={b} className="ev-check"><input type="checkbox" checked={tpl.belts.includes(b)} onChange={() => toggle('belts', b)} />{b === 'all' ? 'All belts' : cap(b)}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Weights</legend>
            <label className="ev-check"><input type="radio" checked={tpl.weightSet === 'ibjjf'} onChange={() => setTpl({ ...tpl, weightSet: 'ibjjf' })} />IBJJF adult classes</label>
            <label className="ev-check"><input type="radio" checked={tpl.weightSet === 'open'} onChange={() => setTpl({ ...tpl, weightSet: 'open' })} />Open weight only</label>
            <label className="ev-check"><input type="radio" checked={tpl.weightSet === 'custom'} onChange={() => setTpl({ ...tpl, weightSet: 'custom' })} />Custom</label>
            {tpl.weightSet === 'custom' && (
              <input className="ev-input" value={tpl.custom} onChange={(e) => setTpl({ ...tpl, custom: e.target.value })} title="label:maxKg, comma separated (0 = no limit)" />
            )}
            <legend style={{ marginTop: 10 }}>Uniform</legend>
            <select className="ev-input" value={tpl.uniform} onChange={(e) => setTpl({ ...tpl, uniform: e.target.value })}>
              <option value="gi">Gi</option><option value="nogi">No-Gi</option><option value="none">n/a</option>
            </select>
          </fieldset>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={!tpl.genders.length || !tpl.ageGroups.length || !tpl.belts.length}>
          Generate
        </button>
      </section>

      <section className="card">
        <h3>Add one division</h3>
        <div className="inline-form">
          <select value={one.ageGroup} onChange={(e) => setOne({ ...one, ageGroup: e.target.value })}>{AGE_GROUPS.map((a) => <option key={a}>{a}</option>)}</select>
          <select value={one.gender} onChange={(e) => setOne({ ...one, gender: e.target.value })}>
            <option value="male">Male</option><option value="female">Female</option><option value="open">Open</option>
          </select>
          <select value={one.belt} onChange={(e) => setOne({ ...one, belt: e.target.value })}>
            {[...belts, 'all'].map((b) => <option key={b} value={b}>{b === 'all' ? 'All belts' : cap(b)}</option>)}
          </select>
          <input placeholder="Weight label" value={one.weightClass} onChange={(e) => setOne({ ...one, weightClass: e.target.value })} />
          <input type="number" placeholder="Max kg" value={one.maxWeightKg} onChange={(e) => setOne({ ...one, maxWeightKg: e.target.value })} />
          <select value={one.uniform} onChange={(e) => setOne({ ...one, uniform: e.target.value })}>
            <option value="gi">Gi</option><option value="nogi">No-Gi</option><option value="none">n/a</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => act(() => tournamentApi.addDivision(event._id, one), 'Division added')}>Add</button>
        </div>
      </section>

      <section className="card">
        <h3>Divisions</h3>
        {divisions.length === 0 ? (
          <p className="muted">No divisions yet — generate some above.</p>
        ) : (
          <div className="table-scroll">
            <table className="ev-table">
              <thead>
                <tr><th>Division</th><th>Belt</th><th>Entries</th><th>Format</th><th>Mat</th><th>Match min</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d._id}>
                    <td>{d.name}</td>
                    <td><BeltChip belt={d.belt} /></td>
                    <td>{d.registrationCount}</td>
                    <td>
                      <select value={d.bracketType} disabled={d.status !== 'open'} onChange={(e) => act(() => divisionApi.update(d._id, { bracketType: e.target.value }))}>
                        <option value="auto">Auto</option><option value="single_elim">Elimination</option><option value="round_robin">Round robin</option>
                      </select>
                    </td>
                    <td>
                      <select value={d.mat || 0} onChange={(e) => act(() => divisionApi.update(d._id, { mat: Number(e.target.value) }))}>
                        <option value={0}>Auto</option>
                        {Array.from({ length: event.mats }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="tiny"
                        min="1"
                        step="0.5"
                        defaultValue={d.matchDurationSec ? d.matchDurationSec / 60 : ''}
                        placeholder={String(event.matchDurationSec / 60)}
                        onBlur={(e) => act(() => divisionApi.update(d._id, { matchDurationSec: e.target.value ? Math.round(Number(e.target.value) * 60) : 0 }))}
                      />
                    </td>
                    <td><StatusBadge status={d.status === 'bracketed' ? 'closed' : d.status === 'open' ? 'registration' : d.status} /></td>
                    <td>
                      <button
                        className="icon-danger"
                        aria-label="Delete division"
                        onClick={() => {
                          if (!window.confirm(`Delete ${d.name}${d.registrationCount ? ` and its ${d.registrationCount} entries` : ''}?`)) return;
                          act(() => divisionApi.remove(d._id, d.registrationCount > 0), 'Division deleted');
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const LATE = { firstName: '', lastName: '', gender: 'male', belt: 'white', academyName: '', division: '' };

function RegistrationsAdmin({ event, divisions, act }) {
  const [regs, setRegs] = useState(null);
  const [division, setDivision] = useState('');
  const [q, setQ] = useState('');
  const [late, setLate] = useState(LATE);
  const [warn, setWarn] = useState('');

  const load = useCallback(
    () => tournamentApi.registrations(event._id, { division: division || undefined }).then(setRegs),
    [event._id, division]
  );
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (r, body) => {
    setWarn('');
    const updated = await act(() => registrationApi.update(r._id, body));
    if (updated?.warning) setWarn(`${fullName(r.athlete)}: ${updated.warning}`);
    load();
  };

  if (!regs) return <Loading what="Loading registrations" />;
  const rx = q.trim().toLowerCase();
  const rows = regs.filter((r) => !rx || fullName(r.athlete).toLowerCase().includes(rx) || (r.academy?.name || '').toLowerCase().includes(rx));
  const count = (k) => regs.filter((r) => r.status !== 'cancelled' && r[k]).length;
  const live = regs.filter((r) => r.status !== 'cancelled').length;

  return (
    <div className="stack">
      <div className="ev-stats">
        <div className="ev-stat"><span className="ev-stat-value">{live}</span><span className="ev-stat-label">Entries</span></div>
        <div className="ev-stat"><span className="ev-stat-value">{regs.filter((r) => r.status === 'pending').length}</span><span className="ev-stat-label">Pending</span></div>
        <div className="ev-stat"><span className="ev-stat-value">{count('paid')}</span><span className="ev-stat-label">Paid</span></div>
        <div className="ev-stat"><span className="ev-stat-value">{count('checkedIn')}</span><span className="ev-stat-label">Checked in</span></div>
        <div className="ev-stat"><span className="ev-stat-value">{count('weighedIn')}</span><span className="ev-stat-label">Weighed in</span></div>
      </div>

      <div className="ev-filters">
        <select className="ev-input" value={division} onChange={(e) => setDivision(e.target.value)}>
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.registrationCount})</option>)}
        </select>
        <input className="ev-input" placeholder="Search athlete or academy" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {warn && <p className="error-text">⚠ {warn}</p>}

      <div className="table-scroll card">
        <table className="ev-table">
          <thead>
            <tr><th>Athlete</th><th>Academy</th><th>Division</th><th>Status</th><th>Paid</th><th>Check-in</th><th>Weigh-in kg</th><th>Seed</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className={r.status === 'cancelled' ? 'muted-row' : ''}>
                <td><Link to={`/athletes/${r.athlete?._id}`}>{fullName(r.athlete)}</Link> <BeltChip belt={r.athlete?.belt} /></td>
                <td>{r.academy?.name || '—'}</td>
                <td>
                  <select value={r.division?._id} onChange={(e) => patch(r, { division: e.target.value })}>
                    {divisions.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={r.status} onChange={(e) => patch(r, { status: e.target.value })}>
                    <option value="pending">Pending</option><option value="approved">Approved</option><option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td><input type="checkbox" checked={r.paid} onChange={(e) => patch(r, { paid: e.target.checked })} /></td>
                <td><input type="checkbox" checked={r.checkedIn} onChange={(e) => patch(r, { checkedIn: e.target.checked })} /></td>
                <td>
                  <input
                    className="tiny"
                    type="number"
                    step="0.1"
                    defaultValue={r.weighInKg || ''}
                    onBlur={(e) => e.target.value && Number(e.target.value) !== r.weighInKg && patch(r, { weighInKg: Number(e.target.value), weighedIn: true })}
                  />
                  {r.weighedIn && ' ✓'}
                </td>
                <td>
                  <input className="tiny" type="number" min="0" defaultValue={r.seed || ''} onBlur={(e) => Number(e.target.value || 0) !== r.seed && patch(r, { seed: Number(e.target.value || 0) })} />
                </td>
                <td>
                  <button className="icon-danger" aria-label="Remove registration" onClick={() => window.confirm('Remove this entry?') && act(() => registrationApi.remove(r._id)).then(load)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No registrations.</div>}
      </div>

      <section className="card">
        <h3>Add a late entry</h3>
        <p className="muted">Bypasses the registration window and approval. Use for walk-ins and corrections.</p>
        <div className="inline-form">
          <input placeholder="First name" value={late.firstName} onChange={(e) => setLate({ ...late, firstName: e.target.value })} />
          <input placeholder="Last name" value={late.lastName} onChange={(e) => setLate({ ...late, lastName: e.target.value })} />
          <select value={late.gender} onChange={(e) => setLate({ ...late, gender: e.target.value })}><option value="male">Male</option><option value="female">Female</option></select>
          <select value={late.belt} onChange={(e) => setLate({ ...late, belt: e.target.value })}>{BELTS.map((b) => <option key={b} value={b}>{cap(b)}</option>)}</select>
          <input placeholder="Academy" value={late.academyName} onChange={(e) => setLate({ ...late, academyName: e.target.value })} />
          <select value={late.division} onChange={(e) => setLate({ ...late, division: e.target.value })}>
            <option value="">Division…</option>
            {divisions.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={!late.firstName || !late.lastName || !late.division}
            onClick={async () => {
              const { division: div, ...newAthlete } = late;
              const r = await act(() => tournamentApi.register(event._id, { division: div, newAthlete, override: true }), 'Late entry added');
              if (r) {
                setLate(LATE);
                load();
              }
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BracketsAdmin({ event, divisions, act }) {
  const [sel, setSel] = useState(divisions.find((d) => d.registrationCount > 0)?._id || divisions[0]?._id || '');
  const [data, setData] = useState(null);
  const division = divisions.find((d) => d._id === sel);

  const loadBracket = useCallback(() => {
    if (!sel) return;
    divisionApi.bracket(sel).then(setData).catch(() => setData(null));
  }, [sel]);
  useEffect(loadBracket, [loadBracket]);

  const run = async (fn, msg) => {
    await act(fn, msg);
    loadBracket();
  };

  return (
    <div className="stack">
      <div className="card row-between">
        <div>
          <h3 style={{ margin: 0 }}>Draw and schedule</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Team-mates are kept apart and byes go to seeds. Divisions of 3–4 run as round robin on “Auto”.
          </p>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary btn-sm" onClick={() => run(() => tournamentApi.drawAll(event._id), (r) => `Drew ${r.drawn.length} division(s)${r.skipped.length ? `, skipped ${r.skipped.length} with fewer than 2 entries` : ''}`)}>
            Draw all open divisions
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => run(() => tournamentApi.autoSchedule(event._id), 'Matches assigned to mats')}>
            Auto-schedule mats
          </button>
          <Link className="btn btn-ghost btn-sm" to={`/events/${event._id}?tab=schedule`}>View schedule</Link>
        </div>
      </div>

      <div className="bk-layout">
        <aside className="bk-divs">
          {divisions.map((d) => (
            <button key={d._id} className={`bk-div ${sel === d._id ? 'active' : ''}`} onClick={() => setSel(d._id)}>
              <span>{d.name}</span>
              <small className="muted">
                {d.registrationCount} entries · {d.status === 'open' ? 'not drawn' : d.status === 'completed' ? 'finished' : `${d.matchesDone}/${d.matchCount} played`}
                {d.mat ? ` · mat ${d.mat}` : ''}
              </small>
            </button>
          ))}
        </aside>
        <div className="bk-main">
          {division && (
            <div className="btn-row" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
              {division.status === 'open' ? (
                <button className="btn btn-primary btn-sm" disabled={division.registrationCount < 2} onClick={() => run(() => divisionApi.draw(sel), 'Bracket drawn')}>
                  Draw bracket
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const played = division.matchesDone > 0;
                      if (played && !window.confirm('Matches have been played. Redraw and discard all results?')) return;
                      run(() => divisionApi.draw(sel, played), 'Bracket redrawn');
                    }}
                  >
                    Redraw
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => window.confirm('Clear this bracket? Registrations stay.') && run(() => divisionApi.clear(sel), 'Bracket cleared — registration reopened for this division')}
                  >
                    Clear bracket
                  </button>
                </>
              )}
            </div>
          )}
          {data ? <Bracket data={data} manage /> : <Loading what="Loading bracket" />}
        </div>
      </div>
    </div>
  );
}
