import { Server } from 'socket.io';
import env from '../config/env.js';
import Bout from '../models/Bout.js';
import Scorecard from '../models/Scorecard.js';
import { EVT } from './events.js';
import {
  getRoom,
  roomKey,
  addJudge,
  removeSocket,
  presence,
  timerState,
  startTimer,
  stopTimer,
  resetTimer,
  markSubmitted,
} from './boutRoom.js';
import {
  ensureScorecards,
  recordToken,
  undoToken,
  submitRound,
  buildSummary,
} from '../utils/scoring.js';

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.clientOrigin, credentials: false },
    pingTimeout: 30000,
  });

  io.on('connection', (socket) => {
    socket.data.boutId = null;
    socket.data.judgeId = null;
    socket.data.seat = null;

    const fail = (message) => socket.emit(EVT.ERROR, { message });

    /**
     * Join a bout room.
     * `judgeId` is an Official id picked from the bout's panel — that is the whole
     * identity step. Omit it to join as a supervisor and watch the panel live.
     */
    socket.on(EVT.JOIN, async ({ boutId, judgeId }, ack) => {
      try {
        const bout = await Bout.findById(boutId).populate('judges', 'name');
        if (!bout) return fail('Bout not found');

        const room = getRoom(boutId);
        room.expectedJudges = bout.judges.length || 3;
        room.currentRound = bout.currentRound || 1;
        room.timer.durationSec = bout.roundDurationSec;
        room.finished = bout.status === 'completed';

        socket.join(roomKey(boutId));
        socket.data.boutId = String(boutId);

        const seatIndex = judgeId
          ? bout.judges.findIndex((j) => String(j._id) === String(judgeId))
          : -1;

        if (judgeId && seatIndex < 0) {
          socket.leave(roomKey(boutId));
          return ack?.({ ok: false, message: 'That judge is not on this bout panel' });
        }

        if (seatIndex >= 0) {
          const official = bout.judges[seatIndex];
          socket.data.judgeId = String(official._id);
          socket.data.seat = seatIndex + 1;
          addJudge(room, {
            judgeId: official._id,
            judgeName: official.name,
            seat: seatIndex + 1,
            socketId: socket.id,
          });
        } else {
          room.supervisors.add(socket.id);
        }

        await ensureScorecards(bout._id);

        const state = {
          presence: presence(room),
          timer: timerState(room),
          role: socket.data.judgeId ? 'judge' : 'supervisor',
          seat: socket.data.seat,
          judgeId: socket.data.judgeId,
          currentRound: room.currentRound,
        };

        socket.emit(EVT.STATE, state);
        io.to(roomKey(boutId)).emit(EVT.PRESENCE, presence(room));
        ack?.({ ok: true, ...state });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

    /** A judge signals they are at the sheet and ready for the round. */
    socket.on(EVT.READY, ({ boutId, ready = true }) => {
      const room = getRoom(boutId || socket.data.boutId);
      const entry = room.judges.get(String(socket.data.judgeId));
      if (!entry) return fail('Only panel judges can signal ready');
      entry.ready = Boolean(ready);
      io.to(roomKey(room.boutId)).emit(EVT.PRESENCE, presence(room));
    });

    /** Start the synchronized round clock — requires the full panel to be present. */
    socket.on(EVT.START_ROUND, async ({ boutId, roundNo }) => {
      try {
        const id = boutId || socket.data.boutId;
        const room = getRoom(id);
        const p = presence(room);
        const isSupervisor = !socket.data.judgeId;

        if (!p.allJoined && !isSupervisor) {
          return socket.emit(EVT.ROUND_WAITING, {
            message: 'Please wait for other judges to join',
            ...p,
          });
        }

        const bout = await Bout.findById(id);
        if (!bout) return fail('Bout not found');
        if (bout.status === 'completed') return fail('This bout is already complete');

        if (roundNo) room.currentRound = Number(roundNo);
        if (bout.status !== 'live' || bout.currentRound !== room.currentRound) {
          bout.status = 'live';
          bout.currentRound = room.currentRound;
          await bout.save();
        }

        const timer = startTimer(room, bout.roundDurationSec);
        io.to(roomKey(id)).emit(EVT.TIMER, { ...timer, currentRound: room.currentRound });
      } catch (err) {
        fail(err.message);
      }
    });

    /** Stop / pause the round clock for everyone. */
    socket.on(EVT.STOP_ROUND, ({ boutId }) => {
      const id = boutId || socket.data.boutId;
      const room = getRoom(id);
      const timer = stopTimer(room);
      io.to(roomKey(id)).emit(EVT.TIMER, { ...timer, currentRound: room.currentRound });
    });

    /** Record one memory-sheet token for this judge. */
    socket.on(EVT.SCORE_TOKEN, async ({ boutId, roundNo, corner, category, token }, ack) => {
      try {
        const id = boutId || socket.data.boutId;
        if (!socket.data.judgeId) return fail('Pick your judge seat before scoring');

        const room = getRoom(id);
        const result = await recordToken({
          boutId: id,
          judgeId: socket.data.judgeId,
          roundNo: roundNo || room.currentRound,
          corner,
          category,
          token,
        });

        const payload = { judgeId: socket.data.judgeId, seat: socket.data.seat, ...result };

        socket.emit(EVT.TOKEN_UPDATE, payload);
        // Supervisors watch the panel live; judges only ever see their own card.
        room.supervisors.forEach((sid) => io.to(sid).emit(EVT.TOKEN_UPDATE, payload));
        ack?.({ ok: true, ...result });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

    /** Undo the last token in a category. */
    socket.on(EVT.SCORE_UNDO, async ({ boutId, roundNo, corner, category }, ack) => {
      try {
        const id = boutId || socket.data.boutId;
        if (!socket.data.judgeId) return fail('Pick your judge seat before scoring');

        const room = getRoom(id);
        const result = await undoToken({
          boutId: id,
          judgeId: socket.data.judgeId,
          roundNo: roundNo || room.currentRound,
          corner,
          category,
        });

        const payload = { judgeId: socket.data.judgeId, seat: socket.data.seat, ...result };
        socket.emit(EVT.TOKEN_UPDATE, payload);
        room.supervisors.forEach((sid) => io.to(sid).emit(EVT.TOKEN_UPDATE, payload));
        ack?.({ ok: true, ...result });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

    /** Submit the round's 10-point-must scores; the round closes once all judges are in. */
    socket.on(EVT.SUBMIT_ROUND, async ({ boutId, roundNo, blueScore, redScore }, ack) => {
      try {
        const id = boutId || socket.data.boutId;
        if (!socket.data.judgeId) return fail('Only panel judges can submit a round');

        const room = getRoom(id);
        const round = Number(roundNo || room.currentRound);
        const timer = timerState(room);

        const { submittedCount, totalJudges, allSubmitted } = await submitRound({
          boutId: id,
          judgeId: socket.data.judgeId,
          roundNo: round,
          blueScore,
          redScore,
          durationSec: timer.elapsedSec,
        });

        markSubmitted(room, round, socket.data.judgeId);

        io.to(roomKey(id)).emit(EVT.ROUND_WAITING, {
          roundNo: round,
          submitted: submittedCount,
          total: totalJudges,
          message: allSubmitted ? 'All judges submitted' : 'Please wait for other judges',
        });

        if (allSubmitted) {
          stopTimer(room);
          const bout = await Bout.findById(id);
          const isLastRound = round >= bout.totalRounds;

          if (isLastRound) {
            const summary = await buildSummary(id);
            bout.status = 'completed';
            bout.result = {
              ...bout.result,
              winnerCorner: summary.decision.corner,
              winnerFighter:
                summary.decision.corner === 'blue'
                  ? bout.blueCorner.fighter
                  : summary.decision.corner === 'red'
                  ? bout.redCorner.fighter
                  : null,
              method: 'Decision',
              endedRound: round,
              endedAtSec: timer.elapsedSec,
              decidedAt: new Date(),
            };
            await bout.save();
            room.finished = true;

            io.to(roomKey(id)).emit(EVT.BOUT_FINISHED, await buildSummary(id));
          } else {
            room.currentRound = round + 1;
            bout.currentRound = room.currentRound;
            await bout.save();
            resetTimer(room, bout.roundDurationSec);

            io.to(roomKey(id)).emit(EVT.ROUND_COMPLETE, {
              roundNo: round,
              nextRound: room.currentRound,
              timer: timerState(room),
            });
          }
        }

        ack?.({ ok: true, submitted: submittedCount, total: totalJudges, allSubmitted });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

    /** A supervisor can advance the round manually. */
    socket.on(EVT.NEXT_ROUND, async ({ boutId }) => {
      try {
        const id = boutId || socket.data.boutId;
        const room = getRoom(id);
        const bout = await Bout.findById(id);
        if (!bout) return fail('Bout not found');

        room.currentRound = Math.min(room.currentRound + 1, bout.totalRounds);
        bout.currentRound = room.currentRound;
        await bout.save();

        resetTimer(room, bout.roundDurationSec);
        io.to(roomKey(id)).emit(EVT.ROUND_COMPLETE, {
          roundNo: room.currentRound - 1,
          nextRound: room.currentRound,
          timer: timerState(room),
        });
      } catch (err) {
        fail(err.message);
      }
    });

    /** A finish: KO, TKO, submission, DQ, no contest. Ends the bout for everyone. */
    socket.on(EVT.FINISH, async ({ boutId, method, winnerCorner, notes }, ack) => {
      try {
        const id = boutId || socket.data.boutId;
        const room = getRoom(id);
        const bout = await Bout.findById(id);
        if (!bout) return fail('Bout not found');

        const timer = stopTimer(room);

        bout.status = 'completed';
        bout.result = {
          winnerCorner: winnerCorner || (method === 'No Contest' ? 'nc' : null),
          winnerFighter:
            winnerCorner === 'blue'
              ? bout.blueCorner.fighter
              : winnerCorner === 'red'
              ? bout.redCorner.fighter
              : null,
          method,
          endedRound: room.currentRound,
          endedAtSec: timer.elapsedSec,
          notes: notes || '',
          decidedAt: new Date(),
        };
        await bout.save();
        await Scorecard.updateMany({ bout: bout._id }, { $set: { locked: true } });
        room.finished = true;

        const summary = await buildSummary(id);
        io.to(roomKey(id)).emit(EVT.BOUT_FINISHED, summary);
        ack?.({ ok: true, summary });
      } catch (err) {
        fail(err.message);
        ack?.({ ok: false, message: err.message });
      }
    });

    /** Re-sync after a reconnect or tab wake-up. */
    socket.on(EVT.SYNC, async ({ boutId }, ack) => {
      const id = boutId || socket.data.boutId;
      if (!id) return ack?.({ ok: false, message: 'Not in a bout room' });

      const room = getRoom(id);
      const state = {
        presence: presence(room),
        timer: timerState(room),
        currentRound: room.currentRound,
      };
      socket.emit(EVT.STATE, state);
      ack?.({ ok: true, ...state });
    });

    socket.on(EVT.LEAVE, ({ boutId }) => {
      const id = boutId || socket.data.boutId;
      if (!id) return;
      const room = getRoom(id);
      removeSocket(room, socket.id);
      socket.leave(roomKey(id));
      io.to(roomKey(id)).emit(EVT.PRESENCE, presence(room));
      socket.data.boutId = null;
      socket.data.judgeId = null;
      socket.data.seat = null;
    });

    socket.on('disconnect', () => {
      const id = socket.data.boutId;
      if (!id) return;
      const room = getRoom(id);
      removeSocket(room, socket.id);
      io.to(roomKey(id)).emit(EVT.PRESENCE, presence(room));
    });
  });

  return io;
}

export default initSockets;
