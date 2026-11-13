import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TextField, Stepper } from '../components/Field.jsx';
import { leagueApi } from '../api/resources.js';
import { errMsg, mediaUrl } from '../api/client.js';
import { fmtDateInput } from '../utils/format.js';

const EMPTY = {
  name: '',
  date: '',
  time: '',
  location: '',
  promoter: '',
  bouts: { amateurMMA: 0, amateurBJJ: 0, amateurK1: 0, proMMA: 0, proBJJ: 0, proK1: 0 },
};

export default function LeagueForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [logo, setLogo] = useState(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    leagueApi
      .get(id)
      .then((l) => {
        setForm({
          name: l.name || '',
          date: fmtDateInput(l.date),
          time: l.time || '',
          location: l.location || '',
          promoter: l.promoter || '',
          bouts: { ...EMPTY.bouts, ...(l.bouts || {}) },
        });
        setLogoUrl(l.logoUrl || '');
      })
      .catch((e) => setError(errMsg(e)));
  }, [id, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBout = (k, v) => setForm((f) => ({ ...f, bouts: { ...f.bouts, [k]: v } }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('date', form.date);
      fd.append('time', form.time);
      fd.append('location', form.location);
      fd.append('promoter', form.promoter);
      fd.append('bouts', JSON.stringify(form.bouts));
      if (logo) fd.append('logo', logo);

      const saved = isEdit ? await leagueApi.update(id, fd) : await leagueApi.create(fd);
      navigate(`/leagues/${saved._id}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {logoUrl && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src={mediaUrl(logoUrl)} alt="League logo" style={{ height: 78, borderRadius: 8 }} />
        </div>
      )}

      <div className="form-grid">
        <TextField
          label="League Name"
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <TextField
            label="League Date"
            type="date"
            required
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
          <TextField
            label="Time"
            type="time"
            required
            value={form.time}
            onChange={(e) => set('time', e.target.value)}
          />
        </div>

        <TextField
          label="League Location"
          required
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
        />
        <TextField
          label="Promoter Name"
          value={form.promoter}
          onChange={(e) => set('promoter', e.target.value)}
        />

        <Stepper
          label="No. of Amateur MMA Bouts"
          value={form.bouts.amateurMMA}
          onChange={(v) => setBout('amateurMMA', v)}
        />
        <Stepper
          label="No. of Pro MMA Bouts"
          value={form.bouts.proMMA}
          onChange={(v) => setBout('proMMA', v)}
        />
        <Stepper
          label="No. of Amateur BJJ Bouts"
          value={form.bouts.amateurBJJ}
          onChange={(v) => setBout('amateurBJJ', v)}
        />
        <Stepper
          label="No. of Pro BJJ Bouts"
          value={form.bouts.proBJJ}
          onChange={(v) => setBout('proBJJ', v)}
        />
        <Stepper
          label="No. of Amateur K1 Bouts"
          value={form.bouts.amateurK1}
          onChange={(v) => setBout('amateurK1', v)}
        />

        <div className="field">
          <label>Upload League Logo</label>
          <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} />
        </div>
      </div>

      {error && <p className="error-text" style={{ textAlign: 'center', marginTop: 16 }}>{error}</p>}

      <div className="row-between" style={{ marginTop: 26 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          Back
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Update' : 'Create League'}
        </button>
        <span style={{ width: 60 }} />
      </div>

      {isEdit && (
        <div className="btn-row" style={{ marginTop: 34 }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/leagues/${id}/fighters`)}>
            Fighter list
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/leagues/${id}/referees`)}>
            Referee list
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/leagues/${id}/bouts`)}>
            Bout list
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/leagues/${id}/judges`)}>
            Judge list
          </button>
        </div>
      )}
    </form>
  );
}
