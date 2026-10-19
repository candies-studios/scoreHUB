import { io } from 'socket.io-client';
import { API_URL } from './client.js';

export const EVT = {
  JOIN: 'bout:join',
  LEAVE: 'bout:leave',
  READY: 'bout:ready',
  START_ROUND: 'round:start',
  STOP_ROUND: 'round:stop',
  SCORE_TOKEN: 'score:token',
  SCORE_UNDO: 'score:undo',
  SUBMIT_ROUND: 'round:submit',
  NEXT_ROUND: 'round:next',
  FINISH: 'bout:finish',
  SYNC: 'bout:sync',

  PRESENCE: 'bout:presence',
  STATE: 'bout:state',
  TIMER: 'round:timer',
  TOKEN_UPDATE: 'score:update',
  ROUND_WAITING: 'round:waiting',
  ROUND_COMPLETE: 'round:complete',
  BOUT_FINISHED: 'bout:finished',
  ERROR: 'bout:error',
};

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL || '/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
    });
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default getSocket;
