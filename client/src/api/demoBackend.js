/**
 * Offline demo mode.
 *
 * Serves the browsing screens from client/public/data/wds-roster.json — the
 * same file the MongoDB seed reads — so the site shows real events, fighters
 * and bouts on GitHub Pages with no backend at all.
 *
 * It is READ-ONLY on purpose. Writes report clearly that a backend is needed
 * rather than pretending to save, because nothing here survives a refresh.
 * Live scoring and the analytics engine need the Socket.IO server and are not
 * emulated; those screens say so instead of hanging.
 */

let cache = null;

async function roster() {
  if (cache) return cache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/wds-roster.json`);
  if (!res.ok) throw new Error(`Demo data unavailable (${res.status})`);
  cache = await res.json();
  return cache;
}

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.response = { status: 404, data: { message: err.message } };
  throw err;
};

export const DEMO_WRITE_MESSAGE =
  'This site is running in demo mode with no backend connected, so changes cannot be saved. ' +
  'Deploy the API and set API_URL to enable editing.';

const readOnly = () => {
  const err = new Error(DEMO_WRITE_MESSAGE);
  err.response = { status: 503, data: { message: DEMO_WRITE_MESSAGE } };
  throw err;
};

/* ---------------- shaping: roster JSON -> API shapes ---------------- */

const leagueOut = (l) => ({
  _id: l.id,
  id: l.id,
  name: l.name,
  series: l.series,
  date: `${l.date}T${l.time || '00:00'}:00`,
  time: l.time,
  location: l.location,
  promoter: l.promoter,
  logoUrl: '',
  bouts: l.bouts,
});

const fighterOut = (f) => ({
  _id: f.id,
  id: f.id,
  league: f.league,
  name: f.name,
  team: f.team,
  coach: f.coach,
  country: f.country,
  weightClass: f.weightClass,
  weightKg: f.weightKg,
  gender: f.gender,
  record: f.record,
  photoUrl: f.photo || '',
});

const officialOut = (o) => ({
  _id: o.id,
  id: o.id,
  league: o.league,
  kind: o.kind,
  name: o.name,
  contactNo: o.contactNo || '',
  bloodGroup: o.bloodGroup || '',
});

function boutOut(b, data) {
  const f = (id) => {
    const found = data.fighters.find((x) => x.id === id);
    return found ? fighterOut(found) : null;
  };
  const o = (id) => {
    const found = data.officials.find((x) => x.id === id);
    return found ? officialOut(found) : null;
  };

  return {
    _id: b.id,
    id: b.id,
    league: b.league,
    boutNo: b.boutNo,
    boutName: b.boutName,
    boutType: b.boutType,
    discipline: b.discipline,
    boutDate: `${b.boutDate}T00:00:00`,
    ringNo: b.ringNo,
    totalRounds: b.totalRounds,
    roundDurationSec: b.roundDurationSec,
    blueCorner: { fighter: f(b.blueFighter) },
    redCorner: { fighter: f(b.redFighter) },
    judges: (b.judges || []).map(o).filter(Boolean),
    referee: o(b.referee),
    status: b.result ? 'completed' : 'scheduled',
    currentRound: b.result?.endedRound || 1,
    result: b.result
      ? {
          winnerCorner: b.result.winnerCorner,
          method: b.result.method,
          endedRound: b.result.endedRound,
          endedAtSec: b.result.endedAtSec,
          notes: '',
        }
      : { winnerCorner: null, method: null },
  };
}

/* ---------------- the routes the client actually calls ---------------- */

export async function demoRequest(method, url, config = {}) {
  const data = await roster();
  const params = config.params || {};
  const verb = method.toUpperCase();

  if (verb !== 'GET') readOnly();

  const path = url.replace(/^\/+/, '');
  const seg = path.split('?')[0].split('/');

  // ---- /leagues ----
  if (seg[0] === 'leagues') {
    if (seg.length === 1) {
      const today = new Date().toISOString().slice(0, 10);
      const scope = params.scope || 'all';
      let list = data.leagues;
      if (scope === 'upcoming') list = list.filter((l) => l.date >= today);
      if (scope === 'past') list = list.filter((l) => l.date < today);
      list = [...list].sort((a, b) =>
        scope === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
      );
      return list.map(leagueOut);
    }
    const l = data.leagues.find((x) => x.id === seg[1]);
    return l ? leagueOut(l) : notFound('League');
  }

  // ---- /fighters ----
  if (seg[0] === 'fighters') {
    if (seg.length === 1) {
      const list = params.league
        ? data.fighters.filter((f) => f.league === params.league)
        : data.fighters;
      return [...list].sort((a, b) => a.name.localeCompare(b.name)).map(fighterOut);
    }
    const f = data.fighters.find((x) => x.id === seg[1]);
    return f ? fighterOut(f) : notFound('Fighter');
  }

  // ---- /officials ----
  if (seg[0] === 'officials') {
    let list = data.officials;
    if (params.league) list = list.filter((o) => o.league === params.league);
    if (params.kind) list = list.filter((o) => o.kind === params.kind);
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).map(officialOut);
  }

  // ---- /bouts ----
  if (seg[0] === 'bouts') {
    if (seg.length === 1) {
      let list = data.bouts;
      if (params.league) list = list.filter((b) => b.league === params.league);
      if (params.type) list = list.filter((b) => b.boutType === params.type);
      if (params.discipline) list = list.filter((b) => b.discipline === params.discipline);
      return [...list].sort((a, b) => a.boutNo - b.boutNo).map((b) => boutOut(b, data));
    }

    const b = data.bouts.find((x) => x.id === seg[1]);
    if (!b) return notFound('Bout');
    if (seg.length === 2) return boutOut(b, data);

    // /bouts/:id/scorecards — no judge cards exist without a backend
    if (seg[2] === 'scorecards') return [];

    // /bouts/:id/summary — the official result, with empty judge columns
    if (seg[2] === 'summary') {
      const full = boutOut(b, data);
      return {
        bout: {
          id: b.id,
          boutNo: b.boutNo,
          boutName: b.boutName,
          boutType: b.boutType,
          discipline: b.discipline,
          boutDate: full.boutDate,
          ringNo: b.ringNo,
          totalRounds: b.totalRounds,
          roundDurationSec: b.roundDurationSec,
          status: full.status,
          currentRound: full.currentRound,
          result: full.result,
          referee: full.referee?.name || '',
        },
        league: (() => {
          const l = data.leagues.find((x) => x.id === b.league);
          return l ? { ...leagueOut(l) } : null;
        })(),
        corners: {
          blue: full.blueCorner.fighter,
          red: full.redCorner.fighter,
        },
        judges: [],
        decision: { corner: b.result?.winnerCorner ?? null, method: b.result?.method ?? null, split: null },
        winner: b.result
          ? { corner: b.result.winnerCorner, method: b.result.method }
          : { corner: null, method: null },
        demo: true,
      };
    }
  }

  // ---- /fights/* — the analytics engine needs the live server ----
  if (seg[0] === 'fights') {
    const err = new Error(
      'Live fight analytics needs the realtime backend. Deploy the API and set API_URL.'
    );
    err.response = { status: 503, data: { message: err.message } };
    throw err;
  }

  return notFound(`Route /${path}`);
}

export default demoRequest;
