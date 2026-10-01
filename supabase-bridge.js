/*!
 * ScoreHUB ⇄ WDS Supabase bridge
 *
 * Connects the deployed ScoreHUB build to the shared WDS database WITHOUT
 * rebuilding or changing it. The ScoreHUB bundle already has a "remote API"
 * mode (config.js apiUrl/socketUrl). This script answers that API and its
 * live-sync socket from Supabase:
 *
 *   ScoreHUB  --fetch /api/...-->  bridge  --supabase-js-->  WDS database
 *   ScoreHUB  --socket.io------->  bridge  --Realtime----->  other tablets
 *
 * Load order in index.html (all before the ScoreHUB module script):
 *   1. window.__SCOREHUB_CONFIG__  (with supabaseUrl + supabaseAnonKey)
 *   2. vendor/supabase.js
 *   3. supabase-bridge.js          (this file)
 *
 * With no supabaseUrl/supabaseAnonKey in the config, this file does nothing
 * and ScoreHUB behaves exactly as before.
 *
 * Only UI addition: a PIN field on the "Welcome to ScoreHUB" sign-in, in the
 * app's own styles — without it anyone could pick "Admin" and edit results.
 */
(function () {
  'use strict';

  var cfg = window.__SCOREHUB_CONFIG__ || (window.__SCOREHUB_CONFIG__ = {});
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[scorehub-bridge] vendor/supabase.js did not load; staying in local mode.');
    return;
  }

  // ScoreHUB talks to this virtual origin; nothing is ever sent to it.
  var BRIDGE = 'https://wds-supabase-bridge.invalid';
  cfg.apiUrl = BRIDGE;
  cfg.socketUrl = BRIDGE;
  cfg.local = false;

  var nativeFetch = window.fetch.bind(window);
  var NativeWebSocket = window.WebSocket;
  var TZ = cfg.timezone || 'Asia/Kolkata';
  var PIN_MIN = 6;

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wds-scorehub-auth' },
    global: { fetch: nativeFetch },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  window.__WDS_SUPABASE__ = sb; // handy for support/debugging

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function HttpError(message, status) {
    var e = new Error(message);
    e.status = status || 400;
    return e;
  }

  function fromPg(error) {
    if (!error) return HttpError('Request failed', 500);
    var code = error.code || '';
    var msg = error.message || 'Request failed';
    if (code === '42501') return HttpError(msg.indexOf('row-level security') >= 0
      ? 'You do not have permission to do that.' : msg, 403);
    if (code === 'P0002' || code === 'PGRST116') return HttpError(msg === 'JSON object requested, multiple (or no) rows returned' ? 'Not found' : msg, 404);
    if (code === '23505') return HttpError(msg, 409);
    if (code === 'PGRST301' || /JWT/i.test(msg)) return HttpError('Your session has expired — please sign in again.', 401);
    if (code === '23514' || code === '22023' || code === 'P0001') return HttpError(msg, 422);
    return HttpError(msg, 400);
  }

  function must(res) {
    if (res.error) throw fromPg(res.error);
    return res.data;
  }

  function trimOrNull(v) {
    if (v == null) return null;
    var s = String(v).trim();
    return s ? s : null;
  }

  // Fighter ids inside ScoreHUB are scoped to a league: "<eventId>.<fighterId>"
  function fid(eventId, fighterId) { return fighterId ? eventId + '.' + fighterId : null; }
  function splitFid(id) {
    if (!id) return { eventId: null, fighterId: null };
    var i = String(id).indexOf('.');
    return i < 0 ? { eventId: null, fighterId: String(id) } : { eventId: id.slice(0, i), fighterId: id.slice(i + 1) };
  }
  function globalFighterId(id) { return splitFid(id).fighterId; }

  // "2026-11-21T13:00:00.000Z" -> { date: "2026-11-21", time: "18:30" } in the event timezone
  function toLocalParts(iso) {
    if (!iso) return { date: null, time: null };
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { date: null, time: null };
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});
    return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
  }

  function dateOnlyToIso(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr + 'T12:00:00Z').toISOString();
  }

  async function currentUserId() {
    var s = await sb.auth.getSession();
    return s.data.session ? s.data.session.user.id : null;
  }
  async function requireUser() {
    var id = await currentUserId();
    if (!id) throw HttpError('Not signed in', 401);
    return id;
  }

  // data:image/... -> public Storage URL (falls back to the data URL itself)
  async function storeImage(value, path) {
    if (!value || typeof value !== 'string' || value.indexOf('data:') !== 0) return value || null;
    try {
      var blob = await (await nativeFetch(value)).blob();
      var ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      var key = path + '.' + ext;
      var up = await sb.storage.from('wds-media').upload(key, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' });
      if (up.error) throw up.error;
      var url = sb.storage.from('wds-media').getPublicUrl(key).data.publicUrl;
      return url + '?v=' + Date.now();
    } catch (e) {
      console.warn('[scorehub-bridge] image upload failed, storing inline:', e && e.message);
      return value;
    }
  }

  // ---------------------------------------------------------------------------
  // Mappers: database rows -> ScoreHUB shapes
  // ---------------------------------------------------------------------------
  function toLeague(e) {
    return {
      id: e.id,
      name: e.title,
      startsAt: e.starts_at || null,
      location: [e.venue, e.city].filter(Boolean).join(', ') || 'TBA',
      promoterName: e.promoter_name || '',
      logoUrl: e.logo_url || null,
      amateurMmaBouts: e.amateur_mma_bouts, proMmaBouts: e.pro_mma_bouts,
      amateurBjjBouts: e.amateur_bjj_bouts, proBjjBouts: e.pro_bjj_bouts,
      amateurK1Bouts: e.amateur_k1_bouts, proK1Bouts: e.pro_k1_bouts,
      createdById: e.created_by || null,
      status: e.status,
    };
  }

  function splitName(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (parts.length <= 1) return { first: parts[0] || '', last: '' };
    return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
  }

  function displayName(first, nick, last) {
    var n = nick && String(nick).trim();
    return [String(first || '').trim(), n ? '"' + n + '"' : '', String(last || '').trim()].filter(Boolean).join(' ');
  }

  // f = fighters row (+ optional fighter_contacts), ef = event_fighters row
  function toFighter(eventId, f, ef, contact) {
    var guess = splitName(f.name);
    var first = f.first_name != null ? f.first_name : guess.first;
    var last = f.last_name != null ? f.last_name : guess.last;
    return {
      id: fid(eventId, f.id),
      leagueId: eventId,
      firstName: first,
      lastName: last,
      nickname: f.nickname || null,
      dateOfBirth: contact && contact.date_of_birth ? contact.date_of_birth : null,
      team: f.team || null,
      cityStateCountry: f.hometown || null,
      height: f.height || null,
      weight: f.weight || null,
      sherdogOrSocial: f.social_url || null,
      weightClass: (ef && ef.weight_class) || f.weight_class || null,
      photoUrl: f.photo_url || null,
      name: displayName(first, f.nickname, last),
    };
  }

  function toBout(b) {
    return {
      id: b.id,
      leagueId: b.event_id,
      boutNumber: b.bout_number,
      boutName: b.bout_name,
      discipline: b.discipline,
      boutType: b.bout_type,
      boutDate: b.bout_date ? dateOnlyToIso(b.bout_date) : (b.event && b.event.starts_at) || new Date().toISOString(),
      ringNo: b.ring_no,
      totalRounds: b.total_rounds,
      roundDuration: b.round_duration,
      currentRound: b.current_round,
      status: b.status,
      blueFighterId: fid(b.event_id, b.blue_fighter_id),
      redFighterId: fid(b.event_id, b.red_fighter_id),
      refereeId: b.referee_id,
      resultType: b.result_type,
      winnerId: fid(b.event_id, b.winner_id),
      endRound: b.end_round,
      endTimeSec: b.end_time_sec,
      resultNote: b.result_note,
      startedAt: b.started_at,
      completedAt: b.completed_at,
      resultStatus: b.result_status, // extra: provisional / final (ignored by the UI)
    };
  }

  // ---------------------------------------------------------------------------
  // Data access
  // ---------------------------------------------------------------------------
  var EVENT_COLS = 'id,title,status,starts_at,venue,city,promoter_name,logo_url,created_by,is_listed,' +
    'amateur_mma_bouts,pro_mma_bouts,amateur_bjj_bouts,pro_bjj_bouts,amateur_k1_bouts,pro_k1_bouts';
  var FIGHTER_COLS = 'id,name,first_name,last_name,nickname,team,hometown,height,weight,social_url,weight_class,photo_url';

  async function getEvent(id) {
    var e = must(await sb.from('events').select(EVENT_COLS).eq('id', id).maybeSingle());
    if (!e) throw HttpError('League not found', 404);
    return e;
  }

  async function rosterFor(eventId) {
    var rows = must(await sb.from('event_fighters')
      .select('event_id,fighter_id,weight_class,fighter:fighters(' + FIGHTER_COLS + ')')
      .eq('event_id', eventId));
    var ids = rows.map(function (r) { return r.fighter_id; });
    var contacts = {};
    if (ids.length) {
      // Management only (RLS); everyone else simply gets no private fields.
      var c = await sb.from('fighter_contacts').select('fighter_id,date_of_birth').in('fighter_id', ids);
      (c.data || []).forEach(function (x) { contacts[x.fighter_id] = x; });
    }
    return rows.filter(function (r) { return r.fighter; }).map(function (r) {
      return toFighter(eventId, r.fighter, r, contacts[r.fighter_id]);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  var BOUT_SELECT = '*, event:events(id,title,starts_at,venue,city,promoter_name,logo_url,status),' +
    'judges:bout_judges(id,bout_id,judge_id,seat,judge:profiles(id,name)),' +
    'scores:round_scores(id,bout_id,judge_id,round_number,tally,blue_score,red_score,submitted,submitted_at),' +
    'referee:profiles!bouts_referee_id_fkey(id,name)';

  async function hydrateBouts(rows) {
    if (!rows.length) return [];
    var eventIds = Array.from(new Set(rows.map(function (b) { return b.event_id; })));
    var fightersByEvent = {};
    await Promise.all(eventIds.map(async function (eid) {
      var list = await rosterFor(eid);
      var map = {};
      list.forEach(function (f) { map[f.id] = f; });
      fightersByEvent[eid] = map;
    }));
    // Fighters on the card but not on the roster still need to show.
    var missing = [];
    rows.forEach(function (b) {
      [b.blue_fighter_id, b.red_fighter_id].forEach(function (x) {
        if (x && !fightersByEvent[b.event_id][fid(b.event_id, x)]) missing.push(x);
      });
    });
    var extra = {};
    if (missing.length) {
      var fx = must(await sb.from('fighters').select(FIGHTER_COLS).in('id', Array.from(new Set(missing))));
      fx.forEach(function (f) { extra[f.id] = f; });
    }
    function fighterObj(b, id) {
      if (!id) return null;
      return fightersByEvent[b.event_id][fid(b.event_id, id)] ||
        (extra[id] ? toFighter(b.event_id, extra[id], null, null) : null);
    }
    return rows.map(function (b) {
      var out = toBout(b);
      out.blueFighter = fighterObj(b, b.blue_fighter_id);
      out.redFighter = fighterObj(b, b.red_fighter_id);
      out.referee = b.referee ? { id: b.referee.id, name: b.referee.name } : null;
      out.judges = (b.judges || []).slice().sort(function (x, y) { return x.seat - y.seat; }).map(function (j) {
        return { id: j.id, boutId: j.bout_id, judgeId: j.judge_id, seat: j.seat,
          judge: { id: j.judge_id, name: j.judge ? j.judge.name : 'Judge' } };
      });
      out.roundScores = (b.scores || []).map(function (s) {
        return { id: s.id, boutId: s.bout_id, judgeId: s.judge_id, roundNumber: s.round_number,
          tally: s.tally, blueScore: s.blue_score, redScore: s.red_score,
          submitted: s.submitted, submittedAt: s.submitted_at };
      });
      out.league = b.event ? toLeague(b.event) : undefined;
      return out;
    });
  }

  async function getBout(id) {
    var rows = must(await sb.from('bouts').select(BOUT_SELECT).eq('id', id));
    if (!rows.length) throw HttpError('Bout not found', 404);
    return (await hydrateBouts(rows))[0];
  }

  // League input -> events columns
  async function leagueColumns(input, eventId) {
    var when = toLocalParts(input.startsAt);
    var cols = {
      title: String(input.name || '').trim(),
      venue: /^tba$/i.test(String(input.location || '').trim()) ? null : trimOrNull(input.location),
      promoter_name: trimOrNull(input.promoterName) || 'WDS Promotions',
      amateur_mma_bouts: input.amateurMmaBouts | 0, pro_mma_bouts: input.proMmaBouts | 0,
      amateur_bjj_bouts: input.amateurBjjBouts | 0, pro_bjj_bouts: input.proBjjBouts | 0,
      amateur_k1_bouts: input.amateurK1Bouts | 0, pro_k1_bouts: input.proK1Bouts | 0,
      event_date: when.date,
      start_time: when.time,
      timezone: TZ,
    };
    if ('logoUrl' in input) cols.logo_url = await storeImage(input.logoUrl, 'leagues/' + (eventId || 'new-' + Date.now()));
    return cols;
  }

  // Bout input -> bouts columns
  function boutColumns(input) {
    var when = toLocalParts(input.boutDate);
    return {
      bout_number: Math.max(1, input.boutNumber | 0),
      bout_name: trimOrNull(input.boutName),
      discipline: input.discipline || 'MMA',
      bout_type: input.boutType || 'PROFESSIONAL',
      bout_date: when.date,
      ring_no: trimOrNull(input.ringNo),
      total_rounds: input.totalRounds | 0 || 3,
      round_duration: input.roundDuration | 0 || 300,
      blue_fighter_id: globalFighterId(input.blueFighterId),
      red_fighter_id: globalFighterId(input.redFighterId),
      referee_id: input.refereeId || null,
    };
  }

  async function replaceSeats(boutId, judgeIds) {
    must(await sb.from('bout_judges').delete().eq('bout_id', boutId));
    var seats = (judgeIds || []).filter(Boolean).map(function (j, i) {
      return { bout_id: boutId, judge_id: j, seat: i + 1 };
    });
    if (seats.length) must(await sb.from('bout_judges').insert(seats));
  }

  // Fighter input (ScoreHUB form) -> fighters/contacts columns
  function fighterColumns(input) {
    var first = String(input.firstName || '').trim();
    var last = String(input.lastName || '').trim();
    return {
      name: [first, last].filter(Boolean).join(' '),
      first_name: first,
      last_name: last,
      nickname: trimOrNull(input.nickname),
      team: trimOrNull(input.team),
      hometown: trimOrNull(input.cityStateCountry),
      height: trimOrNull(input.height),
      weight: trimOrNull(input.weight),
      social_url: trimOrNull(input.sherdogOrSocial),
      weight_class: trimOrNull(input.weightClass),
    };
  }

  // ---------------------------------------------------------------------------
  // Officials & sign-in
  // ---------------------------------------------------------------------------
  function norm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  var ROLE_LABEL = { ADMIN: 'Admin', PROMOTER: 'Promoter', JUDGE: 'Judge', REFEREE: 'Referee' };

  async function myProfile() {
    var uid = await currentUserId();
    if (!uid) return null;
    var p = must(await sb.from('profiles').select('id,name,email,role,active').eq('id', uid).maybeSingle());
    if (!p || !p.active || !p.role) return null;
    return { id: p.id, name: p.name, email: p.email || '', role: p.role };
  }

  function pinFromForm() {
    var el = document.getElementById('ident-pin');
    return el ? el.value : '';
  }

  async function identify(body) {
    var name = String(body.name || '').trim();
    var role = body.role;
    if (name.length < 2) throw HttpError('Please enter your name', 422);
    var pin = pinFromForm();
    if (!pin || pin.length < PIN_MIN) throw HttpError('Enter your PIN (at least ' + PIN_MIN + ' characters).', 422);

    var officials = must(await sb.rpc('list_officials'));
    var person = officials.find(function (o) { return norm(o.name) === norm(name) && o.role === role; });
    if (!person) {
      var other = officials.find(function (o) { return norm(o.name) === norm(name); });
      throw HttpError(other
        ? name + ' is registered as ' + (ROLE_LABEL[other.role] || other.role) + ' — choose that role.'
        : 'No ' + (ROLE_LABEL[role] || role) + ' named "' + name + '" is registered with WDS. Ask management to add you.', 422);
    }

    await sb.auth.signOut({ scope: 'local' });
    if (person.registered) {
      var res = await sb.auth.signInWithPassword({ email: person.login_email, password: pin });
      if (res.error) throw HttpError('That PIN is not right for ' + person.name + '.', 422);
    } else {
      // First sign-in of an invited official: the PIN they choose becomes theirs.
      var up = await sb.auth.signUp({ email: person.login_email, password: pin, options: { data: { name: person.name } } });
      if (up.error) throw HttpError(up.error.message, 422);
      if (!up.data.session) {
        throw HttpError('Account created. Confirm the email sent to ' + person.login_email + ', then sign in again with the same PIN.', 422);
      }
    }
    var me = await myProfile();
    if (!me || me.role !== role) {
      await sb.auth.signOut({ scope: 'local' });
      throw HttpError('Your account is not active yet. Ask WDS management to check your role.', 403);
    }
    return { user: me };
  }

  // ---------------------------------------------------------------------------
  // REST handlers (same contract as ScoreHUB's built-in backend)
  // ---------------------------------------------------------------------------
  var routes = [];
  function on(method, pattern, fn) {
    routes.push({ method: method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), fn: fn });
  }

  on('GET', '/api/health', async function () { return { ok: true, service: 'supabase' }; });

  // auth
  on('POST', '/api/auth/identify', async function (_, body) { return identify(body || {}); });
  on('POST', '/api/auth/logout', async function () { await sb.auth.signOut({ scope: 'local' }); return { signedOut: true }; });
  on('POST', '/api/auth/login', async function () { throw HttpError('Use your name, role and PIN to sign in.', 400); });
  on('GET', '/api/auth/me', async function () { return myProfile(); });

  // officials
  on('GET', '/api/users', async function (_, __, q) {
    await requireUser();
    var role = q.get('role');
    var query = sb.from('profiles').select('id,name,email,role,phone,active').not('role', 'is', null).order('name');
    if (role) query = query.eq('role', role).eq('active', true);
    var people = must(await query).map(function (p) {
      return { id: p.id, name: p.name, email: p.email || '', role: p.role, phone: p.phone, active: p.active };
    });
    if (!role) {
      var inv = await sb.from('official_invites').select('email,name,role,phone');
      var known = new Set(people.map(function (p) { return norm(p.email); }));
      (inv.data || []).forEach(function (i) {
        if (!known.has(norm(i.email))) {
          people.push({ id: 'invite.' + i.email, name: i.name, email: i.email, role: i.role, phone: i.phone, active: true });
        }
      });
      people.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    return people;
  });
  on('POST', '/api/users', async function (_, body) {
    await requireUser();
    var email = norm(body.email);
    if (!email || email.indexOf('@') < 1) throw HttpError('Enter a valid email', 422);
    var existing = must(await sb.from('profiles').select('id').ilike('email', email));
    if (existing.length) throw HttpError('An account with that email already exists', 409);
    must(await sb.from('official_invites').upsert({ email: email, name: String(body.name || '').trim(), role: body.role, phone: trimOrNull(body.phone) }));
    return { id: 'invite.' + email, name: String(body.name || '').trim(), email: email, role: body.role, phone: trimOrNull(body.phone), active: true };
  });
  on('PUT', '/api/users/:id', async function (p, body) {
    await requireUser();
    var row = { name: String(body.name || '').trim(), role: body.role, phone: trimOrNull(body.phone) };
    if (p[0].indexOf('invite.') === 0) {
      var oldEmail = decodeURIComponent(p[0].slice(7));
      var email = norm(body.email) || oldEmail;
      if (email !== oldEmail) must(await sb.from('official_invites').delete().eq('email', oldEmail));
      must(await sb.from('official_invites').upsert(Object.assign({ email: email }, row)));
      return Object.assign({ id: 'invite.' + email, email: email, active: true }, row);
    }
    var upd = must(await sb.from('profiles').update(row).eq('id', p[0]).select('id,name,email,role,phone,active'));
    if (!upd.length) throw HttpError('Only an admin can edit other officials', 403);
    var u = upd[0];
    return { id: u.id, name: u.name, email: u.email || '', role: u.role, phone: u.phone, active: u.active };
  });
  on('DELETE', '/api/users/:id', async function (p) {
    await requireUser();
    if (p[0].indexOf('invite.') === 0) {
      must(await sb.from('official_invites').delete().eq('email', decodeURIComponent(p[0].slice(7))));
      return { deactivated: p[0] };
    }
    var upd = must(await sb.from('profiles').update({ active: false }).eq('id', p[0]).select('id'));
    if (!upd.length) throw HttpError('Only an admin can deactivate officials', 403);
    return { deactivated: p[0] };
  });

  // leagues (= WDS events)
  on('GET', '/api/leagues', async function (_, __, q) {
    await requireUser();
    var filter = q.get('filter');
    var rows = must(await sb.from('events').select(EVENT_COLS).eq('is_listed', true));
    var now = Date.now();
    var list = rows.filter(function (e) {
      var t = e.starts_at ? new Date(e.starts_at).getTime() : null;
      if (filter === 'past') return (t !== null && t < now && e.status !== 'live') || e.status === 'completed';
      if (filter === 'upcoming') return e.status !== 'completed' && e.status !== 'cancelled' && (t === null || t >= now - 12 * 3600e3 || e.status === 'live');
      return true;
    }).map(toLeague);
    list.sort(function (a, b) {
      var ta = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
      var tb = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
      return filter === 'past' ? tb - ta : ta - tb;
    });
    return list;
  });
  on('GET', '/api/leagues/:id', async function (p) {
    await requireUser();
    var e = await getEvent(p[0]);
    var bouts = must(await sb.from('bouts').select('*').eq('event_id', p[0]).order('bout_number'));
    return Object.assign(toLeague(e), { fighters: await rosterFor(p[0]), bouts: bouts.map(toBout) });
  });
  on('POST', '/api/leagues', async function (_, body) {
    var uid = await requireUser();
    var cols = await leagueColumns(body, null);
    cols.status = 'draft'; // management announces it from the WDS admin dashboard
    cols.created_by = uid;
    var e = must(await sb.from('events').insert(cols).select(EVENT_COLS).single());
    return toLeague(e);
  });
  on('PUT', '/api/leagues/:id', async function (p, body) {
    await requireUser();
    var before = await getEvent(p[0]);
    var cols = await leagueColumns(body, p[0]);
    // Keep the venue/city split when the combined location was not edited.
    if (cols.venue === [before.venue, before.city].filter(Boolean).join(', ')) {
      cols.venue = before.venue;
    } else {
      cols.city = null;
    }
    var upd = must(await sb.from('events').update(cols).eq('id', p[0]).select(EVENT_COLS));
    if (!upd.length) throw HttpError('Only management can edit leagues', 403);
    return toLeague(upd[0]);
  });
  on('DELETE', '/api/leagues/:id', async function (p) {
    await requireUser();
    var del = must(await sb.from('events').delete().eq('id', p[0]).select('id'));
    if (!del.length) throw HttpError('Only an admin can delete a league', 403);
    return { deleted: p[0] };
  });

  // fighters (league roster entries over global fighter identities)
  on('GET', '/api/leagues/:id/fighters', async function (p) { await requireUser(); return rosterFor(p[0]); });
  on('GET', '/api/fighters/:id', async function (p) {
    await requireUser();
    var ids = splitFid(p[0]);
    var list = await rosterFor(ids.eventId);
    var f = list.find(function (x) { return x.id === p[0]; });
    if (!f) throw HttpError('Fighter not found', 404);
    return f;
  });
  on('POST', '/api/leagues/:id/fighters', async function (p, body) {
    await requireUser();
    var eventId = p[0];
    var cols = fighterColumns(body);
    if (!cols.name) throw HttpError('Enter the fighter\'s name', 422);
    var dob = trimOrNull(body.dateOfBirth);
    // Reuse the global identity when the same person fought before.
    var candidates = must(await sb.from('fighters').select('id').eq('name_key', norm(cols.name)));
    var fighterId = null;
    if (candidates.length) {
      var c = await sb.from('fighter_contacts').select('fighter_id,date_of_birth').in('fighter_id', candidates.map(function (x) { return x.id; }));
      var dobs = {};
      (c.data || []).forEach(function (x) { dobs[x.fighter_id] = x.date_of_birth; });
      var match = candidates.find(function (x) { return !dob || !dobs[x.id] || dobs[x.id] === dob; });
      if (match) fighterId = match.id;
    }
    if (fighterId) {
      must(await sb.from('fighters').update(cols).eq('id', fighterId));
    } else {
      fighterId = must(await sb.from('fighters').insert(cols).select('id').single()).id;
    }
    if (body.photoUrl !== undefined) {
      must(await sb.from('fighters').update({ photo_url: await storeImage(body.photoUrl, 'fighters/' + fighterId) }).eq('id', fighterId));
    }
    if (dob) must(await sb.from('fighter_contacts').upsert({ fighter_id: fighterId, date_of_birth: dob }));
    must(await sb.from('event_fighters').upsert({ event_id: eventId, fighter_id: fighterId, weight_class: cols.weight_class }));
    var list = await rosterFor(eventId);
    return list.find(function (x) { return x.id === fid(eventId, fighterId); });
  });
  on('PUT', '/api/fighters/:id', async function (p, body) {
    await requireUser();
    var ids = splitFid(p[0]);
    var cols = fighterColumns(body);
    if (body.photoUrl !== undefined) cols.photo_url = await storeImage(body.photoUrl, 'fighters/' + ids.fighterId);
    var upd = must(await sb.from('fighters').update(cols).eq('id', ids.fighterId).select('id'));
    if (!upd.length) throw HttpError('Only management can edit fighters', 403);
    must(await sb.from('fighter_contacts').upsert({ fighter_id: ids.fighterId, date_of_birth: trimOrNull(body.dateOfBirth) }));
    if (ids.eventId) must(await sb.from('event_fighters').update({ weight_class: cols.weight_class }).eq('event_id', ids.eventId).eq('fighter_id', ids.fighterId));
    var list = await rosterFor(ids.eventId);
    return list.find(function (x) { return x.id === p[0]; });
  });
  on('DELETE', '/api/fighters/:id', async function (p) {
    await requireUser();
    var ids = splitFid(p[0]);
    // Removes them from this league's roster; their history and ranking stay.
    var del = must(await sb.from('event_fighters').delete().eq('event_id', ids.eventId).eq('fighter_id', ids.fighterId).select('fighter_id'));
    if (!del.length) throw HttpError('Only management can change the roster', 403);
    return { deleted: p[0] };
  });

  // bouts
  on('GET', '/api/leagues/:id/bouts', async function (p) {
    await requireUser();
    return hydrateBouts(must(await sb.from('bouts').select(BOUT_SELECT).eq('event_id', p[0]).order('bout_number')));
  });
  on('GET', '/api/bouts/:id', async function (p) { await requireUser(); return getBout(p[0]); });
  on('POST', '/api/leagues/:id/bouts', async function (p, body) {
    await requireUser();
    var cols = Object.assign(boutColumns(body), { event_id: p[0] });
    var b = must(await sb.from('bouts').insert(cols).select('id').single());
    await replaceSeats(b.id, body.judgeIds);
    return getBout(b.id);
  });
  on('PUT', '/api/bouts/:id', async function (p, body) {
    await requireUser();
    var upd = must(await sb.from('bouts').update(boutColumns(body)).eq('id', p[0]).select('id'));
    if (!upd.length) throw HttpError('Only management can edit bouts', 403);
    await replaceSeats(p[0], body.judgeIds);
    return getBout(p[0]);
  });
  on('DELETE', '/api/bouts/:id', async function (p) {
    await requireUser();
    var del = must(await sb.from('bouts').delete().eq('id', p[0]).select('id'));
    if (!del.length) throw HttpError('Only management can delete bouts, and never one with a finalized result', 403);
    return { deleted: p[0] };
  });
  on('POST', '/api/bouts/:id/start', async function (p) {
    await requireUser();
    must(await sb.rpc('bout_start', { p_bout: p[0] }));
    return getBout(p[0]);
  });
  on('POST', '/api/bouts/:id/rounds', async function (p, body) {
    await requireUser();
    return must(await sb.rpc('bout_submit_round', {
      p_bout: p[0], p_round: body.roundNumber, p_tally: body.tally || {},
      p_blue: body.blueScore, p_red: body.redScore,
    }));
  });
  on('POST', '/api/bouts/:id/finish', async function (p, body) {
    await requireUser();
    return must(await sb.rpc('bout_finish', {
      p_bout: p[0], p_result_type: body.resultType, p_winner_corner: body.winnerCorner || null,
      p_end_round: body.endRound == null ? null : body.endRound,
      p_end_time_sec: body.endTimeSec == null ? null : body.endTimeSec,
      p_note: body.note || null,
    }));
  });

  function json(status, payload) {
    return new Response(JSON.stringify(payload), { status: status, headers: { 'content-type': 'application/json' } });
  }

  async function handle(url, init) {
    var u = new URL(url);
    var method = ((init && init.method) || 'GET').toUpperCase();
    var body = null;
    if (init && init.body) { try { body = JSON.parse(init.body); } catch (e) { body = null; } }
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.method !== method) continue;
      var m = u.pathname.match(r.re);
      if (!m) continue;
      try {
        var data = await r.fn(m.slice(1).map(decodeURIComponent), body, u.searchParams);
        return json(200, { ok: true, data: data === undefined ? null : data });
      } catch (err) {
        if (!err.status) console.error('[scorehub-bridge]', method, u.pathname, err);
        return json(err.status || 500, { ok: false, error: err.message || 'Something went wrong' });
      }
    }
    return json(404, { ok: false, error: 'Not found: ' + method + ' ' + u.pathname });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    if (url && url.indexOf(BRIDGE) === 0) return handle(url, init);
    return nativeFetch(input, init);
  };

  // ---------------------------------------------------------------------------
  // Live sync: a Socket.IO server emulated over Supabase Realtime.
  // The database is the referee: clock, round lock and result live on the bout
  // row, so every tablet derives the same state; Presence counts who is seated.
  // ---------------------------------------------------------------------------
  var roomSeq = 0;

  function BoutRoom(socket) {
    this.socket = socket;
    this.args = null;
    this.bout = null;
    this.submitted = [];
    this.hub = null;
    this.poll = null;
    this.closed = false;
    this.localRound = 1;
    this.pendingStart = null;
  }

  BoutRoom.prototype.emit = function (event, data) { this.socket._serverSend('42' + JSON.stringify([event, data])); };

  // A judge who has not pressed "Start round N" yet keeps their button; they get
  // the running clock (same start time as everyone) when they press it.
  BoutRoom.prototype.started = function (round, at) {
    if (this.args.role !== 'VIEWER' && round > this.localRound) { this.pendingStart = { round: round, at: at }; return; }
    this.pendingStart = null;
    this.emit('bout:started', { round: round, roundStartedAt: at });
  };

  BoutRoom.prototype.presence = function () {
    var state = this.hub ? this.hub.channel.presenceState() : {};
    var seen = {};
    var participants = [];
    var add = function (p) {
      if (!seen[p.userId]) { seen[p.userId] = 1; participants.push({ userId: p.userId, name: p.name, role: p.role, seat: p.seat == null ? undefined : p.seat }); }
    };
    Object.keys(state).forEach(function (k) { (state[k] || []).forEach(add); });
    (this.heartbeat || []).forEach(function (h) { add({ userId: h.user_id, name: h.name, role: h.role, seat: h.seat }); });
    var seats = {};
    participants.forEach(function (p) { if (p.seat != null && p.role !== 'VIEWER') seats[p.seat] = 1; });
    var joined = Object.keys(seats).length;
    var expected = this.args.expectedJudges || 3;
    var b = this.bout || {};
    var status = b.status === 'COMPLETED' ? 'COMPLETED'
      : b.round_started_at ? 'LIVE'
      : (b.status === 'LIVE' && (b.current_round || 0) > 0) ? 'BETWEEN_ROUNDS' : 'WAITING';
    return {
      boutId: this.args.boutId, joined: joined, expected: expected, ready: joined >= expected,
      participants: participants, status: status, currentRound: b.current_round || 1,
      roundStartedAt: b.round_started_at ? Date.parse(b.round_started_at) : null,
      roundDuration: b.round_duration || this.args.roundDuration, submitted: this.submitted.slice(),
    };
  };

  BoutRoom.prototype.sync = async function (initial) {
    if (this.closed) return;
    var id = this.args.boutId;
    var res = await Promise.all([
      sb.rpc('bout_heartbeat', { p_bout: id, p_viewer: this.args.role === 'VIEWER' }),
      sb.from('bouts').select('id,status,current_round,round_started_at,round_duration,total_rounds,result_type,winner_id,blue_fighter_id,red_fighter_id,result_note').eq('id', id).maybeSingle(),
      sb.from('round_scores').select('judge_id,round_number,submitted').eq('bout_id', id),
    ]);
    var hb = res.shift();
    if (hb.error) console.warn('[scorehub-bridge] heartbeat:', hb.error.message);
    this.heartbeat = hb.data || this.heartbeat || [];
    if (res[0].error || !res[0].data) {
      if (initial) this.emit('bout:error', { message: res[0].error ? res[0].error.message : 'Bout not found' });
      return;
    }
    var prev = this.bout;
    var b = res[0].data;
    var openRound = Math.max(1, b.current_round || 1);
    var submitted = (res[1].data || []).filter(function (s) { return s.submitted && s.round_number === openRound; })
      .map(function (s) { return s.judge_id; }).sort();
    var prevSubmitted = this.submitted.join(',');
    this.bout = b;
    this.submitted = submitted;

    if (initial || !prev) {
      if (b.round_started_at) this.started(openRound, Date.parse(b.round_started_at));
    } else {
      if (b.round_started_at && b.round_started_at !== prev.round_started_at) {
        this.started(openRound, Date.parse(b.round_started_at));
      } else if (!b.round_started_at && prev.round_started_at && b.status !== 'COMPLETED' && b.current_round === prev.current_round) {
        this.emit('bout:paused', { boutId: id });
      }
      if ((b.current_round || 0) > (prev.current_round || 0) && (prev.current_round || 0) > 0 && b.status !== 'COMPLETED') {
        this.emit('round:locked', { nextRound: b.current_round });
      }
    }
    if (submitted.join(',') !== prevSubmitted) this.emit('round:progress', { submitted: submitted });
    if (b.status === 'COMPLETED' && (!prev || prev.status !== 'COMPLETED')) {
      var corner = b.winner_id && b.winner_id === b.blue_fighter_id ? 'BLUE' : b.winner_id && b.winner_id === b.red_fighter_id ? 'RED' : null;
      this.emit('bout:finished', { resultType: b.result_type, winnerCorner: corner, summary: b.result_note || undefined });
    }
    this.emit('bout:presence', this.presence());
  };

  // One Realtime channel per bout, shared by every room on this page (React may
  // mount/unmount the scoring sheet quickly; the channel outlives that).
  var hubs = {};
  function hubFor(args) {
    var id = args.boutId;
    var h = hubs[id];
    if (h) { clearTimeout(h.dispose); return h; }
    h = hubs[id] = { rooms: new Set(), meta: null, subscribed: false };
    var each = function (fn) { return function () { h.rooms.forEach(fn); }; };
    h.channel = sb.channel('scorehub-bout-' + id, { config: { presence: { key: String(args.userId) } } })
      .on('presence', { event: 'sync' }, each(function (r) { r.onPresence(); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bouts', filter: 'id=eq.' + id }, each(function (r) { r.resync(); }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_scores', filter: 'bout_id=eq.' + id }, each(function (r) { r.resync(); }));
    h.channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        h.subscribed = true;
        if (h.meta) h.channel.track(h.meta);
      }
    });
    return h;
  }
  function leaveHub(id, room) {
    var h = hubs[id];
    if (!h) return;
    h.rooms.delete(room);
    if (h.rooms.size) return;
    h.dispose = setTimeout(function () {
      if (h.rooms.size) return;
      delete hubs[id];
      try { h.channel.untrack(); } catch (e) {}
      sb.removeChannel(h.channel);
    }, 1500);
  }

  BoutRoom.prototype.onPresence = function () { if (this.bout && !this.closed) this.emit('bout:presence', this.presence()); };
  BoutRoom.prototype.resync = function () {
    this.sync(false).catch(function (e) { console.warn('[scorehub-bridge] sync', e); });
  };

  BoutRoom.prototype.join = async function (args) {
    var self = this;
    this.args = args;
    this.localRound = Math.max(1, args.currentRound || 1);
    await this.sync(true);
    if (this.closed) return;
    this.hub = hubFor(args);
    this.hub.rooms.add(this);
    this.hub.meta = { userId: String(args.userId), name: args.name, role: args.role, seat: args.seat == null ? null : args.seat };
    if (this.hub.subscribed) this.hub.channel.track(this.hub.meta);
    // Safety net if Realtime is unavailable: the database stays the source of truth.
    this.poll = setInterval(function () { self.resync(); }, 4000);
  };

  BoutRoom.prototype.command = async function (event, data) {
    var id = (data && data.boutId) || (this.args && this.args.boutId);
    var call = null;
    if (event === 'bout:start' || event === 'round:next') call = sb.rpc('bout_set_clock', { p_bout: id, p_running: true });
    else if (event === 'bout:pause') call = sb.rpc('bout_set_clock', { p_bout: id, p_running: false });
    if (call) {
      var res = await call;
      if (res.error) { this.emit('bout:error', { message: res.error.message }); return; }
    }
    if (event === 'round:next') this.localRound += 1;
    // round:submitted / bout:finish are already in the database via the API.
    await this.sync(false);
    if (event === 'round:next' && this.bout && this.bout.round_started_at) {
      this.started(Math.max(1, this.bout.current_round || 1), Date.parse(this.bout.round_started_at));
    }
  };

  BoutRoom.prototype.close = function () {
    this.closed = true;
    if (this.poll) clearInterval(this.poll);
    if (this.args) leaveHub(this.args.boutId, this);
  };

  // Minimal WebSocket stand-in speaking Engine.IO v4 / Socket.IO v5.
  function BridgeSocket(url) {
    var self = this;
    this.url = url;
    this.readyState = 0;
    this.binaryType = 'arraybuffer';
    this.protocol = '';
    this.extensions = '';
    this.bufferedAmount = 0;
    this.onopen = this.onclose = this.onmessage = this.onerror = null;
    this._room = new BoutRoom(this);
    this._sid = 'wds' + Math.random().toString(36).slice(2);
    setTimeout(function () {
      self.readyState = 1;
      if (self.onopen) self.onopen({ type: 'open' });
      self._serverSend('0' + JSON.stringify({ sid: self._sid, upgrades: [], pingInterval: 25000, pingTimeout: 60000, maxPayload: 1000000 }));
      self._ping = setInterval(function () { self._serverSend('2'); }, 25000);
    }, 0);
  }
  BridgeSocket.CONNECTING = 0; BridgeSocket.OPEN = 1; BridgeSocket.CLOSING = 2; BridgeSocket.CLOSED = 3;
  BridgeSocket.prototype._serverSend = function (data) {
    var self = this;
    if (this.readyState !== 1) return;
    setTimeout(function () { if (self.onmessage) self.onmessage({ type: 'message', data: data }); }, 0);
  };
  BridgeSocket.prototype.send = function (data) {
    if (typeof data !== 'string') return;
    var type = data.charAt(0);
    if (type === '3' || type === '2') { if (type === '2') this._serverSend('3' + data.slice(1)); return; }
    if (type !== '4') return;
    var sub = data.charAt(1);
    var room = this._room;
    if (sub === '0') { this._serverSend('40' + JSON.stringify({ sid: this._sid + 'n' })); return; }
    if (sub === '1') { room.close(); return; }
    if (sub === '2') {
      var payload = JSON.parse(data.slice(2).replace(/^\d+/, ''));
      var event = payload[0], arg = payload[1];
      var p = event === 'bout:join' ? room.join(arg) : room.command(event, arg);
      p.catch(function (e) { room.emit('bout:error', { message: (e && e.message) || 'Live sync error' }); });
    }
  };
  BridgeSocket.prototype.close = function () {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    clearInterval(this._ping);
    this._room.close();
    if (this.onclose) this.onclose({ type: 'close', code: 1000, reason: '', wasClean: true });
  };
  BridgeSocket.prototype.addEventListener = function (type, fn) { this['on' + type] = fn; };
  BridgeSocket.prototype.removeEventListener = function (type) { this['on' + type] = null; };

  var bridgeHost = new URL(BRIDGE).host;
  function PatchedWebSocket(url, protocols) {
    try {
      if (new URL(url, location.href).host === bridgeHost) return new BridgeSocket(url);
    } catch (e) {}
    return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
  }
  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  PatchedWebSocket.CONNECTING = 0; PatchedWebSocket.OPEN = 1; PatchedWebSocket.CLOSING = 2; PatchedWebSocket.CLOSED = 3;
  window.WebSocket = PatchedWebSocket;

  // ---------------------------------------------------------------------------
  // UI touches (no rebuild): undated events read "TBA"; PIN on sign-in.
  // ---------------------------------------------------------------------------
  try {
    var fmtDesc = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
    if (fmtDesc && fmtDesc.get) {
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
        configurable: true,
        get: function () {
          var real = fmtDesc.get.call(this);
          var isTime = this.resolvedOptions().hour !== undefined && this.resolvedOptions().day === undefined;
          return function (d) { return d === null ? (isTime ? '—' : 'TBA') : real(d); };
        },
      });
    }
  } catch (e) {}

  function addPinField() {
    var name = document.getElementById('ident-name');
    if (!name || document.getElementById('ident-pin')) return;
    var group = name.parentElement;
    var wrap = document.createElement('div');
    wrap.className = 'mt-5';
    wrap.setAttribute('data-wds-bridge', 'pin');
    wrap.innerHTML = '<label class="ss-label" for="ident-pin">PIN</label>' +
      '<input id="ident-pin" class="ss-input" type="password" inputmode="numeric" autocomplete="current-password" minlength="' + PIN_MIN + '">' +
      '<p class="mt-2 px-1 text-xs text-slate-500">First time? The PIN you choose now becomes yours.</p>';
    group.appendChild(wrap); // inside the name field's own wrapper: React never re-orders it
  }
  new MutationObserver(addPinField).observe(document.documentElement, { childList: true, subtree: true });
})();
