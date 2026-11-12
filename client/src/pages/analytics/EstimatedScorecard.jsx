import { SCORECARD_DISCLAIMER } from '../../utils/fightConstants.js';
import { Confidence } from './parts.jsx';

/** Cumulative estimated scorecard. Marked unofficial top and bottom. */
export default function EstimatedScorecard({ scorecard, rounds, redName, blueName }) {
  if (!scorecard) return <div className="fa-empty">No scorecard yet.</div>;

  const { rows, totals, roundsWon, leader, roundsScored, roundsUnscored } = scorecard;

  return (
    <>
      <div className="fa-disclaimer">
        <strong>{SCORECARD_DISCLAIMER}</strong> This is an analytical estimate produced from
        recorded fight activity. The official result is decided by the appointed judges and the
        commission.
      </div>

      <div className="fa-panel">
        <h3>
          Round by round <span className="muted">{redName} vs {blueName}</span>
        </h3>
        <table className="fa-card-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>{redName}</th>
              <th>{blueName}</th>
              <th>Estimated winner</th>
              <th>Margin</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.roundNo}>
                <td>Round {r.roundNo}</td>
                <td className="num" style={{ color: r.winner === 'red' ? '#ffb3c0' : undefined }}>
                  {r.red ?? '–'}
                </td>
                <td className="num" style={{ color: r.winner === 'blue' ? '#b3ccff' : undefined }}>
                  {r.blue ?? '–'}
                </td>
                <td>
                  {!r.scored
                    ? <span style={{ color: 'var(--fa-warn)' }}>Not scored</span>
                    : r.winner === 'even'
                    ? 'Even'
                    : r.winner === 'red'
                    ? redName
                    : blueName}
                </td>
                <td>{r.margin || '–'}</td>
                <td><Confidence value={r.confidence} /></td>
              </tr>
            ))}
            <tr className="total">
              <td><b>Total</b></td>
              <td className="num">{totals.red}</td>
              <td className="num">{totals.blue}</td>
              <td colSpan={3}>
                {roundsScored === 0 ? (
                  <span style={{ color: 'var(--fa-warn)' }}>No rounds scored yet</span>
                ) : leader === 'even' ? (
                  'Level on the estimate'
                ) : (
                  <>Estimated leader: <b>{leader === 'red' ? redName : blueName}</b></>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="fa-note" style={{ marginTop: 12 }}>
          Rounds won on the estimate &mdash; {redName}: {roundsWon.red}, {blueName}: {roundsWon.blue}
          {roundsWon.even > 0 && `, even: ${roundsWon.even}`}.
          {roundsUnscored > 0 && ` ${roundsUnscored} round${roundsUnscored === 1 ? '' : 's'} could not be scored and are excluded from the total.`}
        </p>
      </div>

      {rounds?.length > 0 && (
        <div className="fa-panel">
          <h3>Explanation per round</h3>
          {rounds.map((r) => (
            <div key={r.roundNo} style={{ marginBottom: 14 }}>
              <div className="fa-stat-label" style={{ textAlign: 'left' }}>Round {r.roundNo}</div>
              <p className="fa-explanation" style={{ fontSize: '0.84rem' }}>
                {r.estimate?.explanation || 'No estimate available.'}
              </p>
              {r.estimate?.limitations?.length > 0 && (
                <ul className="fa-limitations">
                  {r.estimate.limitations.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="fa-disclaimer">{SCORECARD_DISCLAIMER}</div>
    </>
  );
}
