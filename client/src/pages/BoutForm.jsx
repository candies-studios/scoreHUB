import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TextField, SelectField } from '../components/Field.jsx';
import { boutApi, fighterApi, officialApi } from '../api/resources.js';
import { errMsg } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';
import { fmtDateInput, ROUND_DURATIONS } from '../utils/format.js';

const BLANK = {
  boutNo: 1,
  boutName: '',
  boutType: 'Professional',
  discipline: 'MMA',
  boutDate: '',
  ringNo: 1,
  totalRounds: 3,
  roundDurationSec: 300,
  blueCornerFighter: '',
  redCornerFighter: '',
  judges: ['', '', ''],
  referee: '',
};

export default function BoutForm() {
  const { id: leagueId, boutId } = useParams();
  const isEdit = Boolean(boutId);
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK);
  const [fighters, setFighters] = useState([]);
  const [judges, setJudges] = useState([]);
  const [referees, setReferees] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fighterApi.list(leagueId),
      officialApi.list(leagueId, 'judge'),
      officialApi.list(leagueId, 'referee'),
    ])
      .then(([f, j, r]) => {
        setFighters(f);
        setJudges(j);
        setReferees(r);
      })
      .catch((e) => setError(errMsg(e)));
  }, [leagueId]);

  useEffect(() => {
    if (!isEdit) return;
    boutApi
      .get(boutId)
      .then((b) => {
        const panel = (b.judges || []).map((j) => j._id || j);
        setForm({
          boutNo: b.boutNo,
          boutName: b.boutName || '',
          boutType: b.boutType,
          discipline: b.discipline,
          boutDate: fmtDateInput(b.boutDate),
          ringNo: b.ringNo || 1,
          totalRounds: b.totalRounds,
          roundDurationSec: b.roundDurationSec,
          blueCornerFighter: b.blueCorner?.fighter?._id || '',
          redCornerFighter: b.redCorner?.fighter?._id || '',
          judges: [panel[0] || '', panel[1] || '', panel[2] || ''],
          referee: b.referee?._id || '',
        });
      })
      .catch((e) => setError(errMsg(e)));
  }, [boutId, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setJudge = (i, v) =>
    setForm((f) => {
      const next = [...f.judges];
      next[i] = v;
      return { ...f, judges: next };
    });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        league: leagueId,
        boutNo: Number(form.boutNo),
        ringNo: Number(form.ringNo),
        totalRounds: Number(form.totalRounds),
        roundDurationSec: Number(form.roundDurationSec),
        judges: form.judges.filter(Boolean),
      };
      if (isEdit) await boutApi.update(boutId, payload);
      else await boutApi.create(payload);
      navigate(`/leagues/${leagueId}/bouts`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const fighterOptions = fighters.map((f) => ({ value: f._id, label: f.name }));
  const judgeOptions = judges.map((j) => ({ value: j._id, label: j.name }));
  const refOptions = referees.map((r) => ({ value: r._id, label: r.name }));

  const photoOf = (id) => fighters.find((f) => f._id === id)?.photoUrl;
  const nameOf = (id) => fighters.find((f) => f._id === id)?.name || '';

  return (
    <form onSubmit={submit}>
      <div className="banner">{isEdit ? 'Edit Bout' : 'Add Bout'}</div>

      <div className="form-grid">
        <SelectField
          label="Bout Type"
          value={form.boutType}
          onChange={(e) => set('boutType', e.target.value)}
          options={[
            { value: 'Professional', label: 'Professional' },
            { value: 'Amateur', label: 'Amateur' },
          ]}
        />
        <TextField
          label="Bout Date"
          type="date"
          required
          value={form.boutDate}
          onChange={(e) => set('boutDate', e.target.value)}
        />

        <TextField
          label="Bout Number"
          type="number"
          min="1"
          required
          value={form.boutNo}
          onChange={(e) => set('boutNo', e.target.value)}
        />
        <TextField
          label="Bout Name"
          placeholder="Flyweight"
          value={form.boutName}
          onChange={(e) => set('boutName', e.target.value)}
        />

        <SelectField
          label="Total Rounds"
          value={form.totalRounds}
          onChange={(e) => set('totalRounds', e.target.value)}
          options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
        />
        <SelectField
          label="Round Duration"
          value={form.roundDurationSec}
          onChange={(e) => set('roundDurationSec', e.target.value)}
          options={ROUND_DURATIONS}
        />

        <SelectField
          label="Discipline"
          value={form.discipline}
          onChange={(e) => set('discipline', e.target.value)}
          options={['MMA', 'BJJ', 'K1'].map((d) => ({ value: d, label: d }))}
        />
        <TextField
          label="Ring No."
          type="number"
          min="1"
          value={form.ringNo}
          onChange={(e) => set('ringNo', e.target.value)}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 28,
          alignItems: 'start',
          marginTop: 26,
        }}
      >
        <div className="stack">
          <SelectField
            label="Blue Corner"
            className="blue"
            required
            placeholder="Select fighter"
            value={form.blueCornerFighter}
            onChange={(e) => set('blueCornerFighter', e.target.value)}
            options={fighterOptions}
          />
          {form.blueCornerFighter && (
            <div style={{ margin: '0 auto' }}>
              <Avatar
                name={nameOf(form.blueCornerFighter)}
                photoUrl={photoOf(form.blueCornerFighter)}
                corner="blue"
                size={126}
                rounded="8px"
              />
            </div>
          )}
        </div>

        <div style={{ fontSize: '2.4rem', fontWeight: 800, alignSelf: 'center', fontStyle: 'italic' }}>
          VS
        </div>

        <div className="stack">
          <SelectField
            label="Red Corner"
            className="red"
            required
            placeholder="Select fighter"
            value={form.redCornerFighter}
            onChange={(e) => set('redCornerFighter', e.target.value)}
            options={fighterOptions}
          />
          {form.redCornerFighter && (
            <div style={{ margin: '0 auto' }}>
              <Avatar
                name={nameOf(form.redCornerFighter)}
                photoUrl={photoOf(form.redCornerFighter)}
                corner="red"
                size={126}
                rounded="8px"
              />
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 22,
          marginTop: 28,
        }}
      >
        {[0, 1, 2].map((i) => (
          <SelectField
            key={i}
            label={`Add Judge ${i + 1}`}
            placeholder="Select judge"
            value={form.judges[i]}
            onChange={(e) => setJudge(i, e.target.value)}
            options={judgeOptions}
          />
        ))}
      </div>

      <div style={{ maxWidth: 320, margin: '22px auto 0' }}>
        <SelectField
          label="Add Referee"
          placeholder="Select referee"
          value={form.referee}
          onChange={(e) => set('referee', e.target.value)}
          options={refOptions}
        />
      </div>

      {error && <p className="error-text" style={{ textAlign: 'center', marginTop: 16 }}>{error}</p>}

      <div className="row-between" style={{ marginTop: 28 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          Back
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Update' : 'Create Bout'}
        </button>
        <span style={{ width: 60 }} />
      </div>
    </form>
  );
}
