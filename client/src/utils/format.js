export const CATEGORIES = [
  { key: 'standup', label: 'Strikes & Kicks\nStand Up Fight' },
  { key: 'takedowns', label: 'Takedowns' },
  { key: 'groundStrikes', label: 'Strikes on Ground' },
  { key: 'grappling', label: 'Grappling & Submissions' },
];

export const TOKENS = ['1', '0', '+'];

export const FINISH_METHODS = [
  'Head KO',
  'KO Body',
  'TKO',
  'No Contest',
  'RNC',
  'Submission',
  'DQ',
];

export const ROUND_DURATIONS = [
  { value: 60, label: '1 Minute' },
  { value: 120, label: '2 Minutes' },
  { value: 180, label: '3 Minutes' },
  { value: 240, label: '4 Minutes' },
  { value: 300, label: '5 Minutes' },
];

export const SCORE_OPTIONS = [10, 9, 8, 7, 6];

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function fmtTime12(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fmtDuration(sec) {
  const m = Math.round((sec || 0) / 60);
  return `${m} min`;
}

export const cornerName = (bout, corner) =>
  (corner === 'blue' ? bout?.blueCorner?.fighter?.name : bout?.redCorner?.fighter?.name) || '—';
