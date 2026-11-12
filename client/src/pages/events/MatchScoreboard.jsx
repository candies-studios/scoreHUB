import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useMatchSocket, { useMatchClock } from '../../hooks/useMatchSocket.js';
import { tournamentApi } from '../../api/tournamentApi.js';
import { BeltChip } from '../../components/events/parts.jsx';
import { METHOD_LABEL, SUBMISSIONS, fmtClock, fullName } from '../../utils/tournament.js';

/**
 * Mat scoreboard.
 *   /matches/:id/scoreboard   table controller (buttons + keyboard)
 *   /matches/:id/display      audience / TV screen — same data, no controls
 * Every open screen updates in real time over the socket.
 */
export default function MatchScoreboard({ display = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { match, error, connected, receivedAt, score, clock, finish, reopen } = useMatchSocket(id);
  const remaining = useMatchClock(match, receivedAt);
  const [next, setNext] = useState(null);

  const done = match?.status === 'completed';
  const canScore = !display && match && !done && match.a && match.b;

  // Keyboard: space = start/pause; 1/2/3 = +2/+3/+4 for top (a); 8/9/0 for bottom (b).
  useEffect(() => {
    if (!canScore) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const map = { 1: ['a', 2], 2: ['a', 3], 3: ['a', 4], 8: ['b', 2], 9: ['b', 3], 0: ['b', 4] };
      if (e.code === 'Space') {
        e.preventDefault();
        clock(match.clock.running ? 'pause' : 'start');
      } else if (map[e.key]) {
        score(map[e.key][0], 'points', map[e.key][1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canScore, match?.clock?.running, clock, score]);

  // Find what is next on this mat once the match ends.
  useEffect(() => {
    if (!done || !match?.mat) return;
    const tid = match.tournament?._id || match.tournament;
    tournamentApi
      .schedule(tid, match.mat)
      .then((s) => setNext(s.mats[match.mat - 1]?.matches.find((m) => m.status === 'ready' && String(m._id) !== String(match._id)) || null))
      .catch(() => {});
  }, [done, match?.mat, match?.tournament, match?._id]);

  if (!match) return <div className="empty">{error || 'Connecting to the mat…'}</div>;

  const t = match.tournament || {};
  const timeUp = remaining === 0 && !done;
  const leader = match.leader?.leader;

  return (
    <div className={`sb ${display ? 'sb-display' : ''}`}>
      <header className="sb-head">
        <div>
          {!display && <Link to={`/events/${t._id}?tab=schedule`} className="muted">← {t.name}</Link>}
          {display && <div className="sb-event">{t.name}</div>}
          <div className="sb-div">{match.division?.name} · {match.roundName}</div>
        </div>
        <div className="sb-head-right">
          {match.mat > 0 && <span className="sb-mat">MAT {match.mat}</span>}
          {!display && (
            <>
              <span className={`sb-conn ${connected ? 'on' : ''}`}>{connected ? '● live' : '○ offline'}</span>
              <Link className="btn btn-ghost btn-sm" to={`/matches/${match._id}/display`} target="_blank">Open display</Link>
            </>
          )}
        </div>
      </header>

      <div className={`sb-clock ${match.clock?.running ? 'running' : ''} ${timeUp ? 'up' : ''}`}>
        {fmtClock(remaining)}
      </div>
      {!display && !done && (
        <div className="btn-row sb-clock-ctl">
          <button className="btn btn-primary" onClick={() => clock(match.clock.running ? 'pause' : 'start')} disabled={!canScore}>
            {match.clock?.running ? 'Pause' : remaining < match.durationSec * 1000 ? 'Resume' : 'Start'}
          </button>
          <button className="btn btn-ghost" onClick={() => clock('reset')} disabled={!canScore}>Reset</button>
          <button
            className="btn btn-ghost"
            disabled={!canScore}
            onClick={() => {
              const v = window.prompt('Set remaining time (m:ss)', fmtClock(remaining));
              if (!v) return;
              const [m, s] = v.split(':').map(Number);
              clock('set', (m || 0) * 60 + (s || 0));
            }}
          >
            Set
          </button>
        </div>
      )}

      {['a', 'b'].map((side) => (
        <SideRow
          key={side}
          side={side}
          athlete={match[side]}
          s={match.score?.[side] || {}}
          leading={leader === side && !done}
          winner={done && match.winner && match[side] && String(match.winner._id) === String(match[side]._id)}
          controls={canScore}
          onScore={(field, delta) => score(side, field, delta)}
        />
      ))}

      {error && !display && <p className="error-text" style={{ textAlign: 'center' }}>{error}</p>}

      {done ? (
        <div className="sb-result">
          <div className="sb-result-title">
            Winner: <strong>{fullName(match.winner)}</strong> by {METHOD_LABEL[match.method] || match.method}
            {match.submissionType ? ` (${match.submissionType})` : ''}
          </div>
          {!display && (
            <div className="btn-row">
              {next && <button className="btn btn-primary" onClick={() => navigate(`/matches/${next._id}/scoreboard`)}>Next on mat {match.mat}: #{next.order} →</button>}
              <button className="btn btn-ghost" onClick={() => window.confirm('Reopen this match and undo the result?') && reopen()}>Reopen</button>
            </div>
          )}
        </div>
      ) : (
        canScore && <FinishPanel match={match} onFinish={finish} />
      )}

      {!display && !done && (
        <p className="hint muted sb-keys">Keyboard: Space start/pause · 1/2/3 = +2/+3/+4 top · 8/9/0 = +2/+3/+4 bottom</p>
      )}
      {!match.a || !match.b ? <p className="muted" style={{ textAlign: 'center' }}>Waiting for the previous matches to finish.</p> : null}
    </div>
  );
}

function SideRow({ side, athlete, s, leading, winner, controls, onScore }) {
  return (
    <div className={`sb-row sb-${side} ${leading ? 'leading' : ''} ${winner ? 'winner' : ''}`}>
      <div className="sb-who">
        <div className="sb-name">{athlete ? fullName(athlete) : 'TBD'}{winner && ' 🏆'}</div>
        <div className="sb-team">
          {athlete?.academy?.name}
          {athlete?.belt && <BeltChip belt={athlete.belt} />}
        </div>
        {controls && (
          <div className="sb-btns">
            <button onClick={() => onScore('points', 2)}>+2</button>
            <button onClick={() => onScore('points', 3)}>+3</button>
            <button onClick={() => onScore('points', 4)}>+4</button>
            <button className="minus" onClick={() => onScore('points', -1)}>−1</button>
            <span className="sb-sep" />
            <button className="adv" onClick={() => onScore('advantages', 1)}>A+</button>
            <button className="adv minus" onClick={() => onScore('advantages', -1)}>A−</button>
            <button className="pen" onClick={() => onScore('penalties', 1)}>P+</button>
            <button className="pen minus" onClick={() => onScore('penalties', -1)}>P−</button>
          </div>
        )}
      </div>
      <div className="sb-small">
        <div className="sb-adv" title="Advantages"><span>{s.advantages || 0}</span><small>ADV</small></div>
        <div className="sb-pen" title="Penalties"><span>{s.penalties || 0}</span><small>PEN</small></div>
      </div>
      <div className="sb-points">{s.points || 0}</div>
    </div>
  );
}

function FinishPanel({ match, onFinish }) {
  const [method, setMethod] = useState('points');
  const [winner, setWinner] = useState('');
  const [sub, setSub] = useState(SUBMISSIONS[0]);
  const tie = !match.leader?.leader;
  const needsWinner = method !== 'points' || tie;

  return (
    <div className="sb-finish card">
      <strong>End match</strong>
      <select value={method} onChange={(e) => setMethod(e.target.value)}>
        <option value="points">By scoreboard{match.leader?.leader ? ` (${match.leader.method})` : ''}</option>
        <option value="submission">Submission</option>
        <option value="decision">Referee's decision</option>
        <option value="dq">Disqualification</option>
        <option value="walkover">Walkover</option>
        <option value="injury">Injury</option>
      </select>
      {method === 'submission' && (
        <select value={sub} onChange={(e) => setSub(e.target.value)}>
          {SUBMISSIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
      {needsWinner && (
        <select value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="">Winner…</option>
          <option value="a">{fullName(match.a)}</option>
          <option value="b">{fullName(match.b)}</option>
        </select>
      )}
      <button
        className="btn btn-green"
        disabled={needsWinner && !winner}
        onClick={() => {
          const name = winner ? fullName(match[winner]) : fullName(match[match.leader.leader]);
          if (!window.confirm(`Confirm result: ${name} wins by ${METHOD_LABEL[method === 'points' ? match.leader.method : method]}?`)) return;
          onFinish({
            method: method === 'points' && tie ? 'decision' : method,
            winner: winner || undefined,
            submissionType: method === 'submission' ? sub : '',
          });
        }}
      >
        Confirm result
      </button>
    </div>
  );
}
