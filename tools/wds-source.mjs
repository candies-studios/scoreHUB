/**
 * WDS Fight Night 19 — the real fight card.
 *
 * Source: https://wdsmma.com/pages/wds-fight-night-19.html
 * Captured 12 Nov 2026. Photo filenames are listed explicitly rather than
 * derived from the name, because several do not match
 * (Kimson Tony -> kimson.webp, Edukondal -> edukondal-rao.webp, and others).
 *
 * `tools/sync-wds.mjs` refreshes this automatically from the live site.
 */

export const PHOTO_BASE = 'https://wdsmma.com/assets/images/fight-night-19/';
export const TBA = { name: 'TBA', country: '', weightKg: 0, photo: 'placeholder-fighter.svg' };

/** position: 1 is the main event, 2 the co-main, then the rest of the card. */
export const FIGHT_NIGHT_19 = [
  { position: 'Main Event', weightClass: 'Light Heavyweight',
    blue: { name: 'Gaganpal Singh Dua', country: 'India', weightKg: 93.0, photo: 'gaganpal-singh.webp' },
    red: TBA },
  { position: 'Co-Main Event', weightClass: 'Catchweight 54 kg',
    blue: { name: 'Surbala Laishram', country: 'India', weightKg: 54, photo: 'surbala-laishram.webp', gender: 'female' },
    red: { name: 'Arofat Toirova', country: 'Uzbekistan', weightKg: 54, photo: 'arofat-toirova.webp', gender: 'female' } },
  { weightClass: 'Welterweight',
    blue: { name: 'Adnan Khan', country: 'India', weightKg: 77.1, photo: 'adnan-khan.webp' },
    red: { name: 'Pratik Shetty', country: 'India', weightKg: 77.1, photo: 'pratik-shetty.webp' } },
  { weightClass: 'Bantamweight',
    blue: { name: 'Nongmaithem Bonjovi', country: 'India', weightKg: 61.2, photo: 'nongmaithem-bonjovi.webp' },
    red: { name: 'Dzhavkharali Nuraliev', country: 'Tajikistan', weightKg: 61.2, photo: 'dzhafar-nuraliev.webp' } },
  { weightClass: 'Flyweight',
    blue: { name: 'Bishal Sahu', country: 'India', weightKg: 56.7, photo: 'bishal-sahu.webp' },
    red: { name: 'Jake Bron', country: 'Philippines', weightKg: 56.7, photo: 'jake-bron.webp' } },
  { weightClass: 'Flyweight',
    blue: { name: 'Shoaib Khan', country: 'India', weightKg: 56.7, photo: 'shoaib-khan.webp' },
    red: TBA },
  { weightClass: 'Flyweight',
    blue: { name: 'Ashish Rawat', country: 'India', weightKg: 56.7, photo: 'ashish-rawat.webp' },
    red: { name: 'Safarov Yoqubjon', country: 'Tajikistan', weightKg: 56.7, photo: 'safarov-yoqubjon.webp' } },
  { weightClass: 'Catchweight 50 kg',
    blue: { name: 'Alena Ignateva', country: 'Russia', weightKg: 50, photo: 'alena-ignatyeva.webp', gender: 'female' },
    red: { name: 'Bebs Francisco', country: 'Philippines', weightKg: 50, photo: 'bebs-francisco.webp', gender: 'female' } },
  { weightClass: 'Flyweight',
    blue: { name: 'Sangramsingh Godase', country: 'India', weightKg: 56.7, photo: 'sangramsingh-godase.webp' },
    red: { name: 'Siddiqui Altamash Shahanawaz', country: 'India', weightKg: 56.7, photo: 'siddiqui-altamash-shahanawaz.webp' } },
  { weightClass: 'Welterweight',
    blue: { name: 'Kimson Tony', country: 'India', weightKg: 77.1, photo: 'kimson.webp' },
    red: { name: 'Sohail Khan', country: 'India', weightKg: 77.1, photo: 'sohail.webp' } },
  { weightClass: 'Featherweight',
    blue: { name: 'Edukondal', country: 'India', weightKg: 65.8, photo: 'edukondal-rao.webp' },
    red: { name: 'Besii Ariijii', country: 'India', weightKg: 65.8, photo: 'besii-ariijii.webp' } },
  { weightClass: 'Featherweight',
    blue: { name: 'Chhabi (Kapil) Gupta', country: 'India', weightKg: 65.8, photo: 'kapil-gupta.webp' },
    red: { name: 'Shaheen Commando', country: 'India', weightKg: 65.8, photo: 'shaheen-commando.webp' } },
  { weightClass: 'Flyweight',
    blue: { name: 'Sajal Choudhary', country: 'India', weightKg: 56.7, photo: 'sajal-choudhary.webp' },
    red: { name: 'Sagar Dange', country: 'India', weightKg: 56.7, photo: 'sagar-dange.webp' } },
  { weightClass: 'Flyweight',
    blue: { name: 'Thiaumuanlal Guite', country: 'India', weightKg: 56.7, photo: 'thiaumuanlal-guite.webp' },
    red: { name: 'Sachin Singh', country: 'India', weightKg: 56.7, photo: 'sachin-singh.webp' } },
  { weightClass: 'Bantamweight',
    blue: { name: 'Rohit Raina', country: 'India', weightKg: 61.2, photo: 'rohit-raina.webp' },
    red: { name: 'Laxman Govekar', country: 'India', weightKg: 61.2, photo: 'laxman-govekar.webp' } },
];

/**
 * Events — all real. Source: https://wdsmma.com/pages/events.html
 *
 * `card` names the module key above when the fight card could be read from
 * the site. The rest have no card yet: their fight cards live either behind a
 * JavaScript-rendered page or on warriorsdreamseries.com, neither of which
 * serves anything to a fetcher. They appear in ScoreHub with their real
 * details and an empty card rather than invented fighters.
 */
export const EVENTS = [
  { name: 'WDS Fight Night 19', series: 'Championship Series',
    date: '2026-12-12', time: '17:00',
    location: 'CIDCO Exhibition, Vashi, Navi Mumbai',
    page: 'https://wdsmma.com/pages/wds-fight-night-19.html',
    card: 'FIGHT_NIGHT_19' },

  { name: 'WDS Rising Star 8', series: 'Rising Star Series',
    date: '2026-10-24', time: '08:00',
    location: 'Fit & Fight Club Wagholi, Pune',
    page: 'https://wdsmma.com/pages/event.html?e=wds-rising-star-8',
    card: null },

  { name: 'WDS Fight Night 18', series: 'Championship Series',
    date: '2026-08-29', time: '17:00',
    location: 'Cidco Exhibition & Convention Centre, Vashi, Navi Mumbai',
    page: 'https://warriorsdreamseries.com/wds-fight-night-18',
    card: null },

  { name: 'WDS Rising Star 7', series: 'Rising Star Series',
    date: '2026-07-25', time: '08:00',
    location: 'Fit & Fight Club, Nerul, Navi Mumbai',
    page: 'https://warriorsdreamseries.com/wds-rising-star-7/',
    card: null },

  { name: 'WDS Fight Night 17', series: 'Championship Series',
    date: '2026-06-06', time: '17:00',
    location: 'Sport Complex, Mumbai University, Kalina',
    page: 'https://warriorsdreamseries.com/warriors-dream-series-17/',
    card: null },

  { name: 'WDS Rising Star 6', series: 'Rising Star Series',
    date: '2026-04-25', time: '08:00',
    location: 'Fit & Fight Club, Nerul',
    page: 'https://warriorsdreamseries.com/wds-rising-star-6',
    card: null },

  { name: 'WDS Fight Night 16', series: 'Championship Series',
    date: '2026-03-28', time: '17:00',
    location: 'LPU, Jalandhar',
    page: 'https://warriorsdreamseries.com/warriors-dream-series-16',
    card: null },
];

export const CARDS = { FIGHT_NIGHT_19 };

/** Officials. Not published by WDS; these are the ScoreHub operators. */
export const JUDGES = [
  { name: 'Poonam Deshmukh', contactNo: '', bloodGroup: '' },
  { name: 'Ayush Kulkarni', contactNo: '', bloodGroup: '' },
  { name: 'Sandeep Rawat', contactNo: '', bloodGroup: '' },
];
export const REFEREES = [{ name: 'Deepak Salvi', contactNo: '', bloodGroup: '' }];
