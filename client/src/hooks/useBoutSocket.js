import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, EVT } from '../api/socket.js';

const EMPTY_PRESENCE = { joined: 0, expected: 3, allJoined: false, judges: [] };
const EMPTY_TIMER = { running: false, elapsedSec: 0, durationSec: 300, remainingSec: 300 };

/**
 * Connects to a bout room and keeps presence, the synchronized clock,
 * round state and the finish result in sync across every judge's device.
 *
 * `identity` is either a judge's Official id (they picked their seat) or
 * the string 'supervisor' to watch. Pass null to stay disconnected.
 */
export function useBoutSocket(boutId, identity) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState(null); // 'judge' | 'supervisor'
  const [seat, setSeat] = useState(null);
  const [judgeId, setJudgeId] = useState(null);
  const [presence, setPresence] = useState(EMPTY_PRESENCE);
  const [timer, setTimer] = useState(EMPTY_TIMER);
  const [currentRound, setCurrentRound] = useState(1);
  const [waiting, setWaiting] = useState(null);
  const [finished, setFinished] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  // Local 1s tick so the clock advances smoothly between server events.
  useEffect(() => {
    if (!timer.running) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timer.running]);

  const elapsedSec = timer.running
    ? Math.min(
        timer.durationSec,
        timer.elapsedSec + Math.floor((Date.now() - (timer.clientStartedAt || Date.now())) / 1000)
      )
    : timer.elapsedSec;

  useEffect(() => {
    if (!boutId || !identity) return undefined;

    const socket = getSocket();
    socketRef.current = socket;

    const joinPayload = {
      boutId,
      judgeId: identity === 'supervisor' ? null : identity,
    };

    const onConnect = () => {
      setConnected(true);
      socket.emit(EVT.JOIN, joinPayload, (ack) => {
        if (ack && ack.ok === false) setError(ack.message);
      });
    };
    const onDisconnect = () => setConnected(false);

    const onState = (state) => {
      if (state.presence) setPresence(state.presence);
      if (state.timer) setTimer(stampTimer(state.timer));
      if (state.role) setRole(state.role);
      if (state.seat !== undefined) setSeat(state.seat);
      if (state.judgeId !== undefined) setJudgeId(state.judgeId);
      if (state.currentRound) setCurrentRound(state.currentRound);
    };

    const onPresence = (p) => setPresence(p);

    const onTimer = (t) => {
      setTimer(stampTimer(t));
      if (t.currentRound) setCurrentRound(t.currentRound);
    };

    const onWaiting = (w) => setWaiting(w);

    const onRoundComplete = (payload) => {
      setCurrentRound(payload.nextRound);
      setTimer(stampTimer(payload.timer));
      setWaiting(null);
    };

    const onFinished = (summary) => {
      setFinished(summary);
      setWaiting(null);
    };

    const onError = (e) => setError(e.message || 'Realtime error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVT.STATE, onState);
    socket.on(EVT.PRESENCE, onPresence);
    socket.on(EVT.TIMER, onTimer);
    socket.on(EVT.ROUND_WAITING, onWaiting);
    socket.on(EVT.ROUND_COMPLETE, onRoundComplete);
    socket.on(EVT.BOUT_FINISHED, onFinished);
    socket.on(EVT.ERROR, onError);

    if (socket.connected) onConnect();

    return () => {
      socket.emit(EVT.LEAVE, { boutId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVT.STATE, onState);
      socket.off(EVT.PRESENCE, onPresence);
      socket.off(EVT.TIMER, onTimer);
      socket.off(EVT.ROUND_WAITING, onWaiting);
      socket.off(EVT.ROUND_COMPLETE, onRoundComplete);
      socket.off(EVT.BOUT_FINISHED, onFinished);
      socket.off(EVT.ERROR, onError);
    };
  }, [boutId, identity]);

  const emit = useCallback(
    (event, payload, ack) => socketRef.current?.emit(event, { boutId, ...payload }, ack),
    [boutId]
  );

  const actions = {
    ready: (value = true) => emit(EVT.READY, { ready: value }),
    startRound: (roundNo) => emit(EVT.START_ROUND, { roundNo }),
    stopRound: () => emit(EVT.STOP_ROUND, {}),
    sendToken: (payload, ack) => emit(EVT.SCORE_TOKEN, payload, ack),
    undoToken: (payload, ack) => emit(EVT.SCORE_UNDO, payload, ack),
    submitRound: (payload, ack) => emit(EVT.SUBMIT_ROUND, payload, ack),
    nextRound: () => emit(EVT.NEXT_ROUND, {}),
    finish: (payload, ack) => emit(EVT.FINISH, payload, ack),
    sync: (ack) => emit(EVT.SYNC, {}, ack),
    onTokenUpdate: (handler) => {
      socketRef.current?.on(EVT.TOKEN_UPDATE, handler);
      return () => socketRef.current?.off(EVT.TOKEN_UPDATE, handler);
    },
  };

  return {
    connected,
    role,
    seat,
    judgeId,
    presence,
    timer: { ...timer, elapsedSec, remainingSec: Math.max(timer.durationSec - elapsedSec, 0) },
    currentRound,
    waiting,
    finished,
    error,
    clearError: () => setError(null),
    clearWaiting: () => setWaiting(null),
    actions,
  };
}

function stampTimer(t) {
  return { ...EMPTY_TIMER, ...t, clientStartedAt: Date.now() };
}

export default useBoutSocket;
