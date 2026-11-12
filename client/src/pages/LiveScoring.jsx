import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boutApi } from '../api/resources.js';
import { errMsg, DEMO_MODE } from '../api/client.js';
import useBoutSocket from '../hooks/useBoutSocket.js';
import { WaitingModal, ResultModal } from '../components/Modal.jsx';
import SeatPicker from '../components/SeatPicker.jsx';
import { TextField } from '../components/Field.jsx';
import {
  CATEGORIES,
  TOKENS,
  FINISH_METHODS,
  SCORE_OPTIONS,
  fmtClock,
  fmtDate,
} from '../utils/format.js';
import '../styles/scoring.css';

const seatKey = (boutId) => `scorehub.seat.${boutId}`;

const emptyLogs = () =>
  CATEGORIES.reduce((acc, c) => ({ ...acc, [c.key]: { blue: [], red: [] } }), {});

export default function LiveScoring() {
  const { boutId } = useParams();
  const navigate = useNavigate();

  const [bout, setBout] = useState(null);
  const [identity, setIdentity] = useState(null); // Official id, or 'supervisor'
  const [logs, setLogs] = useState(emptyLogs);
  const [blueScore, setBlueScore] = useState('');
  const [redScore, setRedScore] = useState('');
  const [finishMethod, setFinishMethod] = useState(null);
  const [finishWinner, setFinishWinner] = useState('');
  const [error, setError] = useState('');
  const [showWaitingModal, setShowWaitingModal] = useState(true);

  const {
    connected,
    role,
    seat,
    judgeId,
    presence,
    timer,
    currentRound,
    waiting,
    finished,
    error: socketError,
    actions,
  } = useBoutSocket(boutId, identity);

  const isJudge = role === 'judge';
  const isSupervisor = role === 'supervisor';
  const readOnly = !isJudge || Boolean(finished);
  const noControl = (!isJudge && !isSupervisor) || Boolean(finished);

  // --- load the bout, then restore a remembered seat ---------------------
  useEffect(() => {
    boutApi
      .get(boutId)
      .then((b) => {
        setBout(b);
        try {
          const saved = localStorage.getItem(seatKey(boutId));
          if (!saved) return;
          const stillOnPanel =
            saved === 'supervisor' || (b.judges || []).some((j) => j._id === saved);
          if (stillOnPanel) setIdentity(saved);
        } catch {
          /* storage unavailable — the picker just shows again */
        }
      })
      .catch((e) => setError(errMsg(e)));
  }, [boutId]);

  const pickSeat = (value) => {
    try {
      localStorage.setItem(seatKey(boutId), value);
    } catch {
      /* not fatal */
    }
    setIdentity(value);
  };

  const switchSeat = () => {
    try {
      localStorage.removeItem(seatKey(boutId));
    } catch {
      /* not fatal */
    }
    setIdentity(null);
    setLogs(emptyLogs());
  };

  // --- hydrate this judge's card for the current round -------------------
  const hydrateLogs = useCallback(async () => {
    if (!judgeId) return;
    try {
      const cards = await boutApi.scorecards(boutId, judgeId);
      const round = cards[0]?.rounds?.find((r) => r.roundNo === currentRound);

      const next = emptyLogs();
      if (round) {
        CATEGORIES.forEach(({ key }) => {
          next[key] = { blue: round.blue?.[key] || [], red: round.red?.[key] || [] };
        });
      }
      setLogs(next);
    } catch {
      setLogs(emptyLogs());
    }
  }, [boutId, judgeId, currentRound]);

  useEffect(() => {
    hydrateLogs();
  }, [hydrateLogs]);

  useEffect(() => {
    setBlueScore('');
    setRedScore('');
  }, [currentRound]);

  // Live token echoes (also how a supervisor watches a panel).
  useEffect(() => {
    const off = actions.onTokenUpdate((payload) => {
      if (isJudge && String(payload.judgeId) !== String(judgeId)) return;
      setLogs((prev) => ({
        ...prev,
        [payload.category]: { ...prev[payload.category], [payload.corner]: payload.tokens },
      }));
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judgeId, isJudge]);

  useEffect(() => {
    if (presence.allJoined && timer.running) setShowWaitingModal(false);
  }, [presence.allJoined, timer.running]);

  // --- actions ----------------------------------------------------------
  const pressToken = (category, corner, token) => {
    if (readOnly || !timer.running) return;
    setLogs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [corner]: [...prev[category][corner], token] },
    }));
    actions.sendToken({ roundNo: currentRound, corner, category, token });
  };

  const undo = (category, corner) => {
    if (readOnly) return;
    setLogs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [corner]: prev[category][corner].slice(0, -1) },
    }));
    actions.undoToken({ roundNo: currentRound, corner, category });
  };

  const start = () => {
    setShowWaitingModal(false);
    actions.startRound(currentRound);
  };

  const submit = () => {
    if (blueScore === '' || redScore === '') {
      setError('Enter a final score for both corners before submitting the round.');
      return;
    }
    setError('');
    actions.submitRound({
      roundNo: currentRound,
      blueScore: Number(blueScore),
      redScore: Number(redScore),
    });
  };

  const declareFinish = (method) => {
    setFinishMethod(method);
    if (method === 'No Contest') actions.finish({ method, winnerCorner: 'nc' });
  };

  const confirmFinish = () => {
    if (!finishMethod || !finishWinner) return;
    actions.finish({ method: finishMethod, winnerCorner: finishWinner });
  };

  const tally = useMemo(() => {
    const weight = { '1': 1, '0': 0, '+': 2 };
    const sum = (corner) =>
      CATEGORIES.reduce(
        (acc, c) => acc + (logs[c.key]?.[corner] || []).reduce((s, t) => s + (weight[t] ?? 0), 0),
        0
      );
    return { blue: sum('blue'), red: sum('red') };
  }, [logs]);

  if (DEMO_MODE) {
    return <DemoNotice title="Judge scoring is offline" onBack={() => navigate(-1)} />;
  }

  if (!bout) return <div className="empty">{error || 'Loading bout…'}</div>;

  if (!identity) {
    return <SeatPicker bout={bout} onPick={pickSeat} onCancel={() => navigate(-1)} />;
  }

  const blueName = bout.blueCorner?.fighter?.name || 'Blue Corner';
  const redName = bout.redCorner?.fighter?.name || 'Red Corner';
  const myName = isJudge
    ? bout.judges?.find((j) => j._id === judgeId)?.name || `Judge ${seat}`
    : 'Supervisor';

  const winnerName =
    finished?.winner?.corner === 'blue'
      ? blueName
      : finished?.winner?.corner === 'red'
      ? redName
      : finished?.winner?.corner === 'draw'
      ? 'Draw'
      : 'No Contest';

  return (
    <>
      <h2 className="page-title">Memory Sheet</h2>

      <div className="row-between" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="presence-pill">
            <span className={`dot ${connected ? 'on' : ''}`} />
            {presence.joined}/{presence.expected} judges connected
          </span>
          <span className="badge">{isJudge ? `Judge ${seat} — ${myName}` : 'Supervisor'}</span>
          <button className="btn btn-ghost btn-sm" onClick={switchSeat}>
            Switch
          </button>
        </div>
        <span className={`clock ${timer.running ? 'running' : ''}`}>
          ⏱ {fmtClock(timer.elapsedSec)} / {fmtClock(timer.durationSec)}
        </span>
      </div>

      <div className="sheet-header">
        <div className="stack">
          <TextField label="Bout type" value={bout.boutType} readOnly />
          <TextField label="Bouts no" value={bout.boutNo} readOnly />
          <TextField label="Judge No" value={seat || '—'} readOnly />
        </div>

        <div className="stack">
          <TextField label="Ring no" value={bout.ringNo || 1} readOnly />
          <TextField label="Judge Name" value={myName} readOnly />
          <TextField label="Referee Name" value={bout.referee?.name || '—'} readOnly />
        </div>

        <div className="stack">
          <label style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', paddingLeft: 12 }}>
            Finish
          </label>
          <div className="finish-grid">
            {FINISH_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                className={finishMethod === m ? 'active' : ''}
                disabled={noControl}
                onClick={() => declareFinish(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '4px 0 0 12px' }}>
            {bout.boutName} · {fmtDate(bout.boutDate)} · Round {currentRound} of {bout.totalRounds}
          </p>
        </div>
      </div>

      <div className="sheet-body">
        <div className="round-rail">
          <div className="round-chip">Round {currentRound}</div>
          {CATEGORIES.map((c) => (
            <div className="cat-label" key={c.key}>
              {c.label.split('\n').map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ))}
        </div>

        {['blue', 'red'].map((corner) => (
          <div className={`corner-panel ${corner}`} key={corner}>
            <div className="corner-title">
              {corner === 'blue' ? `Blue Corner — ${blueName}` : `Red Corner — ${redName}`}
            </div>

            {CATEGORIES.map((c) => (
              <div className="cat-block" key={c.key}>
                <div className="token-row">
                  {TOKENS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="token-btn"
                      disabled={readOnly || !timer.running}
                      onClick={() => pressToken(c.key, corner, t)}
                      title={
                        t === '1'
                          ? 'Effective / landed'
                          : t === '0'
                          ? 'Attempted, blocked or missed'
                          : 'Dominant or significant'
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="token-log">
                  <span>{(logs[c.key]?.[corner] || []).join(',')}</span>
                  {!readOnly && (logs[c.key]?.[corner] || []).length > 0 && (
                    <button className="undo" type="button" onClick={() => undo(c.key, corner)}>
                      undo
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="tally-strip">
              <span>Running tally</span>
              <strong>{corner === 'blue' ? tally.blue : tally.red}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="sheet-footer">
        <span className="clock">⏱ Manual Time {fmtClock(timer.elapsedSec)}</span>

        <span className="badge">Final score</span>
        <select
          className="score-select"
          value={blueScore}
          disabled={readOnly}
          onChange={(e) => setBlueScore(e.target.value)}
        >
          <option value="">score</option>
          {SCORE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="score-select red"
          value={redScore}
          disabled={readOnly}
          onChange={(e) => setRedScore(e.target.value)}
        >
          <option value="">score</option>
          {SCORE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {!timer.running ? (
            <button
              className="btn btn-green"
              onClick={start}
              disabled={noControl || (!presence.allJoined && !isSupervisor)}
            >
              Start
            </button>
          ) : (
            <button className="btn btn-red" onClick={actions.stopRound} disabled={noControl}>
              Stop
            </button>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={readOnly}>
            Submit Round {currentRound}
          </button>
        </div>
      </div>

      {finishMethod && finishMethod !== 'No Contest' && !finished && (
        <div className="btn-row" style={{ marginTop: 18 }}>
          <select
            className="score-select"
            value={finishWinner}
            onChange={(e) => setFinishWinner(e.target.value)}
            style={{ background: '#fff', color: 'var(--ink)' }}
          >
            <option value="">Winner…</option>
            <option value="blue">{blueName} (Blue)</option>
            <option value="red">{redName} (Red)</option>
          </select>
          <button className="btn btn-red" onClick={confirmFinish} disabled={!finishWinner}>
            Confirm {finishMethod}
          </button>
          <button className="btn btn-ghost" onClick={() => setFinishMethod(null)}>
            Cancel
          </button>
        </div>
      )}

      {(error || socketError) && <p className="notice">{error || socketError}</p>}
      {waiting && !finished && <p className="notice">{waiting.message}</p>}

      {showWaitingModal && !presence.allJoined && !finished && isJudge && (
        <WaitingModal
          joined={presence.joined}
          expected={presence.expected}
          canStart={presence.allJoined}
          onStart={start}
        />
      )}

      {finished && (
        <ResultModal
          winnerName={winnerName}
          method={finished.winner?.method}
          onSubmit={() => navigate(`/bouts/${boutId}/summary`)}
        />
      )}
    </>
  );
}

/** Realtime screens cannot work without the Socket.IO server. Say so plainly. */
function DemoNotice({ title, onBack }) {
  return (
    <div className="card" style={{ textAlign: 'center', maxWidth: 620, margin: '40px auto' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: 'var(--ink-soft)', lineHeight: 1.65 }}>
        This site is running in <strong>demo mode</strong> with no backend connected.
        Browsing events, fighters and bouts works from the bundled data, but live
        scoring needs the realtime server.
      </p>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.86rem', lineHeight: 1.65 }}>
        Deploy the API (see <code>render.yaml</code>) and set the <code>API_URL</code>{' '}
        repository variable, then this screen works.
      </p>
      <button className="btn btn-ghost btn-sm" onClick={onBack}>Back</button>
    </div>
  );
}
