import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import useFightSocket from '../../hooks/useFightSocket.js';
import { fightApi } from '../../api/fightApi.js';
import LiveStats from './LiveStats.jsx';
import EstimatedScorecard from './EstimatedScorecard.jsx';
import { Status, EstimateDisclaimer, Confidence } from './parts.jsx';
import { fmtClock } from '../../utils/fightConstants.js';
import '../../styles/analytics.css';

/**
 * Section 11 — public live fight page.
 *
 * Joins the analytics room as a spectator. The server refuses recording events
 * from this role, so the read-only guarantee does not rely on the absence of
 * buttons here.
 */
export default function PublicFight() {
  const { boutId } = useParams();
  const { connected, snapshot, clock, liveStats, estimate, fouls } = useFightSocket(boutId, 'public');
  const [tab, setTab] = useState('stats');
  const [scope, setScope] = useState('current');
  const [scorecard, setScorecard] = useState(null);

  useEffect(() => {
    if (tab !== 'scorecard') return;
    fightApi.scorecard(boutId).then(setScorecard).catch(() => setScorecard(null));
  }, [boutId, tab, estimate]);

  if (!snapshot) {
    return (
      <div className="fa">
        <div className="fa-empty">Connecting to the fight&hellip;</div>
      </div>
    );
  }

  const bout = snapshot.bout;
  const redName = bout?.redCorner?.fighter?.name || 'Red Corner';
  const blueName = bout?.blueCorner?.fighter?.name || 'Blue Corner';
  const roundNo = clock.currentRound || 1;

  const stats =
    scope === 'fight'
      ? snapshot.stats?.fight
      : scope === 'current'
      ? (liveStats?.roundNo === roundNo ? liveStats.stats : snapshot.stats?.rounds?.find((r) => r.roundNo === roundNo))
      : snapshot.stats?.rounds?.find((r) => r.roundNo === Number(scope));

  const scopeOptions = [
    { value: 'current', label: `Round ${roundNo} (live)` },
    ...Array.from({ length: clock.totalRounds || 3 }, (_, i) => i + 1)
      .filter((r) => r !== roundNo)
      .map((r) => ({ value: String(r), label: `Round ${r}` })),
    { value: 'fight', label: 'Whole fight' },
  ];

  const shown = estimate?.roundNo === roundNo ? estimate.estimate : null;

  return (
    <div className="fa">
      <div className="fa-head">
        <div>
          <div className="fa-event-name">
            {bout?.league?.name || 'Event'}
            {bout?.league?.location ? ` · ${bout.league.location}` : ''}
          </div>
          <div className="fa-matchup">
            <span style={{ color: '#ff8095' }}>{redName}</span>
            <span className="vs">vs</span>
            <span style={{ color: '#85aaff' }}>{blueName}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Status value={clock.status} />
            <span className="fa-round-pill">
              Round {roundNo} of {clock.totalRounds}
              {bout?.boutName ? ` · ${bout.boutName}` : ''}
            </span>
            <span className={`fa-dot ${connected ? 'on' : ''}`} />
          </div>
        </div>
        <div className="fa-clock-box">
          <div className={`fa-clock ${clock.running ? 'running' : ''}`}>{fmtClock(clock.elapsedSec)}</div>
          <div className="fa-round-pill">{fmtClock(clock.remainingSec)} remaining</div>
        </div>
      </div>

      {snapshot.officialResult?.method && (
        <div className="fa-banner-official">
          <strong>Official result:</strong>{' '}
          {snapshot.officialResult.winnerCorner === 'red'
            ? redName
            : snapshot.officialResult.winnerCorner === 'blue'
            ? blueName
            : snapshot.officialResult.winnerCorner === 'draw'
            ? 'Draw'
            : 'No contest'}{' '}
          by {snapshot.officialResult.method}
          {snapshot.officialResult.endedRound ? `, round ${snapshot.officialResult.endedRound}` : ''}.
        </div>
      )}

      <div className="fa-corners" style={{ marginBottom: 16 }}>
        {['red', 'blue'].map((corner) => {
          const f = corner === 'red' ? bout?.redCorner?.fighter : bout?.blueCorner?.fighter;
          return (
            <div className={`fa-corner ${corner}`} key={corner}>
              <div className="fa-corner-tag">{corner} corner</div>
              <div className="fa-corner-name">{f?.name || `${corner} corner`}</div>
              <div className="fa-corner-meta">
                {[f?.team, f?.weightClass, f?.country].filter(Boolean).join(' · ') || '—'}
              </div>
              {f?.record && (
                <div className="fa-note">
                  Record {f.record.wins}&ndash;{f.record.losses}
                  {f.record.draws ? `–${f.record.draws}` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fa-tabs">
        <button className={`fa-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          Live statistics
        </button>
        <button className={`fa-tab ${tab === 'estimate' ? 'active' : ''}`} onClick={() => setTab('estimate')}>
          Estimated round scoring
        </button>
        <button className={`fa-tab ${tab === 'scorecard' ? 'active' : ''}`} onClick={() => setTab('scorecard')}>
          Estimated scorecard
        </button>
        {fouls.length > 0 && (
          <button className={`fa-tab ${tab === 'fouls' ? 'active' : ''}`} onClick={() => setTab('fouls')}>
            Fouls
          </button>
        )}
      </div>

      {tab === 'stats' && (
        <LiveStats stats={stats} scope={scope} onScopeChange={setScope} scopeOptions={scopeOptions} />
      )}

      {tab === 'estimate' && (
        <>
          <EstimateDisclaimer />
          {!shown ? (
            <div className="fa-empty">No estimate available for round {roundNo} yet.</div>
          ) : (
            <div className="fa-panel">
              <div className="fa-estimate-head">
                <div>
                  <div className="fa-stat-label" style={{ textAlign: 'left' }}>Round {roundNo}</div>
                  <div className="fa-estimate-score">
                    <span className={shown.winner === 'red' ? 'w-red' : ''}>{shown.redScore ?? '–'}</span>
                    <span style={{ color: 'var(--fa-muted)' }}> &ndash; </span>
                    <span className={shown.winner === 'blue' ? 'w-blue' : ''}>{shown.blueScore ?? '–'}</span>
                  </div>
                </div>
                <Confidence value={shown.confidence} />
              </div>
              <p className="fa-explanation">{shown.explanation}</p>
              {shown.limitations?.length > 0 && (
                <ul className="fa-limitations">
                  {shown.limitations.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
            </div>
          )}
        </>
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
        <div className="fa-panel">
          <h3>Fouls recorded</h3>
          <table className="fa-card-table">
            <thead>
              <tr><th>Round</th><th>Time</th><th>Fighter</th><th>Foul</th><th>Referee decision</th><th>Points</th></tr>
            </thead>
            <tbody>
              {fouls.map((f) => (
                <tr key={f._id}>
                  <td>{f.roundNo}</td>
                  <td>{fmtClock(f.fightTimeSec)}</td>
                  <td>{f.corner === 'red' ? redName : blueName}</td>
                  <td>{f.category.replace(/_/g, ' ')}</td>
                  <td>{(f.refereeAction || 'none').replace(/_/g, ' ')}</td>
                  <td className="num">{f.pointsDeducted || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
