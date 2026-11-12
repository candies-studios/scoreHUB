import { useState } from 'react';
import {
  STRIKE_BUTTONS,
  GRAPPLING_BUTTONS,
  OBSERVATION_BUTTONS,
  STRIKE_TARGETS,
  STRIKE_POSITIONS,
  CONTROL_POSITIONS,
  fmtClock,
} from '../../utils/fightConstants.js';

const isStrike = (type) => type.includes('strike');

/**
 * ENGINE A input — the statistician's console for one corner.
 *
 * Counts and observations are visually distinct because they are different
 * kinds of claim: a strike count is something that happened, an observation is
 * somebody's judgement about it. Only the latter can widen a round past 10-9.
 */
export default function CornerPad({
  corner,
  fighter,
  stats,
  disabled,
  controlOpen,
  controlElapsed,
  onRecord,
  onControlStart,
  onControlStop,
  onControlActive,
}) {
  const [target, setTarget] = useState('head');
  const [position, setPosition] = useState('distance');
  const [controlPosition, setControlPosition] = useState('top');

  const fire = (type) => {
    if (disabled) return;
    onRecord({
      corner,
      type,
      target: isStrike(type) ? target : null,
      position: isStrike(type) ? position : null,
    });
  };

  const s = stats || {};

  return (
    <div className={`fa-corner ${corner}`}>
      <div className="fa-corner-tag">{corner} corner</div>
      <div className="fa-corner-name">{fighter?.name || `${corner} corner`}</div>
      <div className="fa-corner-meta">
        {[fighter?.team, fighter?.weightClass].filter(Boolean).join(' · ') || 'No profile data'}
      </div>

      {/* ---- strike qualifiers apply to the next strike recorded ---- */}
      <div className="fa-group-label">Strike location &amp; position</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STRIKE_TARGETS.map((t) => (
          <button
            key={t.value}
            className={`fa-btn sm ${target === t.value ? 'go' : ''}`}
            onClick={() => setTarget(t.value)}
            disabled={disabled}
          >
            {t.label}
          </button>
        ))}
        <span style={{ width: 10 }} />
        {STRIKE_POSITIONS.map((p) => (
          <button
            key={p.value}
            className={`fa-btn sm ${position === p.value ? 'go' : ''}`}
            onClick={() => setPosition(p.value)}
            disabled={disabled}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="fa-group-label">Striking</div>
      <div className="fa-pad">
        {STRIKE_BUTTONS.map((b) => (
          <button
            key={b.type}
            className={`fa-key ${b.tone}`}
            onClick={() => fire(b.type)}
            disabled={disabled}
          >
            <span className="k-main">{b.label}</span>
            {b.sub && <span className="k-sub">{b.sub}</span>}
          </button>
        ))}
      </div>

      <div className="fa-group-label">Grappling</div>
      <div className="fa-pad">
        {GRAPPLING_BUTTONS.map((b) => (
          <button
            key={b.type}
            className={`fa-key ${b.tone}`}
            onClick={() => fire(b.type)}
            disabled={disabled}
          >
            <span className="k-main">{b.label}</span>
            {b.sub && <span className="k-sub">{b.sub}</span>}
          </button>
        ))}
      </div>

      {/* ---- control time, measured not inferred ---- */}
      <div className="fa-group-label">Control time</div>
      <div className="fa-control-row">
        <select
          value={controlPosition}
          onChange={(e) => setControlPosition(e.target.value)}
          disabled={disabled}
          style={{
            background: 'var(--fa-surface-2)',
            border: '1px solid var(--fa-line)',
            color: 'var(--fa-text)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: '0.8rem',
          }}
        >
          {CONTROL_POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {!controlOpen ? (
          <button
            className="fa-btn sm go"
            onClick={() => onControlStart(corner, controlPosition)}
            disabled={disabled}
          >
            Start control
          </button>
        ) : (
          <>
            <button className="fa-btn sm stop" onClick={() => onControlStop(false)} disabled={disabled}>
              Stop control
            </button>
            <button className="fa-btn sm" onClick={onControlActive} disabled={disabled}>
              Mark working
            </button>
            <span className="fa-control-live">{fmtClock(controlElapsed)}</span>
          </>
        )}
      </div>
      <p className="fa-note" style={{ marginTop: 6 }}>
        Total {fmtClock(s.controlSec)} &middot; active {fmtClock(s.activeControlSec)}. Control with
        no recorded offence is not credited as effective grappling.
      </p>

      {/* ---- observations: judgement, not counts ---- */}
      <div className="fa-group-label">Observations &mdash; analyst judgement</div>
      <div className="fa-pad">
        {OBSERVATION_BUTTONS.map((b) => (
          <button
            key={b.type}
            className="fa-key observation"
            onClick={() => fire(b.type)}
            disabled={disabled}
          >
            <span className="k-main">{b.label}</span>
            {b.sub && <span className="k-sub">{b.sub}</span>}
          </button>
        ))}
      </div>
      <p className="fa-obs-hint">
        These are qualitative. They are kept out of the striking and grappling counts, and they are
        the only evidence that can justify a round wider than 10-9.
      </p>
    </div>
  );
}
