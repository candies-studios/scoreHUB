/**
 * Mat scoreboard realtime channel (tournament module).
 *
 *   room `match:<id>`   one per match — table controller + any number of displays
 *   room `mat:<t>:<n>`  one per mat — "now on mat" screens follow the next match
 *
 * Kept apart from the judge channel (`bout:*`) and analytics (`fight:*`):
 * own rooms, own event names. All state lives in MongoDB, so a second screen
 * or a refresh always gets the truth.
 */
import * as svc from '../utils/tournamentService.js';

export const MAT_EVT = {
  // client -> server
  JOIN: 'match:join',
  LEAVE: 'match:leave',
  SCORE: 'match:score',
  CLOCK: 'match:clock',
  FINISH: 'match:finish',
  REOPEN: 'match:reopen',
  WATCH_MAT: 'mat:watch',

  // server -> client
  STATE: 'match:state',
  MAT_UPDATE: 'mat:update',
  ERROR: 'match:error',
};

export const matchRoom = (id) => `match:${id}`;
export const matRoom = (tournamentId, mat) => `mat:${tournamentId}:${mat}`;

/** Push the latest match view to everyone watching it and its mat. */
export function broadcastMatch(io, matchId, view) {
  if (!io || !view) return;
  io.to(matchRoom(matchId)).emit(MAT_EVT.STATE, view);
  const tid = view.tournament?._id || view.tournament;
  if (view.mat) io.to(matRoom(tid, view.mat)).emit(MAT_EVT.MAT_UPDATE, { mat: view.mat, matchId: String(view._id) });
}

export default function registerMatHandlers(io, socket) {
  const run = (fn) => async (payload = {}, ack) => {
    try {
      const view = await fn(payload);
      if (view) broadcastMatch(io, payload.matchId, view);
      ack?.({ ok: true, match: view });
    } catch (err) {
      socket.emit(MAT_EVT.ERROR, { message: err.message });
      ack?.({ ok: false, message: err.message });
    }
  };

  socket.on(
    MAT_EVT.JOIN,
    run(async ({ matchId }) => {
      const view = await svc.matchView(matchId);
      socket.join(matchRoom(matchId));
      socket.emit(MAT_EVT.STATE, view);
      return null; // nothing changed — don't rebroadcast
    })
  );

  socket.on(MAT_EVT.LEAVE, ({ matchId } = {}) => matchId && socket.leave(matchRoom(matchId)));

  socket.on(MAT_EVT.WATCH_MAT, ({ tournamentId, mat } = {}, ack) => {
    if (!tournamentId || !mat) return ack?.({ ok: false, message: 'tournamentId and mat are required' });
    socket.join(matRoom(tournamentId, mat));
    ack?.({ ok: true });
  });

  socket.on(
    MAT_EVT.SCORE,
    run(async ({ matchId, side, field, delta }) => {
      await svc.adjustScore(matchId, side, field, delta);
      return svc.matchView(matchId);
    })
  );

  socket.on(
    MAT_EVT.CLOCK,
    run(async ({ matchId, action, value }) => {
      await svc.controlClock(matchId, action, value);
      return svc.matchView(matchId);
    })
  );

  socket.on(
    MAT_EVT.FINISH,
    run(async ({ matchId, winner, method, submissionType }) => {
      await svc.finishMatch(matchId, { winner, method, submissionType });
      return svc.matchView(matchId);
    })
  );

  socket.on(
    MAT_EVT.REOPEN,
    run(async ({ matchId }) => {
      await svc.reopenMatch(matchId);
      return svc.matchView(matchId);
    })
  );
}
