import { useState } from 'react';
import { Advantage, Confidence, EstimateDisclaimer } from './parts.jsx';

const CRITERIA_ORDER = [
  ['effectiveStriking', 'Effective striking', 'Plan A — primary'],
  ['effectiveGrappling', 'Effective grappling', 'Plan A — primary'],
  ['impact', 'Impact', 'Margin'],
  ['dominance', 'Dominance', 'Margin'],
  ['duration', 'Duration', 'Margin'],
  ['effectiveAggression', 'Effective aggression', 'Plan B — secondary'],
  ['cageControl', 'Fighting area control', 'Plan C — tertiary'],
];

/** ENGINE B output — the estimate, with its full reasoning exposed. */
export default function RoundIntelligence({
  roundNo,
  estimate,
  redName,
  blueName,
  canOverride,
  onOverride,
  onFlagInsufficient,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ advantage: '', note: '' });

  if (!estimate) return <div className="fa-empty">No estimate yet for round {roundNo}.</div>;

  const { winner, redScore, blueScore, margin, criteria, confidence, explanation, limitations, plan } =
    estimate;

  const headline =
    redScore === null
      ? 'No estimate'
      : winner === 'even'
      ? `Even ${margin}`
      : `${winner === 'red' ? redName : blueName} ${margin}`;

  const save = () => {
    onOverride(editing, draft);
    setEditing(null);
  };

  return (
    <>
      <EstimateDisclaimer />

      <div className="fa-estimate-head">
        <div>
          <div className="fa-stat-label" style={{ textAlign: 'left' }}>
            Round {roundNo} estimate
          </div>
          <div className="fa-estimate-score">
            <span className={winner === 'red' ? 'w-red' : ''}>{redScore ?? '–'}</span>
            <span style={{ color: 'var(--fa-muted)' }}> &ndash; </span>
            <span className={winner === 'blue' ? 'w-blue' : ''}>{blueScore ?? '–'}</span>
          </div>
          <div className="fa-note">{headline}</div>
        </div>
        <Confidence value={confidence} />
      </div>

      <div className="fa-panel">
        <h3>Why</h3>
        <p className="fa-explanation">{explanation}</p>
        {plan?.reason && (
          <p className="fa-note" style={{ marginTop: 10 }}>
            <b>Hierarchy:</b> {plan.used ? `Decided under Plan ${plan.used}. ` : ''}
            {plan.reason}
          </p>
        )}
        {limitations?.length > 0 && (
          <ul className="fa-limitations">
            {limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="fa-panel">
        <h3>
          Criteria <span className="muted">{redName} vs {blueName}</span>
        </h3>
        <table className="fa-criteria">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Evaluation</th>
              <th style={{ width: '14%' }}>Advantage</th>
              <th>Supporting statistics</th>
              {canOverride && <th style={{ width: '10%' }} />}
            </tr>
          </thead>
          <tbody>
            {CRITERIA_ORDER.map(([key, label, tier]) => {
              const c = criteria?.[key];
              if (!c) return null;
              return (
                <tr key={key}>
                  <td>
                    <b>{label}</b>
                    <div className="fa-note" style={{ fontSize: '0.68rem' }}>{tier}</div>
                  </td>
                  <td>
                    <Advantage value={c.advantage} />
                    {c.overridden && <span className="fa-overridden">set by analyst</span>}
                  </td>
                  <td className="fa-support">
                    {Object.entries(c.support || {}).map(([k, v]) => (
                      <div key={k}>
                        <b>{k}:</b> {v}
                      </div>
                    ))}
                    <div style={{ marginTop: 4, color: '#aeb6c6' }}>{c.rationale}</div>
                    {c.warning && <div style={{ marginTop: 4, color: '#fbbf24' }}>{c.warning}</div>}
                    {c.note && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{c.note}</div>}
                    {c.analystNote && (
                      <div style={{ marginTop: 4, color: '#d8b4fe' }}>Analyst: {c.analystNote}</div>
                    )}
                  </td>
                  {canOverride && (
                    <td>
                      <button
                        className="fa-btn sm"
                        onClick={() => {
                          setEditing(key);
                          setDraft({ advantage: c.advantage, note: c.analystNote || '' });
                        }}
                      >
                        Override
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {editing && (
          <div className="fa-panel" style={{ marginTop: 14, background: 'var(--fa-surface-2)' }}>
            <h3>Override &mdash; {CRITERIA_ORDER.find(([k]) => k === editing)?.[1]}</h3>
            <div className="fa-form-grid">
              <div className="fa-field">
                <label>Advantage</label>
                <select
                  value={draft.advantage}
                  onChange={(e) => setDraft({ ...draft, advantage: e.target.value })}
                >
                  <option value="">Use the computed value</option>
                  <option value="red">{redName} (red)</option>
                  <option value="blue">{blueName} (blue)</option>
                  <option value="even">Even</option>
                  <option value="insufficient">Insufficient data</option>
                </select>
              </div>
              <div className="fa-field">
                <label>Reason (recorded in the audit log)</label>
                <input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="Why the counts do not reflect what happened"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="fa-btn go" onClick={save}>Save override</button>
              <button className="fa-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {canOverride && (
          <div style={{ marginTop: 14 }}>
            <button className="fa-btn" onClick={onFlagInsufficient}>
              Flag this round as having insufficient evidence
            </button>
            <p className="fa-note" style={{ marginTop: 6 }}>
              Use this when the recording is too incomplete to support any estimate. The round is
              then reported as unscored rather than guessed.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
