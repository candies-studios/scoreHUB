import api from './client.js';

/** REST surface for the analytics layer. Realtime goes through useFightSocket. */
export const fightApi = {
  meta: () => api.get('/fights/meta').then((r) => r.data),

  snapshot: (boutId) => api.get(`/fights/${boutId}/snapshot`).then((r) => r.data),
  stats: (boutId, round) =>
    api.get(`/fights/${boutId}/stats`, { params: { round } }).then((r) => r.data),

  clock: (boutId) => api.get(`/fights/${boutId}/clock`).then((r) => r.data),
  clockAction: (boutId, action, body = {}) =>
    api.post(`/fights/${boutId}/clock/${action}`, body).then((r) => r.data),

  events: (boutId, params = {}) =>
    api.get(`/fights/${boutId}/events`, { params }).then((r) => r.data),
  recordEvent: (boutId, body) => api.post(`/fights/${boutId}/events`, body).then((r) => r.data),
  voidEvent: (boutId, eventId, reason) =>
    api.post(`/fights/${boutId}/events/${eventId}/void`, { reason }).then((r) => r.data),

  control: (boutId, round) =>
    api.get(`/fights/${boutId}/control`, { params: { round } }).then((r) => r.data),

  fouls: (boutId, round) =>
    api.get(`/fights/${boutId}/fouls`, { params: { round } }).then((r) => r.data),
  recordFoul: (boutId, body) => api.post(`/fights/${boutId}/fouls`, body).then((r) => r.data),
  voidFoul: (boutId, foulId, reason) =>
    api.post(`/fights/${boutId}/fouls/${foulId}/void`, { reason }).then((r) => r.data),

  estimate: (boutId, roundNo) =>
    api.get(`/fights/${boutId}/estimate/${roundNo}`).then((r) => r.data),
  scorecard: (boutId) => api.get(`/fights/${boutId}/scorecard`).then((r) => r.data),

  assessment: (boutId, roundNo) =>
    api.get(`/fights/${boutId}/assessment/${roundNo}`).then((r) => r.data),
  saveAssessment: (boutId, roundNo, body) =>
    api.put(`/fights/${boutId}/assessment/${roundNo}`, body).then((r) => r.data),

  confirmResult: (boutId, body) => api.post(`/fights/${boutId}/result`, body).then((r) => r.data),
  audit: (boutId, limit = 100) =>
    api.get(`/fights/${boutId}/audit`, { params: { limit } }).then((r) => r.data),
};

export default fightApi;
