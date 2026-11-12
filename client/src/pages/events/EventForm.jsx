import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tournamentApi } from '../../api/tournamentApi.js';
import { errMsg } from '../../api/client.js';
import { Field, TextField, SelectField } from '../../components/Field.jsx';
import { SPORTS, STATUS_LABEL, toDateInput } from '../../utils/tournament.js';

const EMPTY = {
  name: '', sport: 'bjj', startDate: '', endDate: '', venue: '', city: '', country: 'India',
  organizer: '', contactEmail: '', description: '', rules: '', registrationOpens: '', registrationCloses: '',
  feeAmount: 0, feeCurrency: 'INR', requireApproval: false, mats: 2, matchMinutes: 5, livestreamUrl: '',
  status: 'registration',
};

export default function EventForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [cover, setCover] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    tournamentApi
      .get(id)
      .then((t) =>
        setF({
          ...EMPTY,
          ...t,
          startDate: toDateInput(t.startDate),
          endDate: toDateInput(t.endDate),
          registrationOpens: toDateInput(t.registrationOpens),
          registrationCloses: toDateInput(t.registrationCloses),
          feeAmount: t.fee?.amount ?? 0,
          feeCurrency: t.fee?.currency || 'INR',
          matchMinutes: Math.round((t.matchDurationSec || 300) / 60),
        })
      )
      .catch((e) => setError(errMsg(e)));
  }, [id]);

  const on = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: f.name, sport: f.sport, startDate: f.startDate, endDate: f.endDate || null, venue: f.venue,
      city: f.city, country: f.country, organizer: f.organizer, contactEmail: f.contactEmail,
      description: f.description, rules: f.rules, registrationOpens: f.registrationOpens || null,
      registrationCloses: f.registrationCloses || null, requireApproval: f.requireApproval,
      mats: Number(f.mats), matchDurationSec: Math.round(Number(f.matchMinutes) * 60),
      livestreamUrl: f.livestreamUrl, status: f.status,
      fee: { amount: Number(f.feeAmount) || 0, currency: f.feeCurrency || 'INR' },
    };
    let payload = body;
    if (cover) {
      payload = new FormData();
      Object.entries(body).forEach(([k, v]) => payload.append(k, k === 'fee' ? JSON.stringify(v) : v ?? ''));
      payload.append('cover', cover);
    }
    try {
      const saved = id ? await tournamentApi.update(id, payload) : await tournamentApi.create(payload);
      navigate(id ? `/events/${saved._id}` : `/events/${saved._id}/manage`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card ev-form" onSubmit={submit}>
      <h2>{id ? 'Edit event' : 'Create event'}</h2>
      <div className="form-grid">
        <TextField label="Event name" value={f.name} onChange={on('name')} required />
        <SelectField label="Sport" value={f.sport} onChange={on('sport')} options={SPORTS} />
        <TextField label="Start date" type="date" value={f.startDate} onChange={on('startDate')} required />
        <TextField label="End date (optional)" type="date" value={f.endDate} onChange={on('endDate')} />
        <TextField label="Venue" value={f.venue} onChange={on('venue')} />
        <TextField label="City" value={f.city} onChange={on('city')} />
        <TextField label="Country" value={f.country} onChange={on('country')} />
        <TextField label="Organiser" value={f.organizer} onChange={on('organizer')} />
        <TextField label="Contact email" type="email" value={f.contactEmail} onChange={on('contactEmail')} />
        <TextField label="Livestream URL" value={f.livestreamUrl} onChange={on('livestreamUrl')} placeholder="https://youtube.com/…" />
        <TextField label="Registration opens" type="date" value={f.registrationOpens} onChange={on('registrationOpens')} />
        <TextField label="Registration closes" type="date" value={f.registrationCloses} onChange={on('registrationCloses')} />
        <TextField label="Entry fee" type="number" min="0" value={f.feeAmount} onChange={on('feeAmount')} />
        <TextField label="Currency" value={f.feeCurrency} onChange={on('feeCurrency')} />
        <TextField label="Mats" type="number" min="1" max="40" value={f.mats} onChange={on('mats')} />
        <TextField label="Default match length (minutes)" type="number" min="1" step="0.5" value={f.matchMinutes} onChange={on('matchMinutes')} />
        <SelectField
          label="Status"
          value={f.status}
          onChange={on('status')}
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Field label="Cover image">
          <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} />
        </Field>
        <Field label="Description" className="span-2">
          <textarea rows={3} value={f.description} onChange={on('description')} />
        </Field>
        <Field label="Rules" className="span-2">
          <textarea rows={3} value={f.rules} onChange={on('rules')} />
        </Field>
        <label className="ev-check span-2">
          <input type="checkbox" checked={f.requireApproval} onChange={on('requireApproval')} />
          Organiser must approve each registration before it goes into a bracket
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : 'Create event'}</button>
      </div>
    </form>
  );
}
