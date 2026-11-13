/*!
 * ScoreHUB — Fight Stats Sheet
 *
 * A second live sheet next to the judges' Memory Sheet. While a bout is live,
 * an official taps every strike, takedown, submission attempt, reversal and
 * knockdown, and runs a control clock. Every tablet sees the same numbers in
 * real time (Supabase Realtime on public.bout_stats) and the sheet turns them
 * into a stat-based performance score and a projected 10-point card.
 *
 * Like supabase-bridge.js this file does not rebuild or change the ScoreHUB
 * bundle. It adds a "Fight Stats" button to the Memory Sheet
 * (/bouts/:id/score) and the Scoreboard (/bouts/:id/scoreboard) and opens the
 * sheet over the page. Database: config/migrations/002_fight_stats.sql.
 *
 * Load order in index.html: config -> vendor/supabase.js -> supabase-bridge.js
 * -> fight-stats.js -> the ScoreHUB module.
 *
 * Optional tuning in window.__SCOREHUB_CONFIG__.fightStats (see DEFAULTS below).
 * The judges' cards stay the official result; these numbers never change it.
 */
(function () {
  'use strict';

  var cfg = window.__SCOREHUB_CONFIG__ || {};
  var user = cfg.fightStats || {};
  if (user.enabled === false) return;

  // ---------------------------------------------------------------------------
  // Scoring model (all numbers can be overridden from config.js)
  // ---------------------------------------------------------------------------
  var DEFAULTS = {
    weights: {
      sigLanded: 1,      // every significant strike landed
      headBonus: 0.5,    // extra for a significant strike to the head
      bodyBonus: 0.25,   // extra for a significant strike to the body
      legBonus: 0,       // extra for a significant strike to the legs
      otherLanded: 0.25, // non-significant strike landed (total - significant)
      kd: 10,            // knockdown
      tdLanded: 3,       // takedown landed
      subAtt: 3,         // submission attempt
      rev: 2,            // reversal / sweep
      ctrlPerMinute: 2,  // control time, per minute
    },
    round: {
      evenMargin: 1,      // performance gap below this = 10-10
      dominantMargin: 20, // gap at or above this (and winner >= 2x loser) = 10-8
      kdLeadFor108: 2,    // or this many more knockdowns in the round = 10-8
    },
    pollMs: 3000,
  };
  var W = Object.assign({}, DEFAULTS.weights, user.weights || {});
  var R = Object.assign({}, DEFAULTS.round, user.round || {});
  var POLL_MS = user.pollMs || DEFAULTS.pollMs;

  var FIELDS = ['kd', 'sig_landed', 'sig_attempted', 'total_landed', 'total_attempted',
    'head_landed', 'body_landed', 'leg_landed', 'distance_landed', 'clinch_landed', 'ground_landed',
    'td_landed', 'td_attempted', 'sub_att', 'rev', 'ctrl_seconds'];

  // Same deltas as public.bout_stats_record (used for the instant on-screen update).
  function deltasFor(action, target, position) {
    var d = {};
    function add(k) { d[k] = (d[k] || 0) + 1; }
    function sig() {
      ['sig_landed', 'sig_attempted', 'total_landed', 'total_attempted'].forEach(add);
      add(target.toLowerCase() + '_landed');
      add((position || 'DISTANCE').toLowerCase() + '_landed');
    }
    switch (action) {
      case 'SIG_LANDED': sig(); break;
      case 'SIG_MISSED': add('sig_attempted'); add('total_attempted'); break;
      case 'STR_LANDED': add('total_landed'); add('total_attempted'); break;
      case 'STR_MISSED': add('total_attempted'); break;
      case 'TD_LANDED': add('td_landed'); add('td_attempted'); break;
      case 'TD_MISSED': add('td_attempted'); break;
      case 'SUB_ATT': add('sub_att'); break;
      case 'REV': add('rev'); break;
      case 'KD': add('kd'); if (target) sig(); break;
    }
    return d;
  }

  function emptyRow() { var r = {}; FIELDS.forEach(function (f) { r[f] = 0; }); r.ctrl_started_at = null; return r; }

  // Control seconds including a clock that is still running.
  function ctrlNow(row, now, cap) {
    var s = row.ctrl_seconds || 0;
    if (row.ctrl_started_at) s += Math.min(cap || 1200, Math.max(0, Math.floor((now - Date.parse(row.ctrl_started_at)) / 1000)));
    return s;
  }

  function performance(r) {
    var other = Math.max(0, (r.total_landed || 0) - (r.sig_landed || 0));
    return (r.sig_landed || 0) * W.sigLanded
      + (r.head_landed || 0) * W.headBonus
      + (r.body_landed || 0) * W.bodyBonus
      + (r.leg_landed || 0) * W.legBonus
      + other * W.otherLanded
      + (r.kd || 0) * W.kd
      + (r.td_landed || 0) * W.tdLanded
      + (r.sub_att || 0) * W.subAtt
      + (r.rev || 0) * W.rev
      + ((r.ctrl_live != null ? r.ctrl_live : r.ctrl_seconds) || 0) / 60 * W.ctrlPerMinute;
  }

  // Projected 10-point must score for one round from the two performance scores.
  function roundCard(blue, red) {
    var pb = performance(blue), pr = performance(red);
    var diff = Math.abs(pb - pr);
    if (diff < R.evenMargin) return { blue: 10, red: 10, pb: pb, pr: pr };
    var blueWins = pb > pr;
    var w = blueWins ? pb : pr, l = blueWins ? pr : pb;
    var kdLead = blueWins ? (blue.kd || 0) - (red.kd || 0) : (red.kd || 0) - (blue.kd || 0);
    var loser = (diff >= R.dominantMargin && w >= 2 * l) || kdLead >= R.kdLeadFor108 ? 8 : 9;
    return { blue: blueWins ? 10 : loser, red: blueWins ? loser : 10, pb: pb, pr: pr };
  }

  // ---------------------------------------------------------------------------
  // Data: Supabase (shared WDS database) or an in-memory demo store
  // ---------------------------------------------------------------------------
  function errMsg(e) {
    if (!e) return 'Something went wrong';
    var m = e.message || String(e);
    if (e.code === '42501') return 'You are not an official on this bout.';
    if (/bout_stats|function .* does not exist|Could not find the function/i.test(m) && /exist|find/i.test(m)) {
      return 'Fight stats are not set up in the database yet (run config/migrations/002_fight_stats.sql).';
    }
    return m;
  }

  function supabaseStore(sb) {
    function must(res) { if (res.error) throw res.error; return res.data; }
    return {
      live: true,
      loadBout: async function (id) {
        var b = must(await sb.from('bouts').select('id,bout_number,bout_name,discipline,status,current_round,' +
          'total_rounds,round_duration,round_started_at,started_at,completed_at,end_round,end_time_sec,' +
          'result_type,result_status,blue_fighter_id,red_fighter_id').eq('id', id).maybeSingle());
        if (!b) throw new Error('Bout not found');
        var ids = [b.blue_fighter_id, b.red_fighter_id].filter(Boolean);
        var names = {};
        if (ids.length) {
          var fx = must(await sb.from('fighters').select('id,name,first_name,last_name,nickname').in('id', ids));
          fx.forEach(function (f) {
            var full = [f.first_name, f.last_name].filter(Boolean).join(' ').trim() || f.name || '';
            names[f.id] = full;
          });
        }
        b.blueName = names[b.blue_fighter_id] || 'Blue corner';
        b.redName = names[b.red_fighter_id] || 'Red corner';
        return b;
      },
      loadStats: async function (id) { return must(await sb.from('bout_stats').select('*').eq('bout_id', id)); },
      canRecord: async function (id) {
        var res = await sb.rpc('bout_stats_can_record', { p_bout: id });
        if (res.error) throw res.error;
        return !!res.data;
      },
      record: async function (id, round, corner, action, target, position) {
        must(await sb.rpc('bout_stats_record', { p_bout: id, p_round: round, p_corner: corner, p_action: action,
          p_target: target || null, p_position: position || null }));
      },
      undo: async function (id) { return must(await sb.rpc('bout_stats_undo', { p_bout: id })); },
      control: async function (id, round, corner, running) {
        must(await sb.rpc('bout_stats_control', { p_bout: id, p_round: round, p_corner: corner, p_running: running }));
      },
      adjust: async function (id, round, corner, seconds) {
        must(await sb.rpc('bout_stats_adjust_control', { p_bout: id, p_round: round, p_corner: corner, p_seconds: seconds }));
      },
      subscribe: function (id, onChange) {
        var ch = sb.channel('fight-stats-' + id + '-' + Math.random().toString(36).slice(2, 8))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bout_stats', filter: 'bout_id=eq.' + id }, function () { onChange('stats'); })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bouts', filter: 'id=eq.' + id }, function () { onChange('bout'); })
          .subscribe();
        return function () { try { sb.removeChannel(ch); } catch (e) { /* ignore */ } };
      },
    };
  }

  // Demo mode (no Supabase in config): the sheet works on this device only.
  function memoryStore() {
    var db = {};
    var log = [];
    function rowOf(id, round, corner) {
      var k = id + ':' + round + ':' + corner;
      if (!db[k]) db[k] = Object.assign(emptyRow(), { bout_id: id, round_number: round, corner: corner });
      return db[k];
    }
    function bump(row, d, sign) { Object.keys(d).forEach(function (k) { row[k] = Math.max(0, (row[k] || 0) + sign * d[k]); }); }
    function stop(id, round, corner) {
      var r = rowOf(id, round, corner);
      if (!r.ctrl_started_at) return;
      var secs = ctrlNow(r, Date.now(), 1200) - r.ctrl_seconds;
      r.ctrl_started_at = null;
      if (secs > 0) { bump(r, { ctrl_seconds: secs }, 1); log.push({ id: id, round: round, corner: corner, d: { ctrl_seconds: secs } }); }
    }
    var bouts = {};
    return {
      live: false,
      loadBout: async function (id) {
        if (!bouts[id]) bouts[id] = { id: id, bout_name: 'Demo bout', discipline: 'MMA', status: 'LIVE', current_round: 1,
          total_rounds: 3, round_duration: 300, round_started_at: null, blueName: 'Blue corner', redName: 'Red corner', demo: true };
        return bouts[id];
      },
      loadStats: async function (id) { return Object.keys(db).filter(function (k) { return k.indexOf(id + ':') === 0; }).map(function (k) { return Object.assign({}, db[k]); }); },
      canRecord: async function () { return true; },
      record: async function (id, round, corner, action, target, position) {
        var d = deltasFor(action, target, position);
        bump(rowOf(id, round, corner), d, 1);
        log.push({ id: id, round: round, corner: corner, d: d });
      },
      undo: async function (id) {
        for (var i = log.length - 1; i >= 0; i--) {
          if (log[i].id === id) { var e = log.splice(i, 1)[0]; bump(rowOf(id, e.round, e.corner), e.d, -1); return e; }
        }
        return null;
      },
      control: async function (id, round, corner, running) {
        Object.keys(db).forEach(function (k) {
          var r = db[k];
          if (r.bout_id === id && r.ctrl_started_at && (r.round_number !== round || (running && r.corner !== corner))) stop(id, r.round_number, r.corner);
        });
        if (running) { var r = rowOf(id, round, corner); r.ctrl_started_at = r.ctrl_started_at || new Date().toISOString(); }
        else stop(id, round, corner);
      },
      adjust: async function (id, round, corner, seconds) {
        var r = rowOf(id, round, corner);
        var d = { ctrl_seconds: Math.max(seconds, -r.ctrl_seconds) };
        bump(r, d, 1); log.push({ id: id, round: round, corner: corner, d: d });
      },
      subscribe: function () { return function () {}; },
    };
  }

  var store = null;
  function getStore() {
    if (store) return store;
    if (window.__WDS_SUPABASE__) store = supabaseStore(window.__WDS_SUPABASE__);
    else if (!cfg.supabaseUrl) store = memoryStore();
    return store;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }
  function of(a, b) { return a + ' of ' + b; }
  function num(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  // ---------------------------------------------------------------------------
  // Styles (same palette as ScoreHUB: ink / brand / blueCorner / redCorner)
  // ---------------------------------------------------------------------------
  var CSS = [
    '.fs-fab{position:fixed;right:1.25rem;bottom:1.25rem;z-index:45;display:inline-flex;align-items:center;gap:.5rem;border-radius:9999px;padding:.75rem 1.25rem;font:600 .875rem/1.25rem var(--font-sans,Inter,system-ui,sans-serif);color:#fff;background-image:linear-gradient(90deg,#0b3fd4,#1580f5 55%,#29b6ff);box-shadow:0 0 24px -4px rgba(41,182,255,.45);border:0;cursor:pointer}',
    '.fs-fab:hover{filter:brightness(1.1)}',
    '.fs-fab svg{width:18px;height:18px}',
    '.fs-overlay{position:fixed;inset:0;z-index:60;overflow-y:auto;background:#04060d;color:#e2e8f0;font-family:var(--font-sans,Inter,system-ui,sans-serif);-webkit-tap-highlight-color:transparent}',
    '.fs-wrap{max-width:80rem;margin:0 auto;padding:1rem 1rem 4rem}',
    '.fs-top{position:sticky;top:0;z-index:2;background:rgba(4,6,13,.92);backdrop-filter:blur(6px);border-bottom:1px solid #1a2640;padding:.75rem 1rem}',
    '.fs-top-in{max-width:80rem;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem}',
    '.fs-title{flex:1;min-width:12rem}',
    '.fs-title h1{font-size:1rem;font-weight:700;color:#f1f5f9;margin:0}',
    '.fs-title p{font-size:.75rem;color:#94a3b8;margin:.125rem 0 0}',
    '.fs-pill{display:inline-flex;align-items:center;gap:.375rem;border-radius:9999px;border:1px solid #1a2640;background:#0b1120;padding:.375rem .75rem;font-size:.75rem;font-weight:600;color:#cbd5e1}',
    '.fs-dot{width:.5rem;height:.5rem;border-radius:9999px;background:#64748b}',
    '.fs-dot.live{background:#10b981;box-shadow:0 0 8px #10b981}',
    '.fs-btn{display:inline-flex;align-items:center;justify-content:center;gap:.375rem;border-radius:9999px;border:1px solid #1a2640;background:#0b1120;color:#e2e8f0;padding:.5rem 1rem;font:600 .8125rem/1.25rem inherit;cursor:pointer;transition:all .15s}',
    '.fs-btn:hover{border-color:#29b6ff99;color:#fff}',
    '.fs-btn:disabled{opacity:.4;cursor:default}',
    '.fs-tabs{display:flex;flex-wrap:wrap;gap:.375rem;margin:1rem 0}',
    '.fs-tab{border-radius:9999px;border:1px solid #1a2640;background:#0b1120;color:#94a3b8;padding:.375rem .875rem;font:600 .75rem/1rem inherit;cursor:pointer}',
    '.fs-tab.on{color:#fff;border-color:transparent;background-image:linear-gradient(90deg,#0b3fd4,#1580f5 55%,#29b6ff)}',
    '.fs-tab .now{margin-left:.25rem;color:#6ee7b7}',
    '.fs-grid{display:grid;gap:1rem}',
    '@media(min-width:720px){.fs-grid{grid-template-columns:1fr 1fr}}',
    '.fs-corner{border-radius:1rem;border:1px solid;padding:1rem}',
    '.fs-corner.BLUE{background:#0d1b3d66;border-color:#2a4d9e}',
    '.fs-corner.RED{background:#2b0d1866;border-color:#8e2942}',
    '.fs-corner-h{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.75rem}',
    '.fs-corner-h small{display:block;font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700}',
    '.BLUE .fs-corner-h small{color:#7fb4ff}.RED .fs-corner-h small{color:#ff8fa6}',
    '.fs-corner-h strong{display:block;font-size:1.125rem;color:#fff;margin-top:.125rem}',
    '.fs-perf{text-align:right}',
    '.fs-perf b{display:block;font-size:1.75rem;line-height:1;font-weight:900;color:#fff;font-variant-numeric:tabular-nums}',
    '.fs-perf span{font-size:.6875rem;color:#94a3b8}',
    '.fs-sec{margin-top:.75rem}',
    '.fs-sec h3{font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;font-weight:700;margin:0 0 .5rem}',
    '.fs-chips{display:flex;gap:.375rem;margin-bottom:.5rem;flex-wrap:wrap}',
    '.fs-chip{flex:1;min-width:4.5rem;border-radius:9999px;border:1px solid #1a2640;background:#0b1120;color:#cbd5e1;padding:.5rem .5rem;font:600 .75rem/1rem inherit;cursor:pointer;user-select:none}',
    '.fs-chip.on{background:#e2e8f0;color:#04060d;border-color:#e2e8f0}',
    '.fs-pad{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem}',
    '.fs-pad.three{grid-template-columns:repeat(3,1fr)}',
    '.fs-key{position:relative;min-height:64px;border-radius:.875rem;border:1px solid #1a2640;background:#070b16;color:#e2e8f0;font:700 .875rem/1.1 inherit;cursor:pointer;user-select:none;touch-action:manipulation;transition:transform .06s,border-color .15s;padding:.5rem}',
    '.fs-key:active{transform:scale(.96)}',
    '.fs-key small{display:block;font-weight:500;font-size:.6875rem;color:#94a3b8;margin-top:.25rem}',
    '.fs-key .ct{position:absolute;top:.375rem;right:.5rem;font-size:.6875rem;font-weight:700;color:#94a3b8;font-variant-numeric:tabular-nums}',
    '.BLUE .fs-key.hit{border-color:#2a4d9e;background:#0d1b3d}.RED .fs-key.hit{border-color:#8e2942;background:#2b0d18}',
    '.fs-key.kd{border-color:#f59e0b66;background:#f59e0b1a;color:#fde68a}',
    '.fs-key:disabled{opacity:.35;cursor:default;transform:none}',
    '.fs-ctrl{display:flex;align-items:center;gap:.5rem;margin-top:.5rem}',
    '.fs-ctrl .go{flex:1;min-height:56px;border-radius:.875rem;border:1px solid #1a2640;background:#070b16;color:#e2e8f0;font:700 .875rem inherit;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:0 1rem}',
    '.fs-ctrl .go.on{background:#10b981;color:#04060d;border-color:#10b981}',
    '.fs-ctrl .go b{font-size:1.25rem;font-variant-numeric:tabular-nums}',
    '.fs-ctrl .adj{width:3.25rem;min-height:56px;border-radius:.875rem;border:1px solid #1a2640;background:#0b1120;color:#cbd5e1;font:600 .75rem inherit;cursor:pointer}',
    '.fs-card{border-radius:1rem;border:1px solid #1a2640;background:#070b16;padding:1rem;margin-top:1rem;box-shadow:0 1px 2px rgba(0,0,0,.5),0 8px 24px -12px rgba(0,0,0,.8)}',
    '.fs-card h2{font-size:.875rem;font-weight:700;color:#f1f5f9;margin:0 0 .75rem}',
    '.fs-table{width:100%;border-collapse:separate;border-spacing:0 .25rem;font-size:.8125rem}',
    '.fs-table th{font-weight:700;padding:.5rem;font-size:.75rem}',
    '.fs-table th.b{color:#7fb4ff;text-align:right}.fs-table th.r{color:#ff8fa6;text-align:left}',
    '.fs-table td{padding:.5rem .625rem;background:#0b1120;font-variant-numeric:tabular-nums}',
    '.fs-table td.b{text-align:right;border-radius:9999px 0 0 9999px;color:#e2e8f0}',
    '.fs-table td.r{text-align:left;border-radius:0 9999px 9999px 0;color:#e2e8f0}',
    '.fs-table td.l{text-align:center;color:#94a3b8;font-weight:600;font-size:.75rem;letter-spacing:.04em;white-space:nowrap}',
    '.fs-table td.lead{color:#fff;font-weight:800}',
    '.fs-table tr.grp td{background:none;padding:.875rem 0 .25rem;text-align:center;font-size:.6875rem;letter-spacing:.14em;text-transform:uppercase;color:#29b6ff;font-weight:800}',
    '.fs-score{display:grid;gap:.75rem}',
    '@media(min-width:700px){.fs-score{grid-template-columns:1fr 1fr}}',
    '.fs-big{display:flex;align-items:center;justify-content:center;gap:1.25rem;padding:.75rem;border-radius:1rem;background:#0b1120}',
    '.fs-big b{font-size:2.25rem;font-weight:900;font-variant-numeric:tabular-nums}',
    '.fs-big .b{color:#7fb4ff}.fs-big .r{color:#ff8fa6}.fs-big i{color:#475569;font-style:normal}',
    '.fs-note{font-size:.75rem;color:#64748b;margin-top:.75rem;line-height:1.5}',
    '.fs-toast{position:fixed;left:50%;bottom:1.25rem;transform:translateX(-50%);z-index:70;max-width:90vw;border-radius:9999px;padding:.625rem 1.125rem;font-size:.8125rem;font-weight:600;background:#c31f43;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.6)}',
    '.fs-toast.ok{background:#0b1120;border:1px solid #1a2640;color:#e2e8f0}',
    '.fs-banner{border-radius:1rem;border:1px solid #f59e0b66;background:#f59e0b1a;color:#fde68a;padding:.75rem 1rem;font-size:.8125rem;margin-top:1rem}',
    '.fs-empty{padding:4rem 1rem;text-align:center;color:#94a3b8}',
  ].join('\n');

  function injectCss() {
    if (document.getElementById('fs-css')) return;
    var s = document.createElement('style');
    s.id = 'fs-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>';

  // ---------------------------------------------------------------------------
  // The sheet
  // ---------------------------------------------------------------------------
  var S = null; // state of the open sheet

  function rowFor(round, corner) {
    var k = round + ':' + corner;
    if (!S.rows[k]) S.rows[k] = Object.assign(emptyRow(), { round_number: round, corner: corner });
    return S.rows[k];
  }

  function cap() { return (S.bout && S.bout.round_duration) || 1200; }

  // Rounds that count toward the stats card.
  function scoredRounds() {
    var b = S.bout, last;
    if (b.status === 'COMPLETED') last = b.end_round || b.current_round || b.total_rounds;
    else last = Math.max(1, b.current_round || 1);
    var out = [];
    for (var i = 1; i <= Math.min(last, b.total_rounds); i++) out.push(i);
    // a round with stats is shown even if the clock has not reached it (staff entry)
    Object.keys(S.rows).forEach(function (k) {
      var n = +k.split(':')[0];
      if (out.indexOf(n) < 0 && n <= b.total_rounds && FIELDS.some(function (f) { return S.rows[k][f]; })) out.push(n);
    });
    return out.sort(function (a, c) { return a - c; });
  }

  function view(round, corner, now) {
    var src = round === 'ALL' ? scoredRounds().map(function (r) { return rowFor(r, corner); }) : [rowFor(round, corner)];
    var t = emptyRow();
    t.ctrl_live = 0;
    t.running = false;
    src.forEach(function (r) {
      FIELDS.forEach(function (f) { t[f] += r[f] || 0; });
      t.ctrl_live += ctrlNow(r, now, cap());
      if (r.ctrl_started_at) t.running = true;
    });
    return t;
  }

  function fightSeconds(now) {
    var b = S.bout, dur = b.round_duration || 300;
    if (b.status === 'COMPLETED') {
      var er = b.end_round || b.current_round || b.total_rounds;
      return (er - 1) * dur + (b.end_time_sec != null ? b.end_time_sec : dur);
    }
    var cr = Math.max(1, b.current_round || 1);
    var inRound = b.round_started_at ? Math.min(dur, Math.max(0, (now - Date.parse(b.round_started_at)) / 1000)) : 0;
    return (cr - 1) * dur + inRound;
  }

  function roundSeconds(r, now) {
    var b = S.bout, dur = b.round_duration || 300;
    if (b.status === 'COMPLETED') {
      var er = b.end_round || b.current_round || b.total_rounds;
      if (r < er) return dur;
      if (r === er) return b.end_time_sec != null ? b.end_time_sec : dur;
      return 0;
    }
    var cr = Math.max(1, b.current_round || 1);
    if (r < cr) return dur;
    if (r > cr) return 0;
    return b.round_started_at ? Math.min(dur, Math.max(0, (now - Date.parse(b.round_started_at)) / 1000)) : 0;
  }

  // bout_stats_can_record already encodes who may record and when.
  function canTap() { return !!(S.canRecord && S.bout); }

  function cornerPanel(corner, now) {
    var b = S.bout;
    var round = S.entryRound;
    var r = rowFor(round, corner);
    var total = view('ALL', corner, now);
    var sel = S.sel[corner];
    var disc = b.discipline || 'MMA';
    var striking = disc !== 'BJJ';
    var grappling = disc !== 'K1';
    var dis = canTap() ? '' : ' disabled';
    var name = corner === 'BLUE' ? b.blueName : b.redName;
    var ctrlSecs = ctrlNow(r, now, cap());
    var html = '<section class="fs-corner ' + corner + '">' +
      '<div class="fs-corner-h"><div><small>' + (corner === 'BLUE' ? 'Blue corner' : 'Red corner') + '</small><strong>' + esc(name) + '</strong></div>' +
      '<div class="fs-perf"><b data-perf="' + corner + '">' + num(performance(total)) + '</b><span>performance score</span></div></div>';

    if (striking) {
      html += '<div class="fs-sec"><h3>Striking · round ' + round + '</h3>' +
        '<div class="fs-chips">' + ['HEAD', 'BODY', 'LEG'].map(function (t) {
          return '<button type="button" class="fs-chip' + (sel.target === t ? ' on' : '') + '" data-sel="target" data-corner="' + corner + '" data-val="' + t + '">' + t.charAt(0) + t.slice(1).toLowerCase() + '</button>';
        }).join('') + '</div>' +
        '<div class="fs-chips">' + ['DISTANCE', 'CLINCH', 'GROUND'].map(function (t) {
          return '<button type="button" class="fs-chip' + (sel.position === t ? ' on' : '') + '" data-sel="position" data-corner="' + corner + '" data-val="' + t + '">' + t.charAt(0) + t.slice(1).toLowerCase() + '</button>';
        }).join('') + '</div>' +
        '<div class="fs-pad">' +
        key(corner, 'SIG_LANDED', 'Sig. strike landed', sel.target.toLowerCase() + ' · ' + sel.position.toLowerCase(), r.sig_landed, true, dis) +
        key(corner, 'SIG_MISSED', 'Sig. strike missed', 'attempt', r.sig_attempted - r.sig_landed, false, dis) +
        key(corner, 'STR_LANDED', 'Other strike landed', 'non-significant', Math.max(0, r.total_landed - r.sig_landed), false, dis) +
        key(corner, 'STR_MISSED', 'Other strike missed', 'non-significant', Math.max(0, (r.total_attempted - r.total_landed) - (r.sig_attempted - r.sig_landed)), false, dis) +
        '</div></div>';
    }
    html += '<div class="fs-sec"><h3>' + (grappling ? 'Grappling &amp; knockdowns' : 'Knockdowns') + '</h3><div class="fs-pad three">';
    if (striking) html += key(corner, 'KD', 'Knockdown', 'counts as sig. ' + sel.target.toLowerCase(), r.kd, false, dis, 'kd');
    if (grappling) {
      html += key(corner, 'TD_LANDED', 'Takedown', 'landed', r.td_landed, true, dis) +
        key(corner, 'TD_MISSED', 'Takedown', 'missed', r.td_attempted - r.td_landed, false, dis) +
        key(corner, 'SUB_ATT', 'Sub. attempt', '', r.sub_att, false, dis) +
        key(corner, 'REV', 'Reversal', '', r.rev, false, dis);
    }
    html += '</div>';
    if (grappling) {
      html += '<div class="fs-ctrl">' +
        '<button type="button" class="adj" data-adj="-10" data-corner="' + corner + '"' + dis + '>−10s</button>' +
        '<button type="button" class="go' + (r.ctrl_started_at ? ' on' : '') + '" data-ctrl="' + corner + '"' + dis + '>' +
        '<span>' + (r.ctrl_started_at ? 'Stop control' : 'Start control') + '</span><b data-ctrl-live="' + corner + '">' + clock(ctrlSecs) + '</b></button>' +
        '<button type="button" class="adj" data-adj="10" data-corner="' + corner + '"' + dis + '>+10s</button></div>';
    }
    html += '</div></section>';
    return html;
  }

  function key(corner, action, label, sub, count, hit, dis, extra) {
    return '<button type="button" class="fs-key' + (hit ? ' hit' : '') + (extra ? ' ' + extra : '') + '" data-act="' + action + '" data-corner="' + corner + '"' + dis + '>' +
      '<span class="ct">' + (count || 0) + '</span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
  }

  function statsTable(now) {
    var round = S.viewRound;
    var B = view(round, 'BLUE', now), Rr = view(round, 'RED', now);
    var secs = round === 'ALL' ? fightSeconds(now) : roundSeconds(round, now);
    function line(label, bv, rv, bn, rn) {
      var bl = bn != null && rn != null && bn > rn, rl = bn != null && rn != null && rn > bn;
      return '<tr><td class="b' + (bl ? ' lead' : '') + '">' + bv + '</td><td class="l">' + label + '</td><td class="r' + (rl ? ' lead' : '') + '">' + rv + '</td></tr>';
    }
    function grp(t) { return '<tr class="grp"><td colspan="3">' + t + '</td></tr>'; }
    function p(a, b2) { return b2 ? a / b2 : -1; }
    var h = '<table class="fs-table"><thead><tr><th class="b">' + esc(S.bout.blueName) + '</th><th></th><th class="r">' + esc(S.bout.redName) + '</th></tr></thead><tbody>';
    h += grp('1 · Striking statistics');
    h += line('SIG. STR.', of(B.sig_landed, B.sig_attempted), of(Rr.sig_landed, Rr.sig_attempted), B.sig_landed, Rr.sig_landed);
    h += line('SIG. STR. %', pct(B.sig_landed, B.sig_attempted), pct(Rr.sig_landed, Rr.sig_attempted), p(B.sig_landed, B.sig_attempted), p(Rr.sig_landed, Rr.sig_attempted));
    h += line('TOTAL STR.', of(B.total_landed, B.total_attempted), of(Rr.total_landed, Rr.total_attempted), B.total_landed, Rr.total_landed);
    h += line('HEAD', B.head_landed, Rr.head_landed, B.head_landed, Rr.head_landed);
    h += line('BODY', B.body_landed, Rr.body_landed, B.body_landed, Rr.body_landed);
    h += line('LEG', B.leg_landed, Rr.leg_landed, B.leg_landed, Rr.leg_landed);
    h += line('DISTANCE', B.distance_landed, Rr.distance_landed, B.distance_landed, Rr.distance_landed);
    h += line('CLINCH', B.clinch_landed, Rr.clinch_landed, B.clinch_landed, Rr.clinch_landed);
    h += line('GROUND', B.ground_landed, Rr.ground_landed, B.ground_landed, Rr.ground_landed);
    h += grp('2 · Grappling statistics');
    h += line('TD', of(B.td_landed, B.td_attempted), of(Rr.td_landed, Rr.td_attempted), B.td_landed, Rr.td_landed);
    h += line('TD %', pct(B.td_landed, B.td_attempted), pct(Rr.td_landed, Rr.td_attempted), p(B.td_landed, B.td_attempted), p(Rr.td_landed, Rr.td_attempted));
    h += line('SUB. ATT', B.sub_att, Rr.sub_att, B.sub_att, Rr.sub_att);
    h += line('REV', B.rev, Rr.rev, B.rev, Rr.rev);
    h += line('CTRL', '<span data-tctrl="BLUE">' + clock(B.ctrl_live) + '</span>', '<span data-tctrl="RED">' + clock(Rr.ctrl_live) + '</span>', B.ctrl_live, Rr.ctrl_live);
    h += grp('3 · Fight performance statistics');
    h += line('Knockdowns (KD)', B.kd, Rr.kd, B.kd, Rr.kd);
    h += line('Sig. strikes landed', B.sig_landed, Rr.sig_landed, B.sig_landed, Rr.sig_landed);
    h += line('Sig. strikes attempted', B.sig_attempted, Rr.sig_attempted);
    h += line('Total strikes landed', B.total_landed, Rr.total_landed, B.total_landed, Rr.total_landed);
    h += line('Total strikes attempted', B.total_attempted, Rr.total_attempted);
    h += line('Takedowns landed', B.td_landed, Rr.td_landed, B.td_landed, Rr.td_landed);
    h += line('Takedowns attempted', B.td_attempted, Rr.td_attempted);
    h += line('Submission attempts', B.sub_att, Rr.sub_att, B.sub_att, Rr.sub_att);
    h += '<tr><td class="b" colspan="3" style="text-align:center;border-radius:9999px"><span class="l" style="color:#94a3b8;font-weight:600;font-size:.75rem">FIGHT DURATION</span>&nbsp;&nbsp;<b data-dur>' + clock(secs) + '</b></td></tr>';
    h += line('Control time', clock(B.ctrl_live), clock(Rr.ctrl_live), B.ctrl_live, Rr.ctrl_live);
    h += '</tbody></table>';
    return h;
  }

  function scoringCard(now) {
    var rounds = scoredRounds();
    var tb = 0, tr = 0, pbT = 0, prT = 0;
    var rows = rounds.map(function (r) {
      var b = view(r, 'BLUE', now), rd = view(r, 'RED', now);
      var c = roundCard(b, rd);
      tb += c.blue; tr += c.red; pbT += c.pb; prT += c.pr;
      return '<tr><td class="b">' + num(c.pb) + ' &nbsp;<b>' + c.blue + '</b></td><td class="l">ROUND ' + r + '</td><td class="r"><b>' + c.red + '</b>&nbsp; ' + num(c.pr) + '</td></tr>';
    }).join('');
    var leader = pbT === prT ? 'Even on the stats' : (pbT > prT ? esc(S.bout.blueName) : esc(S.bout.redName)) + ' leads on the stats';
    return '<div class="fs-score">' +
      '<div><div class="fs-big"><b class="b">' + tb + '</b><i>—</i><b class="r">' + tr + '</b></div>' +
      '<p class="fs-note" style="text-align:center;margin-top:.5rem">Projected 10-point card from the stats · ' + leader + '</p></div>' +
      '<div><table class="fs-table"><thead><tr><th class="b">Perf · card</th><th></th><th class="r">card · Perf</th></tr></thead><tbody>' + rows +
      '<tr><td class="b lead">' + num(pbT) + '</td><td class="l">TOTAL PERFORMANCE</td><td class="r lead">' + num(prT) + '</td></tr></tbody></table></div></div>' +
      '<p class="fs-note">Performance score = sig. strike ×' + W.sigLanded + ' (+' + W.headBonus + ' head, +' + W.bodyBonus + ' body' + (W.legBonus ? ', +' + W.legBonus + ' leg' : '') + ') · other strike ×' + W.otherLanded +
      ' · knockdown ×' + W.kd + ' · takedown ×' + W.tdLanded + ' · sub. attempt ×' + W.subAtt + ' · reversal ×' + W.rev + ' · control ×' + W.ctrlPerMinute + '/min. ' +
      'A round goes 10-10 inside ' + R.evenMargin + ' point, 10-8 for a gap of ' + R.dominantMargin + '+ with double the score or ' + R.kdLeadFor108 + '+ more knockdowns. ' +
      'The judges’ cards remain the official result.</p>';
  }

  function render() {
    if (!S || !S.root) return;
    var now = Date.now();
    if (S.error && !S.bout) {
      S.root.innerHTML = topBar() + '<div class="fs-wrap"><div class="fs-empty">' + esc(S.error) + '</div></div>';
      return;
    }
    if (!S.bout) {
      S.root.innerHTML = topBar() + '<div class="fs-wrap"><div class="fs-empty">Loading fight stats…</div></div>';
      return;
    }
    var b = S.bout;
    var tabs = [];
    for (var i = 1; i <= b.total_rounds; i++) tabs.push(i);
    var banner = '';
    if (S.setupError) banner = '<div class="fs-banner">' + esc(S.setupError) + '</div>';
    else if (!S.canRecord && b.status === 'LIVE') banner = '<div class="fs-banner">View only — fight stats are recorded by the bout’s referee, its seated judges, or management.</div>';
    else if (b.status === 'SCHEDULED') banner = '<div class="fs-banner">This bout has not started. Stats recording opens when the first round starts.</div>';
    else if (b.status === 'COMPLETED' && !S.canRecord) banner = '';
    else if (b.status === 'COMPLETED' && S.canRecord) banner = '<div class="fs-banner">This bout is finished. As management you can still correct the stats until the result is finalized.</div>';
    if (store && !store.live) banner += '<div class="fs-banner">Demo mode — stats are kept on this device only and clear on refresh.</div>';

    var entryTabs = '';
    if (canTap()) {
      entryTabs = '<div class="fs-tabs" aria-label="Recording round"><span class="fs-pill">Recording</span>' + tabs.map(function (n) {
        var allowed = n <= Math.max(1, b.current_round || 1) || S.staff;
        return '<button type="button" class="fs-tab' + (S.entryRound === n ? ' on' : '') + '" data-entry="' + n + '"' + (allowed ? '' : ' disabled') + '>Round ' + n +
          (n === b.current_round && b.status === 'LIVE' ? '<span class="now">●</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    var panels = canTap() ? '<div class="fs-grid">' + cornerPanel('BLUE', now) + cornerPanel('RED', now) + '</div>' : '';

    var viewTabs = '<div class="fs-tabs" aria-label="Show stats for">' +
      '<button type="button" class="fs-tab' + (S.viewRound === 'ALL' ? ' on' : '') + '" data-view="ALL">Whole fight</button>' +
      tabs.map(function (n) { return '<button type="button" class="fs-tab' + (S.viewRound === n ? ' on' : '') + '" data-view="' + n + '">Round ' + n + '</button>'; }).join('') + '</div>';

    var scrollY = S.root.scrollTop;
    S.root.innerHTML = topBar() + '<div class="fs-wrap">' + banner + entryTabs + panels +
      '<div class="fs-card"><h2>Fight stats</h2>' + viewTabs + statsTable(now) + '</div>' +
      '<div class="fs-card"><h2>Stat-based scoring</h2>' + scoringCard(now) + '</div>' +
      '</div>';
    S.root.scrollTop = scrollY;
  }

  function topBar() {
    var b = S.bout;
    var status = !b ? '' : b.status === 'COMPLETED' ? 'Finished' : b.round_started_at ? 'Round ' + b.current_round + ' live' : b.status === 'LIVE' ? 'Between rounds · R' + Math.max(1, b.current_round) : 'Not started';
    var sub = b ? [b.bout_number ? 'Bout ' + b.bout_number : '', b.bout_name || '', esc(b.blueName) + ' vs ' + esc(b.redName)].filter(Boolean).join(' · ') : '';
    return '<div class="fs-top"><div class="fs-top-in">' +
      '<div class="fs-title"><h1>Fight Stats Sheet</h1><p>' + sub + '</p></div>' +
      (b ? '<span class="fs-pill"><span class="fs-dot' + (b.round_started_at ? ' live' : '') + '"></span>' + status + '</span>' : '') +
      (S.canRecord && b ? '<button type="button" class="fs-btn" data-undo' + (S.busyUndo ? ' disabled' : '') + '>Undo last</button>' : '') +
      '<button type="button" class="fs-btn" data-close>Close</button></div></div>';
  }

  // Updates only the ticking numbers (control clocks, duration) between renders.
  function tick() {
    if (!S || !S.bout || !S.root) return;
    var now = Date.now();
    var running = S.bout.round_started_at || Object.keys(S.rows).some(function (k) { return S.rows[k].ctrl_started_at; });
    if (!running) return;
    ['BLUE', 'RED'].forEach(function (c) {
      var el = S.root.querySelector('[data-ctrl-live="' + c + '"]');
      if (el) el.textContent = clock(ctrlNow(rowFor(S.entryRound, c), now, cap()));
      var t = S.root.querySelector('[data-tctrl="' + c + '"]');
      if (t) t.textContent = clock(view(S.viewRound, c, now).ctrl_live);
      var p = S.root.querySelector('[data-perf="' + c + '"]');
      if (p) p.textContent = num(performance(view('ALL', c, now)));
    });
    var d = S.root.querySelector('[data-dur]');
    if (d) d.textContent = clock(S.viewRound === 'ALL' ? fightSeconds(now) : roundSeconds(S.viewRound, now));
    // stop a running control clock automatically when the round clock stops or runs out
    var b = S.bout;
    var clockOff = !b.round_started_at || (now - Date.parse(b.round_started_at)) / 1000 >= (b.round_duration || 300);
    if (S.canRecord && clockOff && b.status === 'LIVE' && !S.autoStopping && S.pending === 0) {
      var k = Object.keys(S.rows).find(function (x) { return S.rows[x].ctrl_started_at; });
      if (k) {
        S.autoStopping = true;
        var parts = k.split(':');
        call(function () { return store.control(S.boutId, +parts[0], parts[1], false); }).then(function () { S.autoStopping = false; });
      }
    }
  }

  function toast(msg, ok) {
    var t = document.createElement('div');
    t.className = 'fs-toast' + (ok ? ' ok' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ok ? 1600 : 4000);
  }

  // Runs a write; while any write is in flight, server snapshots are not applied
  // (so a quick double tap never flickers back). Reloads when the last one lands.
  async function call(fn) {
    S.pending++;
    try { await fn(); }
    catch (e) { console.warn('[fight-stats]', e); toast(errMsg(e)); }
    finally {
      S.pending--;
      if (S.pending === 0) await refresh(false);
    }
  }

  function bumpLocal(round, corner, d, sign) {
    var r = rowFor(round, corner);
    Object.keys(d).forEach(function (k) { r[k] = Math.max(0, (r[k] || 0) + sign * d[k]); });
  }

  async function refresh(withBout) {
    if (!S) return;
    var id = S.boutId;
    try {
      var jobs = [store.loadStats(id)];
      if (withBout) jobs.push(store.loadBout(id));
      var res = await Promise.all(jobs);
      if (!S || S.boutId !== id) return;
      if (withBout) applyBout(res[1]);
      if (S.pending === 0) {
        var rows = {};
        res[0].forEach(function (r) { rows[r.round_number + ':' + r.corner] = Object.assign(emptyRow(), r); });
        S.rows = rows;
      }
      S.setupError = null;
    } catch (e) {
      var m = errMsg(e);
      if (/not set up/.test(m)) S.setupError = m; else if (!S.bout) S.error = m;
      console.warn('[fight-stats] refresh', e);
    }
    render();
  }

  function applyBout(b) {
    var prev = S.bout;
    S.bout = b;
    var cr = Math.max(1, b.current_round || 1);
    // the bout went live / finished while the sheet was open: ask again who may record
    if (prev && prev.status !== b.status) {
      store.canRecord(S.boutId).then(function (ok) {
        if (!S) return;
        S.canRecord = ok; S.staff = ok && b.status !== 'LIVE'; render();
      }).catch(function () { /* keep the previous answer */ });
    }
    // follow the live round unless the recorder picked another one by hand
    if (!S.entryPinned || !prev || b.current_round !== prev.current_round) { S.entryRound = Math.min(cr, b.total_rounds); S.entryPinned = false; }
    if (S.entryRound > b.total_rounds) S.entryRound = b.total_rounds;
  }

  function onClick(ev) {
    var el = ev.target.closest('button');
    if (!el || !S || el.disabled) return;
    var corner = el.getAttribute('data-corner');
    if (el.hasAttribute('data-close')) return close();
    if (el.hasAttribute('data-undo')) {
      S.busyUndo = true; render();
      return call(async function () {
        var e = await store.undo(S.boutId);
        toast(e ? 'Undid ' + String(e.action || 'last tap').replace(/_/g, ' ').toLowerCase() + (e.corner ? ' (' + e.corner.toLowerCase() + ')' : '') : 'Nothing to undo', true);
      }).then(function () { S.busyUndo = false; render(); });
    }
    if (el.hasAttribute('data-sel')) {
      S.sel[corner][el.getAttribute('data-sel')] = el.getAttribute('data-val');
      return render();
    }
    if (el.hasAttribute('data-entry')) { S.entryRound = +el.getAttribute('data-entry'); S.entryPinned = true; return render(); }
    if (el.hasAttribute('data-view')) { var v = el.getAttribute('data-view'); S.viewRound = v === 'ALL' ? 'ALL' : +v; return render(); }
    var round = S.entryRound;
    if (el.hasAttribute('data-act')) {
      var act = el.getAttribute('data-act');
      var sel = S.sel[corner];
      var needsTarget = act === 'SIG_LANDED' || act === 'KD';
      var target = needsTarget ? sel.target : null, position = needsTarget ? sel.position : null;
      bumpLocal(round, corner, deltasFor(act, target, position), 1);
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
      render();
      return call(function () { return store.record(S.boutId, round, corner, act, target, position); });
    }
    if (el.hasAttribute('data-ctrl')) {
      var c = el.getAttribute('data-ctrl');
      var row = rowFor(round, c);
      var running = !row.ctrl_started_at;
      var nowIso = new Date().toISOString();
      // instant feedback: only one corner can be in control
      Object.keys(S.rows).forEach(function (k) {
        var r = S.rows[k];
        if (r.ctrl_started_at && (r !== row || !running)) { r.ctrl_seconds = ctrlNow(r, Date.now(), cap()); r.ctrl_started_at = null; }
      });
      if (running) row.ctrl_started_at = nowIso;
      render();
      return call(function () { return store.control(S.boutId, round, c, running); });
    }
    if (el.hasAttribute('data-adj')) {
      var secs = +el.getAttribute('data-adj');
      var rr = rowFor(round, corner);
      bumpLocal(round, corner, { ctrl_seconds: Math.max(secs, -rr.ctrl_seconds) }, 1);
      render();
      return call(function () { return store.adjust(S.boutId, round, corner, secs); });
    }
  }

  function onKey(ev) { if (ev.key === 'Escape' && S) close(); }

  async function open(boutId) {
    injectCss();
    if (!getStore()) { toast('Fight stats need the WDS database connection (supabase-bridge.js).'); return; }
    if (S) close();
    var root = document.createElement('div');
    root.className = 'fs-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Fight Stats Sheet');
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';
    S = {
      boutId: boutId, root: root, bout: null, rows: {}, pending: 0, canRecord: false, staff: false,
      entryRound: 1, entryPinned: false, viewRound: 'ALL', error: null, setupError: null,
      sel: { BLUE: { target: 'HEAD', position: 'DISTANCE' }, RED: { target: 'HEAD', position: 'DISTANCE' } },
    };
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    render();
    try {
      applyBout(await store.loadBout(boutId));
    } catch (e) {
      S.error = errMsg(e); render(); return;
    }
    try { S.canRecord = await store.canRecord(boutId); }
    catch (e) { S.canRecord = false; var m = errMsg(e); if (/not set up/.test(m)) S.setupError = m; }
    S.staff = S.canRecord && S.bout.status !== 'LIVE';      // only staff may record outside a live bout
    await refresh(false);
    var id = boutId;
    var queued = null;
    S.unsub = store.subscribe(boutId, function (what) {
      clearTimeout(queued);
      queued = setTimeout(function () { if (S && S.boutId === id) refresh(what === 'bout'); }, 120);
    });
    S.poll = setInterval(function () { if (S && S.pending === 0) refresh(true); }, POLL_MS);
    S.ticker = setInterval(tick, 250);
  }

  function close() {
    if (!S) return;
    clearInterval(S.poll); clearInterval(S.ticker);
    if (S.unsub) S.unsub();
    S.root.removeEventListener('click', onClick);
    S.root.remove();
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    S = null;
  }

  // ---------------------------------------------------------------------------
  // "Fight Stats" button on the Memory Sheet and Scoreboard pages
  // ---------------------------------------------------------------------------
  var ROUTE = /\/bouts\/([^/]+)\/(score|scoreboard)\/?$/;
  var fab = null;

  // ScoreHUB uses a hash router on GitHub Pages (#/bouts/:id/score); plain paths also work.
  function currentBoutId() {
    var route = (location.hash || '').replace(/^#/, '').split('?')[0];
    var m = route.match(ROUTE) || location.pathname.match(ROUTE);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function syncButton() {
    var id = currentBoutId();
    if (!id) {
      if (fab) { fab.remove(); fab = null; document.body.style.paddingBottom = ''; }
      if (S) close();
      return;
    }
    if (S && S.boutId !== id) close();
    if (!fab) {
      injectCss();
      fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'fs-fab';
      fab.innerHTML = ICON + '<span>Fight Stats</span>';
      fab.addEventListener('click', function () { var b = currentBoutId(); if (b) open(b); });
    }
    if (!fab.isConnected) {
      document.body.appendChild(fab);
      document.body.style.paddingBottom = '5rem';   // keep the page's own bottom buttons reachable
    }
    fab.setAttribute('data-bout', id);
  }

  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(syncButton, 0); return r; };
  });
  window.addEventListener('popstate', function () { setTimeout(syncButton, 0); });
  window.addEventListener('hashchange', function () { setTimeout(syncButton, 0); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButton);
  else syncButton();

  // Small API for support / other scripts: ScoreHUBFightStats.open('<bout id>')
  window.ScoreHUBFightStats = {
    open: open, close: close, performance: performance, roundCard: roundCard,
    weights: W, rules: R,
  };
})();
