// Single source of truth for socket event names, shared conceptually with the client.
export const EVT = {
  // client -> server
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

  // server -> client
  PRESENCE: 'bout:presence',
  STATE: 'bout:state',
  TIMER: 'round:timer',
  TOKEN_UPDATE: 'score:update',
  ROUND_WAITING: 'round:waiting',
  ROUND_COMPLETE: 'round:complete',
  BOUT_FINISHED: 'bout:finished',
  ERROR: 'bout:error',
};

export default EVT;
