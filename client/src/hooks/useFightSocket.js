import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../api/socket.js';

export const FIGHT_EVT = {
  JOIN: 'fight:join',
  LEAVE: 'fight:leave',
  CLOCK_START: 'clock:start',
  CLOCK_PAUSE: 'clock:pause',
  CLOCK_RESET: 'clock:reset',
  CLOCK_SET: 'clock:set',
  NEXT_ROUND: 'fight:next-round',
  RECORD: 'stat:record',
  VOID: 'stat:void',
  CONTROL_START: 'control:start',
  CONTROL_STOP: 'control:stop',
  CONTROL_ACTIVE: 'control:mark-active',
  FOUL: 'foul:record',
  ASSESS: 'assess:save',
  RESULT: 'fight:result',
  REFRESH: 'fight:refresh',

  SNAPSHOT: 'fight:snapshot',
  CLOCK: 'fight:clock',
  STATS: 'fight:stats',
  ESTIMATE: 'fight:estimate',
  FOULS: 'fight:fouls',
  VIEWERS: 'fight:viewers',
  ERROR: 'fight:error',
};

const EMPTY_CLOCK = {
  running: false,
  elapsedSec: 0,
  durationSec: 300,
  remainingSec: 300,
  currentRound: 1,
  totalRounds: 3,
  status: 'scheduled',
};

/**
 * Live analytics channel for one bout.
 *
 * The clock is authoritative on the server (persisted, so it survives a reload
 * or a redeploy). This ticks locally once a second purely for smoothness and
 * re-syncs on every server message.
 */
export function useFightSocket(boutId, role = 'public') {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [clock, setClock] = useState(EMPTY_CLOCK);
  const [liveStats, setLiveStats] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [fouls, setFouls] = useState([]);
  const [viewers, setViewers] = useState({ total: 0 });
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!clock.running) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [clock.running]);

  const elapsedSec = clock.running
    ? Math.min(
        clock.durationSec,
        clock.elapsedSec + Math.floor((Date.now() - (clock.syncedAt || Date.now())) / 1000)
      )
    : clock.elapsedSec;

  useEffect(() => {
    if (!boutId) return undefined;

    const socket = getSocket();
    socketRef.current = socket;

    const stamp = (c) => ({ ...EMPTY_CLOCK, ...c, syncedAt: Date.now() });

    const onConnect = () => {
      setConnected(true);
      socket.emit(FIGHT_EVT.JOIN, { boutId, role }, (ack) => {
        if (ack && ack.ok === false) setError(ack.message);
      });
    };
    const onDisconnect = () => setConnected(false);

    const onSnapshot = (s) => {
      setSnapshot(s);
      if (s?.clock) setClock(stamp(s.clock));
      if (s?.fouls) setFouls(s.fouls);
    };
    const onClock = (c) => setClock(stamp(c));
    const onStats = (p) => setLiveStats(p);
    const onEstimate = (p) => setEstimate(p);
    const onFouls = (f) => setFouls(f);
    const onViewers = (v) => setViewers(v);
    const onError = (e) => setError(e?.message || 'Realtime error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(FIGHT_EVT.SNAPSHOT, onSnapshot);
    socket.on(FIGHT_EVT.CLOCK, onClock);
    socket.on(FIGHT_EVT.STATS, onStats);
    socket.on(FIGHT_EVT.ESTIMATE, onEstimate);
    socket.on(FIGHT_EVT.FOULS, onFouls);
    socket.on(FIGHT_EVT.VIEWERS, onViewers);
    socket.on(FIGHT_EVT.ERROR, onError);

    if (socket.connected) onConnect();

    return () => {
      socket.emit(FIGHT_EVT.LEAVE, { boutId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(FIGHT_EVT.SNAPSHOT, onSnapshot);
      socket.off(FIGHT_EVT.CLOCK, onClock);
      socket.off(FIGHT_EVT.STATS, onStats);
      socket.off(FIGHT_EVT.ESTIMATE, onEstimate);
      socket.off(FIGHT_EVT.FOULS, onFouls);
      socket.off(FIGHT_EVT.VIEWERS, onViewers);
      socket.off(FIGHT_EVT.ERROR, onError);
    };
  }, [boutId, role]);

  const emit = useCallback(
    (event, payload = {}, ack) =>
      socketRef.current?.emit(event, { boutId, actor: role, ...payload }, ack),
    [boutId, role]
  );

  const actions = {
    start: () => emit(FIGHT_EVT.CLOCK_START),
    pause: () => emit(FIGHT_EVT.CLOCK_PAUSE),
    reset: () => emit(FIGHT_EVT.CLOCK_RESET),
    setClock: (seconds, reason) => emit(FIGHT_EVT.CLOCK_SET, { seconds, reason }),
    nextRound: (endedEarlyReason) => emit(FIGHT_EVT.NEXT_ROUND, { endedEarlyReason }),

    record: (payload, ack) => emit(FIGHT_EVT.RECORD, payload, ack),
    voidEvent: (eventId, reason, ack) => emit(FIGHT_EVT.VOID, { eventId, reason }, ack),

    controlStart: (corner, position) => emit(FIGHT_EVT.CONTROL_START, { corner, position }),
    controlStop: (offensiveOutput) => emit(FIGHT_EVT.CONTROL_STOP, { offensiveOutput }),
    controlActive: () => emit(FIGHT_EVT.CONTROL_ACTIVE),

    foul: (payload, ack) => emit(FIGHT_EVT.FOUL, payload, ack),
    assess: (payload, ack) => emit(FIGHT_EVT.ASSESS, payload, ack),
    result: (payload, ack) => emit(FIGHT_EVT.RESULT, payload, ack),
    refresh: (ack) => emit(FIGHT_EVT.REFRESH, {}, ack),
  };

  return {
    connected,
    snapshot,
    clock: {
      ...clock,
      elapsedSec,
      remainingSec: Math.max(clock.durationSec - elapsedSec, 0),
    },
    liveStats,
    estimate,
    fouls,
    viewers,
    error,
    clearError: () => setError(null),
    actions,
  };
}

export default useFightSocket;
