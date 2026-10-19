import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PillTable from '../components/PillTable.jsx';
import Modal from '../components/Modal.jsx';
import { TextField } from '../components/Field.jsx';
import { officialApi } from '../api/resources.js';
import { errMsg } from '../api/client.js';

const BLANK = { name: '', contactNo: '', bloodGroup: '', licenseNo: '' };

/** Shared screen for the Judge list and the Referee list. */
export default function OfficialList({ kind = 'judge' }) {
  const { id: leagueId } = useParams();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const label = kind === 'judge' ? 'Judge' : 'Referee';

  const load = () => {
    officialApi
      .list(leagueId, kind)
      .then(setRows)
      .catch((e) => setError(errMsg(e)));
  };

  useEffect(load, [leagueId, kind]);

  const openNew = () => {
    setForm({ ...BLANK });
    setEditing('new');
  };

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      contactNo: row.contactNo || '',
      bloodGroup: row.bloodGroup || '',
      licenseNo: row.licenseNo || '',
    });
    setEditing(row._id);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') await officialApi.create({ ...form, league: leagueId, kind });
      else await officialApi.update(editing, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name} from this league?`)) return;
    try {
      await officialApi.remove(row._id);
      setRows((list) => list.filter((r) => r._id !== row._id));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const columns = [
    { key: 'name', label: `${label} Name` },
    { key: 'contactNo', label: 'Contact No.' },
    { key: 'bloodGroup', label: 'Blood Group' },
    { key: 'edit', label: 'Edit', render: () => 'Edit', onClick: openEdit },
    {
      key: 'delete',
      label: 'Delete',
      width: '0.7fr',
      render: (r) => (
        <button className="icon-danger" onClick={() => remove(r)} aria-label="Remove">
          🗑
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="row-between">
        <span />
        <h2 className="page-title" style={{ margin: 0 }}>{label} List</h2>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          Add {label}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ marginTop: 20 }}>
        <PillTable columns={columns} rows={rows} empty={`No ${label.toLowerCase()}s added yet.`} />
      </div>

      {kind === 'judge' && (
        <p className="hint" style={{ textAlign: 'left', marginTop: 18 }}>
          Judges added here become selectable when building a bout panel. On fight night each
          judge opens the bout and picks their own name — there are no accounts or passwords.
        </p>
      )}

      <div style={{ marginTop: 22 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/leagues/${leagueId}`)}>
          Back
        </button>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} dismissable>
          <h3>{editing === 'new' ? `Add ${label}` : `Edit ${label}`}</h3>
          <form onSubmit={save} className="stack" style={{ textAlign: 'left' }}>
            <TextField
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <TextField
              label="Contact No."
              value={form.contactNo}
              onChange={(e) => setForm({ ...form, contactNo: e.target.value })}
            />
            <TextField
              label="Blood Group"
              value={form.bloodGroup}
              onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
            />
            <TextField
              label="License No."
              value={form.licenseNo}
              onChange={(e) => setForm({ ...form, licenseNo: e.target.value })}
            />

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
