/**
 * Parsers used by tools/sync-wds.mjs.
 *
 * These run against fixtures, not the live site — this sandbox cannot reach
 * wdsmma.com. That means the date, time, link and pairing logic is verified,
 * but the CSS/markup assumptions are NOT: they are checked against markup
 * shaped like what the live pages produce, which is a weaker guarantee.
 *
 * The sync tool is written to fail loudly and write nothing when a page parses
 * to zero events, so a markup change shows up as a red build rather than as
 * silently wiped data.
 */
import assert from 'node:assert/strict';
import { parseEventDate, parseEventTime, links, parseEventsIndex, parseFightCard } from '../../tools/sync-wds.mjs';

const pass = [];
const t = (name, fn) => {
  try {
    fn();
    pass.push(name);
  } catch (e) {
    console.log('   ✗', name, '—', e.message);
    process.exitCode = 1;
  }
};

/* ---------------- dates ---------------- */

t('a single-day date parses', () => {
  assert.equal(parseEventDate('12 December, 2026'), '2026-12-12');
  assert.equal(parseEventDate('6 June, 2026'), '2026-06-06');
  assert.equal(parseEventDate('28 March, 2026'), '2026-03-28');
});

t('a two-day range takes the first day', () => {
  assert.equal(parseEventDate('24–25 October, 2026'), '2026-10-24');
  assert.equal(parseEventDate('25-26 July, 2026'), '2026-07-25');
  assert.equal(parseEventDate('25 — 26 April, 2026'), '2026-04-25');
});

t('a date without a comma still parses', () => {
  assert.equal(parseEventDate('29 August 2026'), '2026-08-29');
});

t('surrounding markup and whitespace do not matter', () => {
  assert.equal(parseEventDate('<p>  12   December,\n 2026 </p>'), '2026-12-12');
});

t('an unparseable date returns null rather than guessing', () => {
  assert.equal(parseEventDate('Coming soon'), null);
  assert.equal(parseEventDate('TBA'), null);
  assert.equal(parseEventDate('32 Smarch, 2026'), null);
});

/* ---------------- times ---------------- */

t('times convert to 24-hour', () => {
  assert.equal(parseEventTime('8:00 AM onwards'), '08:00');
  assert.equal(parseEventTime('5 PM onwards'), '17:00');
  assert.equal(parseEventTime('12:30 PM'), '12:30');
});

t('midnight and noon are not confused', () => {
  assert.equal(parseEventTime('12:00 AM'), '00:00');
  assert.equal(parseEventTime('12:00 PM'), '12:00');
});

t('a missing time returns null', () => {
  assert.equal(parseEventTime('Not listed'), null);
});

/* ---------------- links ---------------- */

t('links are extracted with their text', () => {
  const found = links('<a href="/pages/events.html">Show All Events ›</a>');
  assert.equal(found.length, 1);
  assert.equal(found[0].href, '/pages/events.html');
  assert.match(found[0].text, /Show All Events/);
});

t('entities in hrefs are decoded', () => {
  const found = links('<a href="/pages/event.html?e=a&amp;b=2">x</a>');
  assert.equal(found[0].href, '/pages/event.html?e=a&b=2');
});

/* ---------------- events index ---------------- */

const INDEX = `
<section>
  <article>
    <h3>WDS Rising Star 8</h3>
    <p>24–25 October, 2026</p><p>8:00 AM onwards</p>
    <p>Fit &amp; Fight Club Wagholi, Pune</p>
    <a href="/pages/wds-rising-star-8.html">View Fight Card ›</a>
  </article>
  <article>
    <h3>WDS Fight Night 19</h3>
    <p>12 December, 2026</p><p>5 PM onwards</p>
    <p>CIDCO Exhibition, Vashi, Navi Mumbai</p>
    <a href="/pages/wds-fight-night-19.html">View Fight Card ›</a>
  </article>
  <article>
    <h3>WDS Fight Night 18</h3>
    <p>29 August, 2026</p>
    <a href="https://warriorsdreamseries.com/wds-fight-night-18">View Results</a>
  </article>
</section>`;

t('the events index yields every event', () => {
  const events = parseEventsIndex(INDEX);
  assert.equal(events.length, 3, `got ${events.map((e) => e.name).join(', ')}`);
});

t('names, dates and times come through', () => {
  const events = parseEventsIndex(INDEX);
  const fn19 = events.find((e) => e.name === 'WDS Fight Night 19');
  assert.ok(fn19, 'Fight Night 19 missing');
  assert.equal(fn19.date, '2026-12-12');
  assert.equal(fn19.time, '17:00');
});

t('a results link marks the event as ended', () => {
  const events = parseEventsIndex(INDEX);
  assert.equal(events.find((e) => e.name === 'WDS Fight Night 18').ended, true);
  assert.equal(events.find((e) => e.name === 'WDS Fight Night 19').ended, false);
});

t('relative hrefs are made absolute', () => {
  const events = parseEventsIndex(INDEX);
  const e = events.find((x) => x.name === 'WDS Fight Night 19');
  assert.match(e.page, /^https:\/\/wdsmma\.com\/pages\//);
});

t('each event keeps its OWN date, not the previous one\'s', () => {
  // The regression this caught: a backwards window spilled into the article
  // above and gave Fight Night 19 the Rising Star 8 date.
  const events = parseEventsIndex(INDEX);
  assert.equal(events.find((e) => e.name === 'WDS Rising Star 8').date, '2026-10-24');
  assert.equal(events.find((e) => e.name === 'WDS Fight Night 19').date, '2026-12-12');
  assert.equal(events.find((e) => e.name === 'WDS Fight Night 18').date, '2026-08-29');
});

t('each event keeps its own time', () => {
  const events = parseEventsIndex(INDEX);
  assert.equal(events.find((e) => e.name === 'WDS Rising Star 8').time, '08:00');
  assert.equal(events.find((e) => e.name === 'WDS Fight Night 19').time, '17:00');
});

t('an event is never listed twice', () => {
  const doubled = INDEX + INDEX;
  const events = parseEventsIndex(doubled);
  assert.equal(new Set(events.map((e) => e.name)).size, events.length);
});

t('non-event links are ignored', () => {
  const noise = `<a href="/pages/about.html">About Us</a>
                 <a href="https://instagram.com/x">Instagram</a>` + INDEX;
  assert.equal(parseEventsIndex(noise).length, 3);
});

t('an empty page yields no events rather than throwing', () => {
  assert.deepEqual(parseEventsIndex('<html><body></body></html>'), []);
});

/* ---------------- fight card ---------------- */

const CARD = `
<div class="bout">
  <div><img src="/assets/images/fight-night-19/adnan-khan.webp" alt="Adnan Khan">
    <h4>Adnan Khan</h4><p>India</p><p>77.1 kg</p></div>
  <div><img src="/assets/images/fight-night-19/pratik-shetty.webp" alt="Pratik Shetty">
    <h4>Pratik Shetty</h4><p>India</p><p>77.1 kg</p></div>
</div>
<div class="bout">
  <div><img src="/assets/images/fight-night-19/jake-bron.webp" alt="Jake Bron">
    <h4>Jake Bron</h4><p>Philippines</p><p>56.7 kg</p></div>
  <div><img src="/assets/images/fight-night-19/bishal-sahu.webp" alt="Bishal Sahu">
    <h4>Bishal Sahu</h4><p>India</p><p>56.7 kg</p></div>
</div>`;

t('fighters are read from the card', () => {
  const bouts = parseFightCard(CARD, 'fight-night-19');
  assert.equal(bouts.length, 2, `got ${bouts.length} bouts`);
  assert.equal(bouts[0].blue.name, 'Adnan Khan');
  assert.equal(bouts[0].red.name, 'Pratik Shetty');
});

t('country and weight are picked up', () => {
  const [first, second] = parseFightCard(CARD, 'fight-night-19');
  assert.equal(first.blue.weightKg, 77.1);
  assert.equal(first.blue.country, 'India');
  assert.equal(second.blue.country, 'Philippines');
  assert.equal(second.blue.weightKg, 56.7);
});

t('the photo filename is kept exactly as published', () => {
  const [first] = parseFightCard(CARD, 'fight-night-19');
  assert.equal(first.blue.photo, 'adnan-khan.webp');
  assert.equal(first.red.photo, 'pratik-shetty.webp');
});

t('images from another event are not picked up', () => {
  const mixed = CARD + '<img src="/assets/images/fight-night-18/someone.webp"><h4>Someone Else</h4>';
  const bouts = parseFightCard(mixed, 'fight-night-19');
  const names = bouts.flatMap((b) => [b.blue.name, b.red.name]);
  assert.ok(!names.includes('Someone Else'), 'leaked a fighter from another card');
});

t('a page with no card yields no bouts rather than throwing', () => {
  assert.deepEqual(parseFightCard('<p>Loading the fight card…</p>', 'fight-night-19'), []);
});

t('an odd number of fighters does not produce a half bout', () => {
  const odd = CARD + `<img src="/assets/images/fight-night-19/lonely.webp"><h4>Lonely Fighter</h4>`;
  const bouts = parseFightCard(odd, 'fight-night-19');
  assert.ok(bouts.every((b) => b.blue && b.red), 'produced a bout with an empty corner');
});

console.log(`\n✅ ${pass.length} sync-parser checks passed`);
pass.forEach((p) => console.log('   ✓', p));
