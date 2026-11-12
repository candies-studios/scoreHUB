import { Link } from 'react-router-dom';
import { AthleteLink, Medal } from './parts.jsx';
import { METHOD_LABEL, fullName } from '../../utils/tournament.js';

function Side({ athlete, score, winner, done }) {
  const won = done && winner && athlete && String(winner._id) === String(athlete._id);
  return (
    <div className={`bk-side ${won ? 'won' : ''} ${done && !won && athlete ? 'lost' : ''}`}>
      <span className="bk-name">{athlete ? fullName(athlete) : <span className="muted">—</span>}</span>
      {athlete?.academy?.name && <span className="bk-team">{athlete.academy.name}</span>}
      {score && done && <span className="bk-score">{score.points}</span>}
    </div>
  );
}

function MatchBox({ m, manage }) {
  const done = m.status === 'completed';
  if (m.isBye) {
    return (
      <div className="bk-match bye">
        <Side athlete={m.a || m.b} winner={m.winner} done />
        <div className="bk-foot muted">Bye</div>
      </div>
    );
  }
  return (
    <div className={`bk-match ${m.status}`}>
      <Side athlete={m.a} score={m.score?.a} winner={m.winner} done={done} />
      <Side athlete={m.b} score={m.score?.b} winner={m.winner} done={done} />
      <div className="bk-foot">
        {m.mat ? <span>Mat {m.mat}{m.order ? ` · #${m.order}` : ''}</span> : <span />}
        {done ? (
          <span>{METHOD_LABEL[m.method] || m.method}{m.submissionType ? ` · ${m.submissionType}` : ''}</span>
        ) : m.status === 'live' ? (
          <span className="live-dot">LIVE</span>
        ) : null}
        {(manage || m.status === 'live') && m.a && m.b && (
          <Link to={`/matches/${m._id}/scoreboard`} className="bk-open">
            {done ? 'View' : 'Score'}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Elimination tree: one column per round. */
function Elimination({ matches, manage }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <div className="bk-tree">
      {rounds.map((r) => {
        const list = matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
        return (
          <div className="bk-round" key={r}>
            <div className="bk-round-title">{list[0]?.roundName}</div>
            <div className="bk-round-body">
              {list.map((m) => (
                <div className="bk-slot" key={m._id}>
                  <MatchBox m={m} manage={manage} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Round robin: a results grid plus the match list. */
function RoundRobin({ matches, registrations, manage }) {
  const athletes = registrations.filter((r) => r.status === 'approved').map((r) => ({ ...r.athlete, academy: r.academy }));
  const table = athletes.map((a) => {
    const mine = matches.filter((m) => m.status === 'completed' && [m.a?._id, m.b?._id].map(String).includes(String(a._id)));
    const wins = mine.filter((m) => String(m.winner?._id) === String(a._id)).length;
    return { a, wins, losses: mine.length - wins };
  });
  table.sort((x, y) => y.wins - x.wins);
  return (
    <div className="rr">
      <table className="ev-table">
        <thead>
          <tr><th>Athlete</th><th>W</th><th>L</th></tr>
        </thead>
        <tbody>
          {table.map((row) => (
            <tr key={row.a._id}>
              <td><AthleteLink athlete={row.a} /></td>
              <td>{row.wins}</td>
              <td>{row.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rr-matches">
        {matches.map((m) => (
          <div key={m._id}>
            <div className="bk-round-title">{m.roundName}</div>
            <MatchBox m={m} manage={manage} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Bracket({ data, manage = false }) {
  if (!data) return null;
  const { division, matches, registrations, podium } = data;
  if (!matches.length) {
    return (
      <div className="empty">
        Bracket not drawn yet · {registrations.filter((r) => r.status !== 'cancelled').length} registered
      </div>
    );
  }
  return (
    <div className="bracket">
      {podium.length > 0 && (
        <div className="podium">
          {podium.map((p) => (
            <div className="podium-row" key={`${p.place}-${p.athlete._id}`}>
              <Medal place={p.place} />
              <AthleteLink athlete={p.athlete} />
            </div>
          ))}
        </div>
      )}
      {division.resolvedBracketType === 'round_robin' ? (
        <RoundRobin matches={matches} registrations={registrations} manage={manage} />
      ) : (
        <Elimination matches={matches} manage={manage} />
      )}
    </div>
  );
}
