#!/usr/bin/env node
/**
 * Sync ScoreHub's event data from wdsmma.com.
 *
 *   node tools/sync-wds.mjs            # update tools/wds-source.mjs + roster
 *   node tools/sync-wds.mjs --dry-run  # report what would change, write nothing
 *   node tools/sync-wds.mjs --json     # machine-readable diff
 *
 * WHAT IT CAN AND CANNOT READ
 * ---------------------------
 * wdsmma.com is static HTML, so the events index and the fight-card pages
 * under /pages/ parse reliably. Two things do not:
 *
 *   - /pages/event.html?e=<slug> renders its card with JavaScript
 *   - warriorsdreamseries.com (where past results live) is fully client-rendered
 *
 * Fetching either returns a shell with no data in it. This tool reports those
 * as "card unavailable" and leaves the event's bouts untouched rather than
 * wiping a card that was entered by hand. It never invents data.
 *
 * THE ROBUST ALTERNATIVE
 * ----------------------
 * Scraping breaks whenever the markup changes. If wdsmma.com publishes a small
 * JSON feed, point FEED_URL at it and this tool uses that instead, skipping
 * all HTML parsing. docs/SYNC.md specifies the format.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, 'wds-source.mjs');

const ORIGIN = process.env.WDS_ORIGIN || 'https://wdsmma.com';
const EVENTS_URL = `${ORIGIN}/pages/events.html`;
const FEED_URL = process.env.WDS_FEED_URL || '';

const argv = new Set(process.argv.slice(2));
const DRY = argv.has('--dry-run');
const AS_JSON = argv.has('--json');

const log = (...a) => { if (!AS_JSON) console.log(...a); };

/* ------------------------------------------------------------------ *
 * fetching
 * ------------------------------------------------------------------ */

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ScoreHub-sync/1.0 (+https://github.com/candies-studios/scoreHUB)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/* ------------------------------------------------------------------ *
 * parsing helpers
 *
 * Deliberately tag-shape based rather than class-name based: class names are
 * the first thing a redesign changes, while "an <img> inside the card whose
 * src points at /assets/images/<event>/" survives restyling.
 * ------------------------------------------------------------------ */

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, '’');
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim();

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** "24–25 October, 2026" or "12 December, 2026" -> "2026-12-12" (first day). */
export function parseEventDate(text) {
  const m = clean(text).match(/(\d{1,2})\s*(?:[–—-]\s*\d{1,2})?\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${String(m[1]).padStart(2, '0')}`;
}

/** "8:00 AM" / "5 PM onwards" -> "08:00" / "17:00" */
export function parseEventTime(text) {
  const m = clean(text).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}

/** Pull every <a href> with its inner text and its position in the document. */
export function links(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ href: decode(m[1]), text: clean(m[2]), index: m.index });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * events index
 * ------------------------------------------------------------------ */

export function parseEventsIndex(html) {
  const found = [];
  // Every event links to its own card or results page; use that as the anchor.
  for (const { href, text, index } of links(html)) {
    const isCard = /\/pages\/(wds-|event\.html)/i.test(href);
    const isResult = /warriorsdreamseries\.com\//i.test(href);
    if (!isCard && !isResult) continue;

    /**
     * The event's own heading is the last one before this link, and its
     * details are the text BETWEEN that heading and the link.
     *
     * Reading a fixed-size window backwards instead would spill into the
     * previous event and pick up its date — which is exactly what happened
     * before, silently giving one event another's date.
     */
    const before = html.slice(0, index);
    const headings = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
    if (!headings.length) continue;

    const own = headings[headings.length - 1];
    const name = clean(own[1]);
    if (!/^WDS\b/i.test(name)) continue;

    const block = clean(html.slice(own.index + own[0].length, index));
    found.push({
      name,
      date: parseEventDate(block),
      time: parseEventTime(block),
      page: href.startsWith('http') ? href : `${ORIGIN}${href.startsWith('/') ? '' : '/'}${href}`,
      ended: isResult || /view results/i.test(text),
    });
  }

  // One entry per event; the first mention wins.
  const byName = new Map();
  for (const e of found) if (!byName.has(e.name)) byName.set(e.name, e);
  return [...byName.values()];
}

/* ------------------------------------------------------------------ *
 * fight card
 * ------------------------------------------------------------------ */

/**
 * Fighters on a card page are the <img> tags under /assets/images/<event>/.
 * Each one's name is the nearest following heading or bold text; the weight
 * and country sit in the same block.
 */
export function parseFightCard(html, eventSlug) {
  const imgRe = new RegExp(
    `<img\\b[^>]*src=["']([^"']*assets/images/${eventSlug}/([^"'/]+))["'][^>]*>`,
    'gi'
  );
  const people = [];
  let m;
  while ((m = imgRe.exec(html))) {
    const after = html.slice(m.index, m.index + 1500);
    const nameMatch =
      after.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      after.match(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
    const text = clean(after);

    const name = nameMatch ? clean(nameMatch[1]) : '';
    if (!name) continue;

    const kg = text.match(/(\d{2,3}(?:\.\d)?)\s*kg/i);
    const country = text.match(
      /\b(India|Nepal|Russia|Uzbekistan|Tajikistan|Philippines|Portugal|Spain|Turkiye|Turkey|Kazakhstan|Kyrgyzstan|Iran|Bangladesh|Sri Lanka|Bhutan|Afghanistan)\b/i
    );

    people.push({
      name,
      photo: m[2],
      weightKg: kg ? Number(kg[1]) : 0,
      country: country ? country[1] : '',
    });
  }

  // The card is a list of pairs in page order.
  const bouts = [];
  for (let i = 0; i + 1 < people.length; i += 2) {
    bouts.push({ blue: people[i], red: people[i + 1] });
  }
  return bouts;
}

/* ------------------------------------------------------------------ *
 * optional JSON feed — the reliable path
 * ------------------------------------------------------------------ */

async function fromFeed(url) {
  const data = JSON.parse(await get(url));
  if (!Array.isArray(data.events)) throw new Error('feed has no "events" array');
  return data.events.map((e) => ({
    name: e.name,
    date: e.date,
    time: e.time || null,
    page: e.url || '',
    ended: Boolean(e.ended),
    card: Array.isArray(e.bouts) ? e.bouts : null,
  }));
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  const report = { checkedAt: new Date().toISOString(), source: FEED_URL || EVENTS_URL, events: [], changes: [], errors: [] };

  let events;
  try {
    events = FEED_URL ? await fromFeed(FEED_URL) : parseEventsIndex(await get(EVENTS_URL));
  } catch (err) {
    report.errors.push(`could not read the events index: ${err.message}`);
    finish(report, 1);
    return;
  }

  if (!events.length) {
    report.errors.push(
      'the events index parsed to zero events — the page markup has probably changed. '
      + 'Nothing was written. Check tools/sync-wds.mjs against the live page.'
    );
    finish(report, 1);
    return;
  }

  log(`found ${events.length} events at ${report.source}`);

  const current = fs.readFileSync(SOURCE, 'utf8');

  for (const e of events) {
    const entry = { name: e.name, date: e.date, time: e.time, ended: e.ended, card: null, note: '' };

    // Only /pages/ card pages are readable; everything else needs JS.
    const readable = /wdsmma\.com\/pages\/wds-/i.test(e.page);
    if (e.card) {
      entry.card = e.card.length;
      entry.note = 'from feed';
    } else if (readable) {
      try {
        const html = await get(e.page);
        const card = parseFightCard(html, slug(e.name).replace(/^wds-/, ''));
        entry.card = card.length;
        entry.bouts = card;
        entry.note = card.length ? 'parsed' : 'page read but no fighters matched';
      } catch (err) {
        entry.note = `could not read card: ${err.message}`;
        report.errors.push(`${e.name}: ${entry.note}`);
      }
    } else {
      entry.note = 'card unavailable — JavaScript-rendered or on warriorsdreamseries.com';
    }

    // Flag anything that differs from what is committed.
    if (e.date && !current.includes(e.date)) {
      report.changes.push(`${e.name}: date ${e.date} is not in wds-source.mjs`);
    }
    if (!current.includes(e.name)) {
      report.changes.push(`NEW EVENT: ${e.name} (${e.date || 'no date'})`);
    }

    report.events.push(entry);
    log(`  ${e.ended ? 'past    ' : 'upcoming'}  ${e.name.padEnd(24)} ${e.date || '????-??-??'}  ${entry.card !== null ? `${entry.card} bouts` : entry.note}`);
  }

  if (report.changes.length) {
    log('\nchanges against the committed data:');
    report.changes.forEach((c) => log(`  - ${c}`));
    log('\nUpdate tools/wds-source.mjs, then run: npm run roster && npm test');
  } else {
    log('\nno changes — committed data matches the live site.');
  }

  if (DRY) log('\n(dry run — nothing written)');
  finish(report, report.errors.length && !report.events.length ? 1 : 0);
}

function finish(report, code) {
  if (AS_JSON) console.log(JSON.stringify(report, null, 2));
  else if (report.errors.length) {
    console.log('\nproblems:');
    report.errors.forEach((e) => console.log(`  ! ${e}`));
  }
  process.exit(code);
}

// Only run when invoked directly, so the parsers above can be unit tested.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[sync] failed:', err.message);
    process.exit(1);
  });
}
