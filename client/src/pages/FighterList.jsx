import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PillTable from '../components/PillTable.jsx';
import Modal from '../components/Modal.jsx';
import { TextField, SelectField } from '../components/Field.jsx';
import { fighterApi } from '../api/resources.js';
import { errMsg, mediaUrl } from '../api/client.js';

const BLANK = {
  name: '',
  nickname: '',
  team: '',
  country: '',
  weightClass: '',
  weightKg: '',
  age: '',
  gender: 'male',
  contactNo: '',
  bloodGroup: '',
};

export default function FighterList() {
  const { id: leagueId } = useParams();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fighterApi
      .list(leagueId)
      .then(setRows)
      .catch((e) => setError(errMsg(e)));
  };

  useEffect(load, [leagueId]);

  const openNew = () => {
    setForm({ ...BLANK });
    setPhoto(null);
    setEditing('new');
  };

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      nickname: row.nickname || '',
      team: row.team || '',
      country: row.country || '',
      weightClass: row.weightClass || '',
      weightKg: row.weightKg || '',
      age: row.age || '',
      gender: row.gender || 'male',
      contactNo: row.contactNo || '',
      bloodGroup: row.bloodGroup || '',
    });
    setPhoto(null);
    setEditing(row._id);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('league', leagueId);
      if (photo) fd.append('photo', photo);

      if (editing === 'new') await fighterApi.create(fd);
      else await fighterApi.update(editing, fd);

      setEditing(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name}?`)) return;
    try {
      await fighterApi.remove(row._id);
      setRows((list) => list.filter((r) => r._id !== row._id));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const columns = [
    {
      key: 'photo',
      label: 'Photo',
      width: '0.6fr',
      render: (r) =>
        r.photoUrl ? (
          <img
            src={mediaUrl(r.photoUrl)}
            alt={r.name}
            style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          '—'
        ),
    },
    { key: 'name', label: 'Fighter Name' },
    { key: 'team', label: 'Team' },
    { key: 'weightClass', label: 'Weight Class' },
    { key: 'record', label: 'Record', render: (r) => `${r.record?.wins ?? 0}-${r.record?.losses ?? 0}-${r.record?.draws ?? 0}` },
    { key: 'edit', label: 'Edit', render: () => 'Edit', onClick: openEdit },
    {
      key: 'delete',
      label: 'Delete',
      render: (r) => (
        <button className="icon-danger" onClick={() => remove(r)} aria-label="Remove fighter">
          🗑
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="row-between">
        <span />
        <h2 className="page-title" style={{ margin: 0 }}>Fighter List</h2>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          Add Fighter
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ marginTop: 20 }}>
        <PillTable columns={columns} rows={rows} empty="No fighters added yet." />
      </div>

      <div style={{ marginTop: 22 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/leagues/${leagueId}`)}>
          Back
        </button>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} dismissable>
          <h3>{editing === 'new' ? 'Add Fighter' : 'Edit Fighter'}</h3>
          <form onSubmit={save} className="stack" style={{ textAlign: 'left' }}>
            <TextField
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Nickname"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
            <TextField
              label="Team"
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
            />
            <TextField
              label="Weight Class"
              value={form.weightClass}
              onChange={(e) => setForm({ ...form, weightClass: e.target.value })}
            />
            <TextField
              label="Weight (kg)"
              type="number"
              step="0.1"
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            />
            <SelectField
              label="Gender"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <div className="field">
              <label>Photo</label>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
            </div>

            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
