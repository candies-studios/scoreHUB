/**
 * In-memory state for every live bout room.
 * Mongo remains the source of truth for scores; this only tracks the
 * ephemeral things a round needs: who is connected and where the clock is.
 */
const rooms = new Map();

export const roomKey = (boutId) => `bout:${boutId}`;

export function getRoom(boutId) {
  const key = roomKey(boutId);
  if (!rooms.has(key)) {
    rooms.set(key, {
      boutId: String(boutId),
      judges: new Map(), // judgeId -> { judgeId, judgeName, seat, socketIds:Set, ready:boolean }
      supervisors: new Set(),
      expectedJudges: 3,
      currentRound: 1,
      timer: {
        running: false,
        startedAt: null, // epoch ms
        elapsedSec: 0, // accumulated while paused
        durationSec: 300,
      },
      roundSubmissions: new Map(), // roundNo -> Set(judgeId)
      finished: false,
    });
  }
  return rooms.get(key);
}

export function dropRoom(boutId) {
  rooms.delete(roomKey(boutId));
}

export function addJudge(room, { judgeId, judgeName, seat, socketId }) {
  const id = String(judgeId);
  const entry = room.judges.get(id) || {
    judgeId: id,
    judgeName,
    seat,
    socketIds: new Set(),
    ready: false,
  };
  entry.judgeName = judgeName || entry.judgeName;
  entry.seat = seat ?? entry.seat;
  entry.socketIds.add(socketId);
  room.judges.set(id, entry);
  return entry;
}

export function removeSocket(room, socketId) {
  room.supervisors.delete(socketId);
  for (const [id, entry] of room.judges) {
    entry.socketIds.delete(socketId);
    if (entry.socketIds.size === 0) room.judges.delete(id);
  }
}

export function presence(room) {
  const connected = [...room.judges.values()]
    .map((j) => ({ judgeId: j.judgeId, judgeName: j.judgeName, seat: j.seat, ready: j.ready }))
    .sort((a, b) => (a.seat || 0) - (b.seat || 0));

  return {
    boutId: room.boutId,
    joined: connected.length,
    expected: room.expectedJudges,
    allJoined: connected.length >= room.expectedJudges,
    judges: connected,
    supervisors: room.supervisors.size,
    currentRound: room.currentRound,
    finished: room.finished,
  };
}

export function timerState(room) {
  const { timer } = room;
  const elapsed = timer.running
    ? timer.elapsedSec + Math.floor((Date.now() - timer.startedAt) / 1000)
    : timer.elapsedSec;

  return {
    running: timer.running,
    startedAt: timer.startedAt,
    elapsedSec: Math.min(elapsed, timer.durationSec),
    durationSec: timer.durationSec,
    remainingSec: Math.max(timer.durationSec - elapsed, 0),
    serverNow: Date.now(),
  };
}

export function startTimer(room, durationSec) {
  if (durationSec) room.timer.durationSec = durationSec;
  if (room.timer.running) return timerState(room);
  room.timer.running = true;
  room.timer.startedAt = Date.now();
  return timerState(room);
}

export function stopTimer(room) {
  if (!room.timer.running) return timerState(room);
  room.timer.elapsedSec += Math.floor((Date.now() - room.timer.startedAt) / 1000);
  room.timer.running = false;
  room.timer.startedAt = null;
  return timerState(room);
}

export function resetTimer(room, durationSec) {
  room.timer.running = false;
  room.timer.startedAt = null;
  room.timer.elapsedSec = 0;
  if (durationSec) room.timer.durationSec = durationSec;
  return timerState(room);
}

export function markSubmitted(room, roundNo, judgeId) {
  if (!room.roundSubmissions.has(roundNo)) room.roundSubmissions.set(roundNo, new Set());
  room.roundSubmissions.get(roundNo).add(String(judgeId));
  return room.roundSubmissions.get(roundNo).size;
}
