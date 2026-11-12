import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import useFightSocket from '../../hooks/useFightSocket.js';
import { fightApi } from '../../api/fightApi.js';
import { errMsg } from '../../api/client.js';
import CornerPad from './CornerPad.jsx';
import LiveStats from './LiveStats.jsx';
import RoundIntelligence from './RoundIntelligence.jsx';
import EstimatedScorecard from './EstimatedScorecard.jsx';
import FoulsPanel from './FoulsPanel.jsx';
import { Status } from './parts.jsx';
import { fmtClock, eventLabel, ROLES, RESULT_METHODS } from '../../utils/fightConstants.js';
import '../../styles/analytics.css';

const TABS = [
  { id: 'record', label: 'Live recording' },
  { id: 'stats', label: 'Statistics' },
  { id: 'intelligence', label: 'Round scoring intelligence' },
  { id: 'scorecard', label: 'Estimated scorecard' },
  { id: 'fouls', label: 'Fouls & deductions' },
  { id: 'result', label: 'Official result' },
];

const ROLE_KEY = (boutId) => `scorehub.fightRole.${boutId}`;

/**
 * Fight analytics workspace.
 *
 * Sits alongside the judges' memory sheet — it never reads or writes their
 * scorecards. Three things are kept visually and structurally apart here:
 * what happened (statistics), how it might be scored (estimate), and what the
 * officials decided (official result).
 */
export default function FightAnalytics() {
  const { boutId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [role, setRole] = useState(() => {
    try {
      return localStorage.getItem(ROLE_KEY(boutId)) || 'statistician';
    } catch {
      return 'statistician';
    }
  });

  const tab = params.get('tab') || 'record';
  const setTab = (id) => setParams({ tab: id }, { replace: true });

  const { connected, snapshot, clock, liveStats, estimate, fouls, viewers, error, clearError, actions } =
    useFightSocket(boutId, role);

  const [scope, setScope] = useState('current');
  const [scorecard, setScorecard] = useState(null);
  const [roundEstimate, setRoundEstimate] = useState(null);
  const [localError, setLocalError] = useState('');
  const [resultForm, setResultForm] = useState({ method: '', winnerCorner: '', notes: '' });

  const bout = snapshot?.bout;
  const redName = bout?.redCorner?.fighter?.name || 'Red Corner';
  const blueName = bout?.blueCorner?.fighter?.name || 'Blue Corner';
  const roundNo = clock.currentRound || 1;

  const canRecord = role === 'statistician';
  const canAnalyse = role === 'statistician' || role === 'analyst';

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY(boutId), role);
    } catch {
      /* storage unavailable — the picker just defaults again */
    }
  }, [boutId, role]);

  // Scorecard and per-round estimate are pulled on demand; live rounds also
  // arrive over the socket.
  useEffect(() => {
    if (tab !== 'scorecard' && tab !== 'result') return;
    fightApi.scorecard(boutId).then(setScorecard).catch((e) => setLocalError(errMsg(e)));
  }, [boutId, tab, estimate]);

  useEffect(() => {
    if (tab !== 'intelligence') return;
    fightApi
      .estimate(boutId, roundNo)
      .then((r) => setRoundEstimate(r.estimate))
      .catch((e) => setLocalError(errMsg(e)));
  }, [boutId, tab, roundNo, estimate]);

  const shownEstimate =
    estimate?.roundNo === roundNo ? estimate.estimate : roundEstimate;

  const statsForScope = useMemo(() => {
    if (!snapshot?.stats) return liveStats?.stats || null;
    if (scope === 'fight') return snapshot.stats.fight;
    if (scope === 'current') {
      return liveStats?.roundNo === roundNo
        ? liveStats.stats
        : snapshot.stats.rounds.find((r) => r.roundNo === roundNo) || null;
    }
    const n = Number(scope);
    return snapshot.stats.rounds.find((r) => r.roundNo === n) || null;
  }, [snapshot, liveStats, scope, roundNo]);

  const scopeOptions = useMemo(() => {
    const opts = [{ value: 'current', label: `Round ${roundNo} (live)` }];
    for (let r = 1; r <= (clock.totalRounds || 3); r += 1) {
      if (r !== roundNo) opts.push({ value: String(r), label: `Round ${r}` });
    }
    opts.push({ value: 'fight', label: 'Whole fight' });
    return opts;
  }, [roundNo, clock.totalRounds]);

  const openControl = useMemo(() => {
    // The server closes the other corner's interval when one opens, so at most
    // one is live at a time. Derive which from this round's control totals.
    if (!snapshot) return null;
    return snapshot.openControlCorner || null;
  }, [snapshot]);

  const handleRecord = (payload) => actions.record({ ...payload, roundNo });

  const handleOverride = (criterion, draft) => {
    const overrides = { [criterion]: { advantage: draft.advantage || null, note: draft.note } };
    actions.assess({ roundNo, overrides, reason: draft.note });
  };

  const flagInsufficient = () => {
    if (!window.confirm(`Flag round ${roundNo} as having insufficient evidence to score?`)) return;
    actions.assess({ roundNo, insufficientEvidence: true });
  };

  const submitResult = (e) => {
    e.preventDefault();
    if (!resultForm.method) {
      setLocalError('Select a result method.');
      return;
    }
    if (!window.confirm('Confirm the OFFICIAL result? This is the decision of the officials, not an estimate.')) {
      return;
    }
    actions.result(resultForm);
    setLocalError('');
  };

  if (!snapshot) {
    return (
      <div className="fa">
        <div className="fa-empty">{error || localError || 'Connecting to the fight…'}</div>
      </div>
    );
  }

  return (
    <div className="fa">
      {/* ---------- header ---------- */}
      <div className="fa-head">
        <div>
          <div className="fa-event-name">
            {snapshot.bout?.league?.name || 'Event'} &middot; Bout {bout?.boutNo}
            {bout?.boutName ? ` · ${bout.boutName}` : ''}
          </div>
          <div className="fa-matchup">
            <span style={{ color: '#ff8095' }}>{redName}</span>
            <span className="vs">vs</span>
            <span style={{ color: '#85aaff' }}>{blueName}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Status value={clock.status} />
            <span className="fa-round-pill">
              Round {roundNo} of {clock.totalRounds} &middot; {fmtClock(clock.durationSec)} rounds
            </span>
          </div>
        </div>

        <div className="fa-clock-box">
          <div className={`fa-clock ${clock.running ? 'running' : ''}`}>{fmtClock(clock.elapsedSec)}</div>
          <div className="fa-round-pill">{fmtClock(clock.remainingSec)} remaining</div>
        </div>
      </div>

      {/* ---------- role + connection ---------- */}
      <div className="fa-role-bar">
        <span className={`fa-dot ${connected ? 'on' : ''}`} />
        {connected ? 'Live' : 'Reconnecting…'}
        <span>&middot;</span>
        <label htmlFor="fa-role">Console:</label>
        <select
          id="fa-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            background: 'var(--fa-surface-2)',
            border: '1px solid var(--fa-line)',
            color: 'var(--fa-text)',
            borderRadius: 7,
            padding: '4px 8px',
            fontSize: '0.78rem',
          }}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <span>&middot;</span>
        <span>{viewers.total} connected</span>
        <span style={{ marginLeft: 'auto' }}>
          <button className="fa-btn sm" onClick={() => navigate(`/bouts/${boutId}/summary`)}>
            Judges&rsquo; scorecard
          </button>
        </span>
      </div>

      {(error || localError) && (
        <div className="fa-panel" style={{ borderColor: 'var(--fa-red)' }}>
          <p style={{ color: '#fecaca', margin: 0, fontSize: '0.85rem' }}>{error || localError}</p>
          <button
            className="fa-btn sm"
            style={{ marginTop: 8 }}
            onClick={() => { clearError(); setLocalError(''); }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---------- clock controls ---------- */}
      {canRecord && (
        <div className="fa-controls">
          {!clock.running ? (
            <button className="fa-btn go" onClick={actions.start} disabled={clock.status === 'completed'}>
              {clock.elapsedSec > 0 ? 'Resume' : 'Start round'}
            </button>
          ) : (
            <button className="fa-btn stop" onClick={actions.pause}>Pause</button>
          )}
          <button className="fa-btn" onClick={actions.reset}>Reset round clock</button>
          <button
            className="fa-btn"
            onClick={() => {
              const v = window.prompt('Set the round clock to how many seconds?', String(clock.elapsedSec));
              if (v === null) return;
              const reason = window.prompt('Reason for the correction?') || '';
              actions.setClock(Number(v), reason);
            }}
          >
            Correct time
          </button>
          <button
            className="fa-btn"
            onClick={() => {
              const early = clock.remainingSec > 0
                ? window.prompt('Round ending early. Reason? (leave blank if it ran full)') || ''
                : '';
              actions.nextRound(early);
            }}
            disabled={clock.status === 'completed'}
          >
            End round &rarr;
          </button>
        </div>
      )}

      {/* ---------- tabs ---------- */}
      <div className="fa-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`fa-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- panels ---------- */}
      {tab === 'record' && (
        <>
          {!canRecord && (
            <div className="fa-panel">
              <p className="fa-note" style={{ margin: 0 }}>
                Switch the console to <b>Statistician</b> to record events.
              </p>
            </div>
          )}
          <div className="fa-corners">
            {['red', 'blue'].map((corner) => (
              <CornerPad
                key={corner}
                corner={corner}
                fighter={corner === 'red' ? bout?.redCorner?.fighter : bout?.blueCorner?.fighter}
                stats={statsForScope?.[corner]}
                disabled={!canRecord || clock.status === 'completed'}
                controlOpen={openControl === corner}
                controlElapsed={statsForScope?.[corner]?.controlSec || 0}
                onRecord={handleRecord}
                onControlStart={actions.controlStart}
                onControlStop={actions.controlStop}
                onControlActive={actions.controlActive}
              />
            ))}
          </div>
          <RecentFeed boutId={boutId} roundNo={roundNo} canEdit={canRecord} redName={redName} blueName={blueName} refreshKey={liveStats} />
        </>
      )}

      {tab === 'stats' && (
        <LiveStats stats={statsForScope} scope={scope} onScopeChange={setScope} scopeOptions={scopeOptions} />
      )}

      {tab === 'intelligence' && (
        <RoundIntelligence
          roundNo={roundNo}
          estimate={shownEstimate}
          redName={redName}
          blueName={blueName}
          canOverride={canAnalyse}
          onOverride={handleOverride}
          onFlagInsufficient={flagInsufficient}
        />
      )}

      {tab === 'scorecard' && (
        <EstimatedScorecard
          scorecard={scorecard?.scorecard}
          rounds={scorecard?.rounds}
          redName={redName}
          blueName={blueName}
        />
      )}

      {tab === 'fouls' && (
        <FoulsPanel
          boutId={boutId}
          fouls={fouls}
          roundNo={roundNo}
          redName={redName}
          blueName={blueName}
          canEdit={canRecord}
          onRecord={(payload) => actions.foul(payload)}
        />
      )}

      {tab === 'result' && (
        <>
          <div className="fa-banner-official">
            <strong>Official result.</strong> Entered and confirmed by an authorised administrator.
            The estimated scoring engine never writes here and never declares a winner.
          </div>

          {snapshot.officialResult?.method ? (
            <div className="fa-panel">
              <h3>Confirmed result</h3>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 6px' }}>
                {snapshot.officialResult.winnerCorner === 'red'
                  ? redName
                  : snapshot.officialResult.winnerCorner === 'blue'
                  ? blueName
                  : snapshot.officialResult.winnerCorner === 'draw'
                  ? 'Draw'
                  : 'No contest'}
              </p>
              <p className="fa-note">
                by {snapshot.officialResult.method}
                {snapshot.officialResult.endedRound
                  ? `, round ${snapshot.officialResult.endedRound} at ${fmtClock(snapshot.officialResult.endedAtSec)}`
                  : ''}
                {snapshot.officialResult.confirmedBy ? ` · confirmed by ${snapshot.officialResult.confirmedBy}` : ''}
              </p>
              {snapshot.officialResult.notes && (
                <p className="fa-note" style={{ marginTop: 8 }}>{snapshot.officialResult.notes}</p>
              )}
            </div>
          ) : (
            <div className="fa-panel">
              <h3>Enter the official result</h3>
              <form onSubmit={submitResult}>
                <div className="fa-form-grid">
                  <div className="fa-field">
                    <label>Method</label>
                    <select
                      value={resultForm.method}
                      onChange={(e) => setResultForm({ ...resultForm, method: e.target.value })}
                    >
                      <option value="">Select&hellip;</option>
                      {RESULT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="fa-field">
                    <label>Winner</label>
                    <select
                      value={resultForm.winnerCorner}
                      onChange={(e) => setResultForm({ ...resultForm, winnerCorner: e.target.value })}
                    >
                      <option value="">Select&hellip;</option>
                      <option value="red">{redName} (red)</option>
                      <option value="blue">{blueName} (blue)</option>
                      <option value="draw">Draw</option>
                      <option value="nc">No contest</option>
                    </select>
                  </div>
                  <div className="fa-field">
                    <label>Notes</label>
                    <input
                      value={resultForm.notes}
                      onChange={(e) => setResultForm({ ...resultForm, notes: e.target.value })}
                    />
                  </div>
                </div>
                <button className="fa-btn go">Confirm official result</button>
              </form>
            </div>
          )}

          {scorecard?.scorecard && (
            <div className="fa-panel">
              <h3>For comparison <span className="muted">the analytical estimate</span></h3>
              <p className="fa-note">
                Estimated leader:{' '}
                {scorecard.scorecard.leader === 'red'
                  ? redName
                  : scorecard.scorecard.leader === 'blue'
                  ? blueName
                  : scorecard.scorecard.leader === 'even'
                  ? 'level'
                  : 'not yet scored'}{' '}
                ({scorecard.scorecard.totals.red}&ndash;{scorecard.scorecard.totals.blue}). This is
                an estimate and carries no official weight.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Rolling feed of what was just recorded, with undo. */
function RecentFeed({ boutId, roundNo, canEdit, redName, blueName, refreshKey }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fightApi.events(boutId, { round: roundNo, limit: 25 }).then(setEvents).catch(() => setEvents([]));
  }, [boutId, roundNo, refreshKey]);

  const undo = async (ev) => {
    const reason = window.prompt('Reason for removing this entry? (required, kept in the audit log)');
    if (!reason) return;
    await fightApi.voidEvent(boutId, ev._id, reason);
    setEvents((list) => list.filter((e) => e._id !== ev._id));
  };

  return (
    <div className="fa-panel" style={{ marginTop: 16 }}>
      <h3>Recent entries <span className="muted">round {roundNo}</span></h3>
      {events.length === 0 ? (
        <div className="fa-empty">Nothing recorded yet this round.</div>
      ) : (
        <div className="fa-feed">
          {events.map((e) => (
            <div className="fa-feed-item" key={e._id}>
              <span>
                <span className={`who ${e.corner}`}>{e.corner === 'red' ? redName : blueName}</span>
                {' — '}
                {eventLabel(e.type)}
                {e.target ? ` (${e.target}${e.position ? `, ${e.position}` : ''})` : ''}
              </span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {fmtClock(e.fightTimeSec)}
                {canEdit && (
                  <button className="fa-btn sm" onClick={() => undo(e)}>Undo</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="fa-note" style={{ marginTop: 10 }}>
        Undo needs a reason and soft-deletes the entry. Statistics are recalculated from the
        remaining events, so nothing is ever double counted or silently rewritten.
      </p>
    </div>
  );
}
