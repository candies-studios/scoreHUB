import { StatRow } from './parts.jsx';
import { fmtClock } from '../../utils/fightConstants.js';

/** ENGINE A output — recorded statistics only. No estimates on this screen. */
export default function LiveStats({ stats, scope, onScopeChange, scopeOptions }) {
  if (!stats) return <div className="fa-empty">No statistics yet.</div>;

  const { red, blue } = stats;

  return (
    <>
      <div className="fa-tabs" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 12 }}>
        {scopeOptions.map((o) => (
          <button
            key={o.value}
            className={`fa-tab ${scope === o.value ? 'active' : ''}`}
            onClick={() => onScopeChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="fa-panel">
        <h3>
          Striking <span className="muted">recorded statistics</span>
        </h3>
        <StatRow
          label="Significant strikes"
          red={red.sigLanded}
          blue={blue.sigLanded}
          redSub={`/${red.sigAttempted}`}
          blueSub={`/${blue.sigAttempted}`}
        />
        <StatRow
          label="Sig. strike accuracy"
          red={`${red.sigAccuracy ?? 0}%`}
          blue={`${blue.sigAccuracy ?? 0}%`}
          bar={false}
        />
        <StatRow
          label="Total strikes"
          red={red.totalLanded}
          blue={blue.totalLanded}
          redSub={`/${red.totalAttempted}`}
          blueSub={`/${blue.totalAttempted}`}
        />
        <StatRow label="Head" red={red.headLanded} blue={blue.headLanded} />
        <StatRow label="Body" red={red.bodyLanded} blue={blue.bodyLanded} />
        <StatRow label="Leg" red={red.legLanded} blue={blue.legLanded} />
        <StatRow label="Distance" red={red.distanceLanded} blue={blue.distanceLanded} />
        <StatRow label="Clinch" red={red.clinchLanded} blue={blue.clinchLanded} />
        <StatRow label="Ground" red={red.groundLanded} blue={blue.groundLanded} />
        <StatRow label="Knockdowns" red={red.knockdowns} blue={blue.knockdowns} />
      </div>

      <div className="fa-panel">
        <h3>
          Grappling <span className="muted">recorded statistics</span>
        </h3>
        <StatRow
          label="Takedowns"
          red={red.takedownsLanded}
          blue={blue.takedownsLanded}
          redSub={`/${red.takedownsAttempted}`}
          blueSub={`/${blue.takedownsAttempted}`}
        />
        <StatRow
          label="Takedown accuracy"
          red={`${red.takedownAccuracy ?? 0}%`}
          blue={`${blue.takedownAccuracy ?? 0}%`}
          bar={false}
        />
        <StatRow label="Submission attempts" red={red.submissionAttempts} blue={blue.submissionAttempts} />
        <StatRow label="Reversals" red={red.reversals} blue={blue.reversals} />
        <StatRow label="Sweeps" red={red.sweeps} blue={blue.sweeps} />
        <StatRow label="Positional advances" red={red.positionalAdvances} blue={blue.positionalAdvances} />
        <StatRow
          label="Control time"
          red={fmtClock(red.controlSec)}
          blue={fmtClock(blue.controlSec)}
          bar={false}
        />
        <StatRow
          label="Active control"
          red={fmtClock(red.activeControlSec)}
          blue={fmtClock(blue.activeControlSec)}
          bar={false}
        />
        <p className="fa-note" style={{ marginTop: 10 }}>
          Control time is summed from recorded intervals, never inferred from takedowns. Active
          control is the portion where offensive output was recorded.
        </p>
      </div>

      <div className="fa-panel">
        <h3>
          Observations <span className="muted">analyst judgement, kept separate from counts</span>
        </h3>
        <StatRow label="Damage observed" red={red.damageObserved} blue={blue.damageObserved} />
        <StatRow label="Cuts" red={red.cuts} blue={blue.cuts} />
        <StatRow label="Swelling" red={red.swelling} blue={blue.swelling} />
        <StatRow
          label="Opponent forced to defend"
          red={red.sustainedDefenceForced}
          blue={blue.sustainedDefenceForced}
        />
        <StatRow label="Effective sequences" red={red.effectiveSequences} blue={blue.effectiveSequences} />
      </div>

      <div className="fa-panel">
        <h3>
          Differentials <span className="muted">red minus blue</span>
        </h3>
        <div className="fa-support" style={{ display: 'grid', gap: 6 }}>
          {Object.entries(stats.differentials || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{humanise(k)}</b>
              <span style={{ color: v > 0 ? '#ffb3c0' : v < 0 ? '#b3ccff' : 'var(--fa-muted)' }}>
                {k.toLowerCase().includes('sec') ? fmtClock(Math.abs(v)) : Math.abs(v)}
                {v === 0 ? ' (level)' : v > 0 ? ' red' : ' blue'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(red.pointsDeducted > 0 || blue.pointsDeducted > 0) && (
        <div className="fa-panel">
          <h3>Point deductions</h3>
          <StatRow label="Points deducted" red={red.pointsDeducted} blue={blue.pointsDeducted} bar={false} />
        </div>
      )}
    </>
  );
}

function humanise(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(' Sec', ' time');
}
