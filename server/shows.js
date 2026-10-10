// The show: what the account holder (artist or venue) sets on /setup before going live. One current show,
// plus named templates to start the next one from. Both live in SQLite.
import { db } from './db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS shows (
    id       TEXT PRIMARY KEY,
    settings TEXT NOT NULL,
    updated  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    name     TEXT PRIMARY KEY,
    settings TEXT NOT NULL,
    updated  TEXT NOT NULL
  );
`);

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'pt'];

// A page address: "Longy" -> longy, "Bitfest '26" -> bitfest-26. Names the site's own folders use are left out.
const TAKEN = ['api', 'img', 'js', 'fonts'];
export const pageName = (name) => {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return TAKEN.includes(s) ? '' : s;
};

const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i; // name@wallet.example

// A new show. Prices are left for the account holder: what a pint or a coffee costs depends on the town.
export const blank = () => ({
  title: '',
  description: '',                      // optional: a line or two under the title
  artist: '',                           // not on the tag line; the buttons use it ("Send Longy a message")
  page: '',                             // the show page's address (/longy): set once, kept when the artist is renamed
  lightning: '',                        // the artist's Lightning address: where the takings page pays out
  stream: { mode: 'pay', price: null }, // 'pay': sats per 10 s; 'free': free to watch, tips only
  tip: { label: '', price: null },      // always on
  goal: { on: false, amount: null, minutes: 30 }, // all or nothing; refunds itself if missed
  ticket: { on: false, price: null },   // an in-person ticket alongside the stream
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
    ticket: { on: on(input.ticket?.on), price: sats(input.ticket?.price) },
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
  return { show, problems };
}

const now = () => new Date().toISOString();

export function currentShow() {
  const row = db.prepare("SELECT settings, updated FROM shows WHERE id = 'current'").get();
  const { show, problems } = clean(row ? JSON.parse(row.settings) : blank());
  return { show, problems, updated: row?.updated ?? null, path: show.page ? `/${show.page}` : '/' };
}

export function saveShow(input) {
  const { show } = clean(input);
  db.prepare(`INSERT INTO shows (id, settings, updated) VALUES ('current', ?, ?)
              ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`)
    .run(JSON.stringify(show), now());
  return currentShow();
}

export const listTemplates = () =>
  db.prepare('SELECT name, updated FROM templates ORDER BY updated DESC').all().map((r) => ({ ...r }));

export function saveTemplate(name, input) {
  const n = String(name ?? '').trim().slice(0, 60);
  if (!n) throw new Error('A template needs a name.');
  const { show } = clean(input);
  db.prepare(`INSERT INTO templates (name, settings, updated) VALUES (?, ?, ?)
              ON CONFLICT(name) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`)
    .run(n, JSON.stringify(show), now());
  return listTemplates();
}

// Start the current show from a template (the template itself stays as it was).
export function loadTemplate(name) {
  const row = db.prepare('SELECT settings FROM templates WHERE name = ?').get(String(name ?? ''));
  if (!row) throw new Error('No template by that name.');
  return saveShow(JSON.parse(row.settings));
}

export function deleteTemplate(name) {
  db.prepare('DELETE FROM templates WHERE name = ?').run(String(name ?? ''));
  return listTemplates();
}
