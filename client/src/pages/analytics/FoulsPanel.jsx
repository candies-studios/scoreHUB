import { useEffect, useState } from 'react';
import { fightApi } from '../../api/fightApi.js';
import { fmtClock } from '../../utils/fightConstants.js';
import { errMsg } from '../../api/client.js';

const BLANK = {
  corner: 'red',
  category: '',
  intent: 'undetermined',
  refereeAction: 'none',
  pointsDeducted: 0,
  medicalTimeout: false,
  notes: '',
};

/**
 * Section 9 — fouls and deductions.
 *
 * Nothing here is automatic. A deduction is stored only when the operator
 * records that the referee announced one; the application never infers a foul
 * or decides a penalty.
 */
export default function FoulsPanel({ boutId, fouls, roundNo, redName, blueName, canEdit, onRecord }) {
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fightApi.meta().then(setMeta).catch((e) => setError(errMsg(e)));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category) {
      setError('Select a foul category.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onRecord({ ...form, roundNo });
      setForm(BLANK);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const voidFoul = async (foul) => {
    const reason = window.prompt('Reason for removing this foul record?');
    if (!reason) return;
    try {
      await fightApi.voidFoul(boutId, foul._id, reason);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const label = (cat) => meta?.foulCategories?.find((c) => c.value === cat)?.label || cat;

  return (
    <>
      <div className="fa-banner-official">
        Fouls and point deductions are <strong>official referee decisions</strong>. Record them only
        as announced. The analytics engine never decides that a foul occurred or that points should
        be taken.
      </div>

      {canEdit && (
        <div className="fa-panel">
          <h3>Record a foul <span className="muted">round {roundNo}</span></h3>
          <form onSubmit={submit}>
            <div className="fa-form-grid">
              <div className="fa-field">
                <label>Fighter responsible</label>
                <select value={form.corner} onChange={(e) => setForm({ ...form, corner: e.target.value })}>
                  <option value="red">{redName} (red)</option>
                  <option value="blue">{blueName} (blue)</option>
                </select>
              </div>

              <div className="fa-field">
                <label>Foul category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select&hellip;</option>
                  {meta?.foulCategories?.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="fa-field">
                <label>Intent</label>
                <select value={form.intent} onChange={(e) => setForm({ ...form, intent: e.target.value })}>
                  <option value="undetermined">Undetermined</option>
                  <option value="accidental">Accidental</option>
                  <option value="intentional">Intentional</option>
                </select>
              </div>

              <div className="fa-field">
                <label>Referee decision</label>
                <select
                  value={form.refereeAction}
                  onChange={(e) => {
                    const refereeAction = e.target.value;
                    setForm({
                      ...form,
                      refereeAction,
                      pointsDeducted: refereeAction === 'point_deduction' ? Math.max(1, form.pointsDeducted) : 0,
                    });
                  }}
                >
                  {meta?.refereeActions?.map((a) => (
                    <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              {form.refereeAction === 'point_deduction' && (
                <div className="fa-field">
                  <label>Points deducted (as announced)</label>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    value={form.pointsDeducted}
                    onChange={(e) => setForm({ ...form, pointsDeducted: Number(e.target.value) })}
                  />
                </div>
              )}

              <div className="fa-field">
                <label>Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', margin: '4px 0 12px' }}>
              <input
                type="checkbox"
                checked={form.medicalTimeout}
                onChange={(e) => setForm({ ...form, medicalTimeout: e.target.checked })}
              />
              Medical timeout given
            </label>

            {error && <p style={{ color: '#fecaca', fontSize: '0.82rem' }}>{error}</p>}

            <button className="fa-btn go" disabled={busy}>
              {busy ? 'Recording…' : 'Record foul'}
            </button>
          </form>
        </div>
      )}

      <div className="fa-panel">
        <h3>Recorded fouls <span className="muted">{fouls.length} total</span></h3>
        {fouls.length === 0 ? (
          <div className="fa-empty">No fouls recorded.</div>
        ) : (
          <table className="fa-card-table">
            <thead>
              <tr>
                <th>Round</th>
                <th>Time</th>
                <th>Fighter</th>
                <th>Foul</th>
                <th>Intent</th>
                <th>Referee decision</th>
                <th>Points</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {fouls.map((f) => (
                <tr key={f._id}>
                  <td>{f.roundNo}</td>
                  <td>{fmtClock(f.fightTimeSec)}</td>
                  <td style={{ color: f.corner === 'red' ? '#ffb3c0' : '#b3ccff' }}>
                    {f.corner === 'red' ? redName : blueName}
                  </td>
                  <td>{label(f.category)}</td>
                  <td>{f.intent}</td>
                  <td>{(f.refereeAction || 'none').replace(/_/g, ' ')}</td>
                  <td className="num">{f.pointsDeducted || '–'}</td>
                  {canEdit && (
                    <td>
                      <button className="fa-btn sm" onClick={() => voidFoul(f)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
