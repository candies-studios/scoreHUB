import api from './client.js';

export const leagueApi = {
  list: (scope = 'all') => api.get('/leagues', { params: { scope } }).then((r) => r.data),
  get: (id) => api.get(`/leagues/${id}`).then((r) => r.data),
  create: (data) => api.post('/leagues', data, formHeaders(data)).then((r) => r.data),
  update: (id, data) => api.put(`/leagues/${id}`, data, formHeaders(data)).then((r) => r.data),
  remove: (id) => api.delete(`/leagues/${id}`).then((r) => r.data),
};

export const fighterApi = {
  list: (league) => api.get('/fighters', { params: { league } }).then((r) => r.data),
  get: (id) => api.get(`/fighters/${id}`).then((r) => r.data),
  create: (data) => api.post('/fighters', data, formHeaders(data)).then((r) => r.data),
  update: (id, data) => api.put(`/fighters/${id}`, data, formHeaders(data)).then((r) => r.data),
  remove: (id) => api.delete(`/fighters/${id}`).then((r) => r.data),
};

export const officialApi = {
  list: (league, kind) => api.get('/officials', { params: { league, kind } }).then((r) => r.data),
  create: (data) => api.post('/officials', data).then((r) => r.data),
  update: (id, data) => api.put(`/officials/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/officials/${id}`).then((r) => r.data),
};

export const boutApi = {
  list: (params) => api.get('/bouts', { params }).then((r) => r.data),
  get: (id) => api.get(`/bouts/${id}`).then((r) => r.data),
  create: (data) => api.post('/bouts', data).then((r) => r.data),
  update: (id, data) => api.put(`/bouts/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/bouts/${id}`).then((r) => r.data),
  scorecards: (id, judge) =>
    api.get(`/bouts/${id}/scorecards`, { params: { judge } }).then((r) => r.data),
  summary: (id) => api.get(`/bouts/${id}/summary`).then((r) => r.data),
  reset: (id) => api.post(`/bouts/${id}/reset`).then((r) => r.data),
};

function formHeaders(data) {
  return data instanceof FormData
    ? { headers: { 'Content-Type': 'multipart/form-data' } }
    : undefined;
}
