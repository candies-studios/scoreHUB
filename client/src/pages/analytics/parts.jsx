import { DISCLAIMER } from '../../utils/fightConstants.js';

/**
 * The permanent disclaimer required by section 1. Shown on every screen that
 * displays an estimate, so an estimate is never seen without it.
 */
export function EstimateDisclaimer({ compact = false }) {
  if (compact) {
    return <p className="fa-note" style={{ color: '#d8b4fe' }}>{DISCLAIMER}</p>;
  }
  return (
    <div className="fa-disclaimer">
      <strong>Estimated analytical scoring only.</strong> These are not official judges&rsquo;
      scorecards or regulatory decisions. Official results are entered separately by an
      authorised administrator.
    </div>
  );
}

export function StatRow({ label, red, blue, redSub, blueSub, bar = true }) {
  const r = Number(red) || 0;
  const b = Number(blue) || 0;
  const total = r + b;
  const redPct = total > 0 ? (r / total) * 100 : 50;

  return (
    <div className="fa-stat-row">
      <div className="fa-stat-value red">
        {red}
        {redSub !== undefined && <span className="sub">{redSub}</span>}
      </div>
      <div>
        <div className="fa-stat-label">{label}</div>
        {bar && (
          <div className="fa-bar">
            <div className="seg-red" style={{ width: `${redPct}%` }} />
            <div className="seg-blue" style={{ width: `${100 - redPct}%` }} />
          </div>
        )}
      </div>
      <div className="fa-stat-value blue">
        {blueSub !== undefined && <span className="sub">{blueSub}</span>}
        {blue}
      </div>
    </div>
  );
}

export function Advantage({ value }) {
  const label =
    value === 'red' ? 'Red' : value === 'blue' ? 'Blue' : value === 'even' ? 'Even' : 'Insufficient data';
  return <span className={`fa-adv ${value}`}>{label}</span>;
}

export function Confidence({ value }) {
  const label =
    value === 'high'
      ? 'High confidence'
      : value === 'medium'
      ? 'Medium confidence'
      : value === 'low'
      ? 'Low confidence'
      : 'Insufficient data';
  return <span className={`fa-confidence ${value || 'insufficient'}`}>{label}</span>;
}

export function Status({ value }) {
  const cls = value === 'live' ? 'live' : value === 'completed' ? 'completed' : '';
  return <span className={`fa-status ${cls}`}>{(value || 'scheduled').replace('_', ' ')}</span>;
}
