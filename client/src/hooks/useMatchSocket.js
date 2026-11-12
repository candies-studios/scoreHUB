import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../api/socket.js';
import { matchApi } from '../api/tournamentApi.js';

export const MAT_EVT = {
  JOIN: 'match:join',
  LEAVE: 'match:leave',
  SCORE: 'match:score',
  CLOCK: 'match:clock',
  FINISH: 'match:finish',
  REOPEN: 'match:reopen',
  WATCH_MAT: 'mat:watch',
  STATE: 'match:state',
  MAT_UPDATE: 'mat:update',
  ERROR: 'match:error',
};

/**
 * Live state of one tournament match. Every screen (table controller, TV
 * display, phone) joins the same room and renders whatever the server says.
 */
export default function useMatchSocket(matchId) {
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const receivedAt = useRef(Date.now());

  useEffect(() => {
    if (!matchId) return undefined;
    const socket = getSocket();
    const onState = (view) => {
      if (String(view._id) !== String(matchId)) return;
      receivedAt.current = Date.now();
      setMatch(view);
    };
    const onErr = ({ message }) => setError(message);
    const join = () => {
      setConnected(true);
      socket.emit(MAT_EVT.JOIN, { matchId });
    };
    const onDisconnect = () => setConnected(false);

    socket.on(MAT_EVT.STATE, onState);
    socket.on(MAT_EVT.ERROR, onErr);
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();

    // REST first paint in case the socket is slow to connect.
    matchApi.get(matchId).then(onState).catch(() => {});

    return () => {
      socket.emit(MAT_EVT.LEAVE, { matchId });
      socket.off(MAT_EVT.STATE, onState);
      socket.off(MAT_EVT.ERROR, onErr);
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
    };
  }, [matchId]);

  const send = useCallback(
    (evt, payload) =>
      new Promise((resolve) => {
        setError('');
        getSocket().emit(evt, { matchId, ...payload }, (res) => {
          if (res && !res.ok) setError(res.message);
          resolve(res);
        });
      }),
    [matchId]
  );

  return {
    match,
    error,
    connected,
    receivedAt,
    score: (side, field, delta) => send(MAT_EVT.SCORE, { side, field, delta }),
    clock: (action, value) => send(MAT_EVT.CLOCK, { action, value }),
    finish: (payload) => send(MAT_EVT.FINISH, payload),
    reopen: () => send(MAT_EVT.REOPEN, {}),
  };
}

/** Remaining milliseconds on the match clock, ticking locally between server updates. */
export function useMatchClock(match, receivedAt) {
  const [now, setNow] = useState(Date.now());
  const running = Boolean(match?.clock?.running);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);
  if (!match?.clock) return 0;
  const drift = running ? now - receivedAt.current : 0;
  return Math.max(0, match.clock.remainingMs - drift);
}
