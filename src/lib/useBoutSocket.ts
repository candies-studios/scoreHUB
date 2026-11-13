import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { IS_DEMO, SOCKET_URL } from './config';

/**
 * Keeps one bout's shared state in sync with the realtime server.
 *
 * Presentation state only — scores are persisted over HTTP, so a dropped
 * socket never costs a judge their card. Ported from the Next.js app; the one
 * change is that the server URL comes from a build-time variable rather than
 * process.env at runtime.
 */

export type Presence = {
  boutId: string;
  joined: number;
  expected: number;
  ready: boolean;
  participants: { userId: string; name: string; role: string; seat?: number }[];
  status: 'WAITING' | 'LIVE' | 'BETWEEN_ROUNDS' | 'COMPLETED';
  currentRound: number;
  roundStartedAt: number | null;
  roundDuration: number;
  submitted: string[];
};

export type JoinArgs = {
  boutId: string;
  userId: string;
  name: string;
  role: 'JUDGE' | 'REFEREE' | 'ADMIN' | 'PROMOTER' | 'VIEWER';
  seat?: number;
  expectedJudges: number;
  roundDuration: number;
  currentRound: number;
};

type State = {
  connected: boolean;
  presence: Presence | null;
  roundStartedAt: number | null;
  round: number;
  roundLocked: boolean;
  finished: { resultType: string; winnerCorner: string | null; summary?: string } | null;
  error: string | null;
};

/**
 * Demo stand-in for the realtime server.
 *
 * The room is treated as already full — in a demo there is one person, not
 * three tablets — so the waiting gate opens and the clock, the round lock and
 * the finish all behave as they do live, without a socket.
 */
function useDemoBoutSocket(args: JoinArgs | null) {
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  const [round, setRound] = useState(args?.currentRound || 1);
  const [roundLocked, setRoundLocked] = useState(false);
  const [finished, setFinished] = useState<State['finished']>(null);
  const [submitted, setSubmitted] = useState<string[]>([]);

  const expected = args?.expectedJudges ?? 3;
  const presence: Presence | null = args
    ? {
        boutId: args.boutId,
        joined: expected,
        expected,
        ready: true,
        participants: [{ userId: args.userId, name: args.name, role: args.role, seat: args.seat }],
        status: roundStartedAt ? 'LIVE' : 'WAITING',
        currentRound: round,
        roundStartedAt,
        roundDuration: args.roundDuration,
        submitted,
      }
    : null;

  return {
    connected: true,
    presence,
    roundStartedAt,
    round,
    roundLocked,
    finished,
    error: null,
    start: () => {
      setRoundStartedAt(Date.now());
      setRoundLocked(false);
      setSubmitted([]);
    },
    pause: () => setRoundStartedAt(null),
    nextRound: () => {
      setRoundStartedAt(Date.now());
      setRoundLocked(false);
      setSubmitted([]);
    },
    announceSubmit: (submittedRound: number) => {
      // Every seated judge turns their card in together in the demo.
      setSubmitted(Array.from({ length: expected }, (_, i) => `judge-${i}`));
      setRoundStartedAt(null);
      setRoundLocked(true);
      setRound(submittedRound + 1);
    },
    announceFinish: (resultType: string, winnerCorner: string | null) => {
      setFinished({ resultType, winnerCorner });
      setRoundStartedAt(null);
    },
  };
}

function useLiveBoutSocket(args: JoinArgs | null) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<State>({
    connected: false,
    presence: null,
    roundStartedAt: null,
    round: args?.currentRound || 1,
    roundLocked: false,
    finished: null,
    error: null,
  });

  const boutId = args?.boutId;
  const userId = args?.userId;
  // Read inside the effect without making it a dependency.
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!boutId || !userId) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true, error: null }));
      if (argsRef.current) socket.emit('bout:join', argsRef.current);
    });

    socket.on('connect_error', (err: Error) =>
      setState((s) => ({
        ...s,
        connected: false,
        error: `Cannot reach the realtime server at ${SOCKET_URL} (${err.message}).`,
      })),
    );

    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));

    socket.on('bout:presence', (presence: Presence) => setState((s) => ({ ...s, presence })));

    socket.on('bout:started', (data: { round: number; roundStartedAt: number }) =>
      setState((s) => ({
        ...s,
        round: data.round,
        roundStartedAt: data.roundStartedAt,
        roundLocked: false,
      })),
    );

    socket.on('bout:paused', () => setState((s) => ({ ...s, roundStartedAt: null })));

    socket.on('round:progress', (data: { submitted: string[] }) =>
      setState((s) => ({
        ...s,
        presence: s.presence ? { ...s.presence, submitted: data.submitted } : s.presence,
      })),
    );

    socket.on('round:locked', (data: { nextRound: number }) =>
      setState((s) => ({
        ...s,
        roundLocked: true,
        roundStartedAt: null,
        round: data.nextRound,
      })),
    );

    socket.on(
      'bout:finished',
      (data: { resultType: string; winnerCorner: string | null; summary?: string }) =>
        setState((s) => ({ ...s, finished: data, roundStartedAt: null })),
    );

    socket.on('bout:error', (data: { message: string }) =>
      setState((s) => ({ ...s, error: data.message })),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boutId, userId]);

  return {
    ...state,
    start: () => socketRef.current?.emit('bout:start', { boutId }),
    pause: () => socketRef.current?.emit('bout:pause', { boutId }),
    nextRound: () => socketRef.current?.emit('round:next', { boutId }),
    announceSubmit: (round: number) =>
      socketRef.current?.emit('round:submitted', { boutId, judgeId: userId, round }),
    announceFinish: (resultType: string, winnerCorner: string | null) =>
      socketRef.current?.emit('bout:finish', { boutId, resultType, winnerCorner }),
  };
}

/** Picks the real socket or the demo stand-in. Both hooks always run, so the
 *  rule of hooks holds however the page is configured. */
export function useBoutSocket(args: JoinArgs | null) {
  const live = useLiveBoutSocket(IS_DEMO ? null : args);
  const demo = useDemoBoutSocket(IS_DEMO ? args : null);
  return IS_DEMO ? demo : live;
}
