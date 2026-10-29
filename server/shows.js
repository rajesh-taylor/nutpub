// The show: what the account holder (artist or venue) sets on /setup before going live. One current show,
// plus named templates to start the next one from. Both live in D1.
import { one, all, run } from './db.js';

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'pt'];

// A page address: "Longy" -> longy, "Bitfest '26" -> bitfest-26. Names the site's own folders use are left out.
const TAKEN = ['api', 'img', 'js', 'fonts'];
export const pageName = (name) => {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return TAKEN.includes(s) ? '' : s;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i; // name@wallet.example

// A new show. Prices are left for the account holder: what a pint or a coffee costs depends on the town.
export const blank = () => ({
  title: '',
  description: '',                      // optional: a line or two under the title
  artist: '',                           // not on the tag line; the buttons use it ("Tip Longy")
  venue: '',
  date: '',                             // YYYY-MM-DD, UK time
  starts: '',                           // HH:MM, when the show starts
  lastOrders: '',                       // HH:MM: an unpoured drink's lock opens for the artist then (NUT-11 locktime)
  page: '',                             // the show page's address (/longy): set once, kept when the artist is renamed
  lightning: '',                        // the artist's Lightning address: where the takings page pays out
  stream: { mode: 'pay', price: null }, // 'pay': sats per 10 s; 'free': free to watch, tips only
  tip: { label: '', price: null },      // always on
  goal: { on: false, amount: null, minutes: 30 }, // all or nothing; refunds itself if missed
  ticket: { on: false, price: null },   // the privacy ticket: what the buyer pays (the drink included)
  drink: { price: null, mode: 'off' },  // 'off', or 'artist': the artist adds a first drink to the ticket price
  goals: [{ label: '', at: null }, { label: '', at: null }], // stretch goals, fed by tips
  live: { server: '', key: '', playback: '' }, // OBS: where to stream, its key (host only), the link it plays at
  wallet: { on: true },                 // the wallet in the browser, with Take sats home
  retry: { on: true },                  // safe retry: paid once, retried safely
  shape: '16:9',                        // the video: landscape 16:9 or portrait 9:16 (a phone filming upright)
  languages: ['en'],
  language: 'en',                       // the one the viewer page opens in
});

// Clean whatever the setup page sent into a valid show. Returns { show, problems }: problems are the fields
// still to fill in before the show can go live (saving is allowed either way, so nobody loses their typing).
export function clean(input = {}) {
  const b = blank();
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const sats = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= 1_000_000 ? n : null;
  };
  const on = (v) => v === true;

  const show = {
    title: text(input.title, 80),
    description: text(input.description, 280),
    artist: text(input.artist, 60),
    // Empty: taken from the artist's name, once. After that it stays put, so links and posters keep working.
    page: pageName(input.page) || pageName(input.artist),
    lightning: LN_ADDRESS.test(text(input.lightning, 120)) ? text(input.lightning, 120).toLowerCase() : '',
    stream: {
      mode: input.stream?.mode === 'free' ? 'free' : 'pay',
      price: sats(input.stream?.price),
    },
    tip: { label: text(input.tip?.label, 40), price: sats(input.tip?.price) },
    goal: {
      on: on(input.goal?.on),
      amount: sats(input.goal?.amount),
      minutes: Math.min(Math.max(Math.floor(Number(input.goal?.minutes)) || b.goal.minutes, 1), 600),
    },
    venue: text(input.venue, 60),
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : '',
    starts: TIME.test(input.starts) ? input.starts : '',
    lastOrders: TIME.test(input.lastOrders) ? input.lastOrders : '',
    ticket: { on: on(input.ticket?.on), price: sats(input.ticket?.price) },
    drink: { price: sats(input.drink?.price), mode: ['artist', 'venue'].includes(input.drink?.mode) ? 'artist' : 'off' }, // 'venue': before 29 Oct
    goals: [0, 1].map((i) => ({ label: text(input.goals?.[i]?.label, 60), at: sats(input.goals?.[i]?.at) })),
    live: {
      server: /^rtmps?:\/\/\S+$|^srt:\/\/\S+$/i.test(text(input.live?.server, 300)) ? text(input.live?.server, 300) : '',
      key: text(input.live?.key, 300),
      playback: /^https:\/\/\S+$/i.test(text(input.live?.playback, 300)) ? text(input.live?.playback, 300) : '',
    },
    wallet: { on: (input.wallet ?? input.pocket)?.on !== false }, // `pocket`: its name in shows saved before 6 Oct
    retry: { on: input.retry?.on !== false },
    shape: input.shape === '9:16' ? '9:16' : '16:9', // replaces `orientation` (Tue 6 Oct), which never changed the page
    languages: LANGUAGES.filter((l) => (input.languages || []).includes(l)),
    language: LANGUAGES.includes(input.language) ? input.language : 'en',
  };
  if (!show.languages.length) show.languages = ['en'];
  if (!show.languages.includes(show.language)) show.language = show.languages[0];

  const problems = [];
  if (!show.title) problems.push('title');
  if (!show.artist) problems.push('artist');
  if (show.stream.mode === 'pay' && !show.stream.price) problems.push('stream.price');
  if (!show.tip.label) problems.push('tip.label');
  if (!show.tip.price) problems.push('tip.price');
  if (show.goal.on && !show.goal.amount) problems.push('goal.amount');
  if (show.ticket.on && !show.ticket.price) problems.push('ticket.price');
  if (show.drink.mode === 'artist' && !show.drink.price) problems.push('drink.price');
  if (show.drink.mode === 'artist' && !(show.date && show.lastOrders)) problems.push('lastOrders');
  return { show, problems };
}

const now = () => new Date().toISOString();

export async function currentShow() {
  const row = await one("SELECT settings, updated FROM shows WHERE id = 'current'");
  const { show, problems } = clean(row ? JSON.parse(row.settings) : blank());
  return { show, problems, updated: row?.updated ?? null, path: show.page ? `/${show.page}` : '/' };
}

export async function saveShow(input) {
  const { show } = clean(input);
  await run(`INSERT INTO shows (id, settings, updated) VALUES ('current', ?, ?)
             ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`, JSON.stringify(show), now());
  return currentShow();
}

export const listTemplates = () => all('SELECT name, updated FROM templates ORDER BY updated DESC');

export async function saveTemplate(name, input) {
  const n = String(name ?? '').trim().slice(0, 60);
  if (!n) throw new Error('A template needs a name.');
  const { show } = clean(input);
  await run(`INSERT INTO templates (name, settings, updated) VALUES (?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`, n, JSON.stringify(show), now());
  return listTemplates();
}

// Start the current show from a template (the template itself stays as it was).
export async function loadTemplate(name) {
  const row = await one('SELECT settings FROM templates WHERE name = ?', String(name ?? ''));
  if (!row) throw new Error('No template by that name.');
  return saveShow(JSON.parse(row.settings));
}

export async function deleteTemplate(name) {
  await run('DELETE FROM templates WHERE name = ?', String(name ?? ''));
  return listTemplates();
}

// What a ticket costs and who gets what: the artist's price, plus the first drink if the artist added one.
export function ticketSplit(show) {
  const drink = show.drink.mode === 'artist' ? show.drink.price || 0 : 0;
  const artist = show.ticket.price || 0;
  return { artist, drink, total: artist + drink };
}

// Last orders as Unix seconds. The times are UK time: the offset is read for that date, so summer time works too.
export function lastOrdersAt(show) {
  if (!show.date || !show.lastOrders) return null;
  const guess = new Date(`${show.date}T${show.lastOrders}:00Z`);
  const tz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(guess).find((x) => x.type === 'timeZoneName').value; // "GMT" or "GMT+1"
  const hours = Number(tz.replace('GMT', '') || 0);
  return Math.floor(guess.getTime() / 1000) - hours * 3600;
}

// The show, read once per request.
export const current = (c) => (c.current ??= currentShow());
export const showOf = async (c) => (await current(c)).show;
