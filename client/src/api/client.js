import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
});

export const errMsg = (err) =>
  err?.response?.data?.message || err?.message || 'Something went wrong';

export const mediaUrl = (path) => (path ? `${API_URL}${path}` : '');

export default api;
