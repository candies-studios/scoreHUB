/**
 * Analytics realtime channel.
 *
 * Deliberately separate from the judge channel:
 *   judges     room `bout:<id>`       events `bout:* round:* score:*`
 *   analytics  room `analytics:<id>`  events `fight:* stat:* clock:* foul:*`
 *
 * No shared rooms and no shared event names, so a statistician joining cannot
 * affect the 3-judge presence gate or the memory sheet's round timer.
 *
 * The clock lives in MongoDB (FightSession), not in memory here, so a redeploy
 * or a Render cold start resumes at the right second.
 */
import * as svc from '../utils/fightService.js';

export const FIGHT_EVT = {
  // client -> server
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

  // server -> client
  SNAPSHOT: 'fight:snapshot',
  CLOCK: 'fight:clock',
  STATS: 'fight:stats',
  ESTIMATE: 'fight:estimate',
  FOULS: 'fight:fouls',
  VIEWERS: 'fight:viewers',
  ERROR: 'fight:error',
};

export const fightRoom = (boutId) => `analytics:${boutId}`;

/** Viewer counts per room, purely informational. */
const viewers = new Map();

function addViewer(boutId, socketId, role) {
  const key = fightRoom(boutId);
  if (!viewers.has(key)) viewers.set(key, new Map());
  viewers.get(key).set(socketId, role);
}

function removeViewer(boutId, socketId) {
  const key = fightRoom(boutId);
  const set = viewers.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) viewers.delete(key);
}

function viewerSummary(boutId) {
  const set = viewers.get(fightRoom(boutId)) || new Map();
  const roles = [...set.values()];
  return {
    total: roles.length,
    statisticians: roles.filter((r) => r === 'statistician').length,
    analysts: roles.filter((r) => r === 'analyst').length,
    public: roles.filter((r) => r === 'public').length,
  };
}

export function registerFightHandlers(io, socket) {
  const fail = (message) => socket.emit(FIGHT_EVT.ERROR, { message });

  /** Push fresh stats + estimate for the round in play to everyone watching. */
  async function broadcast(boutId, { withEstimate = true } = {}) {
    try {
      const session = await svc.getSession(boutId);
      const roundNo = session.currentRound;
      const room = fightRoom(boutId);

      const stats = await svc.getStats(boutId, roundNo, session.elapsedSec());
      io.to(room).emit(FIGHT_EVT.STATS, { roundNo, stats });
      io.to(room).emit(FIGHT_EVT.CLOCK, session.clockState());

      if (withEstimate) {
        const { estimate } = await svc.estimateRound(boutId, roundNo);
        io.to(room).emit(FIGHT_EVT.ESTIMATE, { roundNo, estimate });
      }
    } catch (err) {
      console.error('[scorehub] analytics broadcast failed:', err.message);
    }
  }

  socket.on(FIGHT_EVT.JOIN, async ({ boutId, role = 'public' }, ack) => {
    try {
      if (!boutId) return fail('boutId is required');
      socket.join(fightRoom(boutId));
      socket.data.fightBoutId = String(boutId);
      socket.data.fightRole = role;
      addViewer(boutId, socket.id, role);

      const snapshot = await svc.getFightSnapshot(boutId);
      socket.emit(FIGHT_EVT.SNAPSHOT, snapshot);
      io.to(fightRoom(boutId)).emit(FIGHT_EVT.VIEWERS, viewerSummary(boutId));
      ack?.({ ok: true, role });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.LEAVE, ({ boutId }) => {
    const id = boutId || socket.data.fightBoutId;
    if (!id) return;
    socket.leave(fightRoom(id));
    removeViewer(id, socket.id);
    io.to(fightRoom(id)).emit(FIGHT_EVT.VIEWERS, viewerSummary(id));
    socket.data.fightBoutId = null;
  });

  /* ---------------- clock ---------------- */

  const clockOp = (event, fn) =>
    socket.on(event, async (payload = {}, ack) => {
      try {
        const id = payload.boutId || socket.data.fightBoutId;
        if (!id) return fail('Not in a fight room');
        await fn(id, payload);
        await broadcast(id, { withEstimate: false });
        ack?.({ ok: true });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

  clockOp(FIGHT_EVT.CLOCK_START, (id, p) => svc.startClock(id, p.actor));
  clockOp(FIGHT_EVT.CLOCK_PAUSE, (id, p) => svc.pauseClock(id, p.actor));
  clockOp(FIGHT_EVT.CLOCK_RESET, (id, p) => svc.resetClock(id, p.actor));
  clockOp(FIGHT_EVT.CLOCK_SET, (id, p) => svc.setClock(id, p.seconds, p.actor, p.reason));

  socket.on(FIGHT_EVT.NEXT_ROUND, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      if (!id) return fail('Not in a fight room');
      await svc.nextRound(id, payload.actor, payload.endedEarlyReason || '');
      const snapshot = await svc.getFightSnapshot(id);
      io.to(fightRoom(id)).emit(FIGHT_EVT.SNAPSHOT, snapshot);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  /* ---------------- recording ---------------- */

  socket.on(FIGHT_EVT.RECORD, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      if (!id) return fail('Not in a fight room');
      if (socket.data.fightRole === 'public') return fail('Public viewers cannot record events');

      const ev = await svc.recordEvent(id, payload, payload.actor || socket.data.fightRole);
      await broadcast(id);
      ack?.({ ok: true, event: ev });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.VOID, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.voidEvent(payload.eventId, payload.reason, payload.actor);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.CONTROL_START, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.startControl(id, payload, payload.actor);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.CONTROL_STOP, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.stopControl(id, payload, payload.actor);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.CONTROL_ACTIVE, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.markControlActive(id, payload.actor);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.FOUL, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.recordFoul(id, payload, payload.actor);
      const fouls = await svc.getFightSnapshot(id);
      io.to(fightRoom(id)).emit(FIGHT_EVT.FOULS, fouls.fouls);
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.ASSESS, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.saveAssessment(id, Number(payload.roundNo), payload, payload.actor || 'analyst');
      await broadcast(id);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.RESULT, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      await svc.confirmResult(id, payload, payload.actor || 'admin');
      const snapshot = await svc.getFightSnapshot(id);
      io.to(fightRoom(id)).emit(FIGHT_EVT.SNAPSHOT, snapshot);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on(FIGHT_EVT.REFRESH, async (payload = {}, ack) => {
    try {
      const id = payload.boutId || socket.data.fightBoutId;
      if (!id) return ack?.({ ok: false, message: 'Not in a fight room' });
      const snapshot = await svc.getFightSnapshot(id);
      socket.emit(FIGHT_EVT.SNAPSHOT, snapshot);
      ack?.({ ok: true });
    } catch (err) {
      fail(err.message);
      ack?.({ ok: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    const id = socket.data.fightBoutId;
    if (!id) return;
    removeViewer(id, socket.id);
    io.to(fightRoom(id)).emit(FIGHT_EVT.VIEWERS, viewerSummary(id));
  });
}

export default registerFightHandlers;
