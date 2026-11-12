import api from './client.js';

const d = (r) => r.data;
const form = (data) =>
  data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined;

export const tournamentApi = {
  list: (params) => api.get('/tournaments', { params }).then(d),
  get: (id) => api.get(`/tournaments/${id}`).then(d),
  create: (data) => api.post('/tournaments', data, form(data)).then(d),
  update: (id, data) => api.put(`/tournaments/${id}`, data, form(data)).then(d),
  remove: (id) => api.delete(`/tournaments/${id}`).then(d),

  divisions: (id) => api.get(`/tournaments/${id}/divisions`).then(d),
  addDivision: (id, data) => api.post(`/tournaments/${id}/divisions`, data).then(d),
  generateDivisions: (id, template) => api.post(`/tournaments/${id}/divisions/generate`, template).then(d),

  registrations: (id, params) => api.get(`/tournaments/${id}/registrations`, { params }).then(d),
  register: (id, data) => api.post(`/tournaments/${id}/registrations`, data).then(d),

  drawAll: (id) => api.post(`/tournaments/${id}/brackets`).then(d),
  schedule: (id, mat) => api.get(`/tournaments/${id}/schedule`, { params: { mat } }).then(d),
  autoSchedule: (id) => api.post(`/tournaments/${id}/schedule`).then(d),
  results: (id) => api.get(`/tournaments/${id}/results`).then(d),
};

export const divisionApi = {
  update: (id, data) => api.put(`/divisions/${id}`, data).then(d),
  remove: (id, force) => api.delete(`/divisions/${id}`, { params: { force } }).then(d),
  bracket: (id) => api.get(`/divisions/${id}/bracket`).then(d),
  draw: (id, force) => api.post(`/divisions/${id}/bracket`, { force }).then(d),
  clear: (id) => api.delete(`/divisions/${id}/bracket`).then(d),
};

export const registrationApi = {
  update: (id, data) => api.patch(`/registrations/${id}`, data).then(d),
  remove: (id) => api.delete(`/registrations/${id}`).then(d),
};

export const matchApi = {
  get: (id) => api.get(`/matches/${id}`).then(d),
  result: (id, data) => api.post(`/matches/${id}/result`, data).then(d),
  reopen: (id) => api.post(`/matches/${id}/reopen`).then(d),
};

export const athleteApi = {
  list: (params) => api.get('/athletes', { params }).then(d),
  profile: (id) => api.get(`/athletes/${id}`).then(d),
  create: (data) => api.post('/athletes', data, form(data)).then(d),
  update: (id, data) => api.put(`/athletes/${id}`, data, form(data)).then(d),
  remove: (id) => api.delete(`/athletes/${id}`).then(d),
};

export const academyApi = {
  list: (params) => api.get('/academies', { params }).then(d),
  profile: (id) => api.get(`/academies/${id}`).then(d),
  create: (data) => api.post('/academies', data, form(data)).then(d),
  update: (id, data) => api.put(`/academies/${id}`, data, form(data)).then(d),
  remove: (id) => api.delete(`/academies/${id}`).then(d),
};

export const rankingApi = {
  athletes: (params) => api.get('/rankings/athletes', { params }).then(d),
  academies: (params) => api.get('/rankings/academies', { params }).then(d),
};
