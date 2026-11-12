export const SPORTS = [
  { value: 'bjj', label: 'Brazilian Jiu-Jitsu' },
  { value: 'grappling', label: 'Submission Grappling' },
  { value: 'mma', label: 'MMA' },
  { value: 'k1', label: 'K1 / Kickboxing' },
  { value: 'judo', label: 'Judo' },
  { value: 'wrestling', label: 'Wrestling' },
];
export const sportLabel = (v) => SPORTS.find((s) => s.value === v)?.label || v;

export const BELTS = ['white', 'grey', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'black'];
export const ADULT_BELTS = ['white', 'blue', 'purple', 'brown', 'black'];
export const BELT_COLORS = {
  white: '#f8fafc', grey: '#9ca3af', yellow: '#facc15', orange: '#fb923c', green: '#22c55e',
  blue: '#2563eb', purple: '#7c3aed', brown: '#7c4a21', black: '#111827', all: '#e5e7ff',
};
export const AGE_GROUPS = ['Kids', 'Juvenile', 'Adult', 'Master 1', 'Master 2', 'Master 3', 'Master 4'];

/** IBJJF adult male / female gi weight classes, as a sensible default template. */
export const WEIGHT_TEMPLATES = {
  male: [
    { label: '-57.5 kg', maxKg: 57.5 }, { label: '-64 kg', maxKg: 64 }, { label: '-70 kg', maxKg: 70 },
    { label: '-76 kg', maxKg: 76 }, { label: '-82.3 kg', maxKg: 82.3 }, { label: '-88.3 kg', maxKg: 88.3 },
    { label: '-94.3 kg', maxKg: 94.3 }, { label: '-100.5 kg', maxKg: 100.5 }, { label: '+100.5 kg', maxKg: 0 },
  ],
  female: [
    { label: '-48.5 kg', maxKg: 48.5 }, { label: '-53.5 kg', maxKg: 53.5 }, { label: '-58.5 kg', maxKg: 58.5 },
    { label: '-64 kg', maxKg: 64 }, { label: '-69 kg', maxKg: 69 }, { label: '-74 kg', maxKg: 74 },
    { label: '-79.3 kg', maxKg: 79.3 }, { label: '+79.3 kg', maxKg: 0 },
  ],
};

export const STATUS_LABEL = {
  draft: 'Draft', registration: 'Registration open', closed: 'Registration closed', live: 'Live', completed: 'Finished',
};

export const METHOD_LABEL = {
  points: 'Points', advantages: 'Advantages', penalties: 'Penalties', decision: "Referee's decision",
  submission: 'Submission', dq: 'Disqualification', walkover: 'Walkover', injury: 'Injury', bye: 'Bye',
};

export const SUBMISSIONS = [
  'Armbar', 'Triangle', 'Rear naked choke', 'Kimura', 'Americana', 'Guillotine', 'Bow and arrow',
  'Cross collar choke', 'Ezekiel', 'Darce', 'Anaconda', 'Omoplata', 'Straight ankle lock',
  'Kneebar', 'Toe hold', 'Heel hook', 'Other',
];

export const fmtClock = (ms) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtDateRange = (start, end) => {
  if (!start) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const a = new Date(start);
  if (!end || new Date(end).toDateString() === a.toDateString()) return a.toLocaleDateString(undefined, opts);
  const b = new Date(end);
  return `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, opts)}`;
};

export const money = (fee) =>
  !fee?.amount ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: fee.currency || 'INR', maximumFractionDigits: 0 }).format(fee.amount);

export const fullName = (a) => (a ? a.name || `${a.firstName || ''} ${a.lastName || ''}`.trim() : '');
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
export const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
