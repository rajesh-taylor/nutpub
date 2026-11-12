// The show: what the account holder (artist or venue) sets on /setup before going live. One current show,
// plus named templates to start the next one from. Both live in D1.
import { one, all, run, sql, batch, kv } from './db.js';

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'pt'];

// A page address: "Longy" -> longy, "Bitfest '26" -> bitfest-26. Names the site's own folders use are left out.
const TAKEN = ['api', 'img', 'js', 'fonts'];
export const pageName = (name) => {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return TAKEN.includes(s) ? '' : s;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DRINK_LATER = true;
const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i; // name@wallet.example

// A new show. Prices are left for the account holder: what a pint or a coffee costs depends on the town.
// The show as every viewer may see it: the artist's Lightning address and the stream's details stay with the host.
export const publicShow = (show) => {
  const open = structuredClone(show);
  delete open.lightning; delete open.live; delete open.splits; // the picture's link comes with a token, from /api/live/token
  return open;
};

export const blank = () => ({
  title: '',                            // optional: the artist may leave it blank
  description: '',                      // optional: a line or two under the title
  artist: '',                           // not on the tag line; the buttons use it ("Tip Longy")
  venue: '',
  capacity: null,                       // how many room tickets can be sold; blank: no limit
  date: '',                             // YYYY-MM-DD, UK time
  streams: '',                          // HH:MM, the one start time: the stream opens to the public then
  starts: '',                           // HH:MM, the show's start: gone from setup 10 Nov (one start time), kept for old shows
  lastOrders: '',                       // HH:MM: an unpoured drink's lock opens for the artist then (NUT-11 locktime)
  page: '',                             // the show page's address (/longy): set once, kept when the artist is renamed
  lightning: '',                        // the artist's Lightning address: where the takings page pays out
  splits: [],                           // more people's shares: { name, percent, lightning }. Saved, not paid out yet
  comments: true,                       // the live chat's words: on unless the artist turns them off (tips still come, without words)
  stream: { mode: 'pay', perMinute: null, freeMinutes: null }, // freeMinutes: Pay as you watch only, the first minutes free (10 Nov). Watching from home: 'ticket' (an Online ticket), 'pay' (sats a minute), 'free' (tips only) or 'off' (no stream)
  online: { price: null, fiat: null, locked: false }, // the Online ticket, in sats; fiat: £ by card, which fills the sats unless locked
  tip: { label: '', price: null },      // always on
  goal: { on: false, amount: null, minutes: 30 }, // all or nothing; refunds itself if missed
  ticket: { on: false, price: null, fiat: null, locked: false }, // the room ticket in sats; fiat: £, the card price, which fills the sats unless locked
  door: { on: false },                  // door check: the ticket page's QR (new every 30 s) is scanned once at the door (off by default)
  drink: { price: null, mode: 'off' },  // 'off', or 'artist': the artist adds a first drink to the ticket price
  goals: [{ label: '', at: null }, { label: '', at: null }, { label: '', at: null }], // up to 3 stretch goals, fed by tips
  goalsThanks: '',                      // the artist's message once the last goal is met (written before the night)
  live: { server: '', key: '', playback: '' }, // OBS: where to stream, its key (host only), the link it plays at
  wallet: { on: true },                 // the wallet in the browser, with Take sats home
  retry: { on: true },                  // safe retry: paid once, retried safely
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
  const pounds = (v) => { // £0.01 to £100,000, to the penny
    const p = Math.round(Number(v) * 100);
    return v !== null && v !== '' && Number.isFinite(p) && p >= 1 && p <= 10_000_000 ? p / 100 : null;
  };

  const show = {
    title: text(input.title, 80),
    description: text(input.description, 280),
    artist: text(input.artist, 60),
    // Empty: taken from the artist's name, once. After that it stays put, so links and posters keep working.
    page: pageName(input.page) || pageName(input.artist),
    lightning: LN_ADDRESS.test(text(input.lightning, 120)) ? text(input.lightning, 120).toLowerCase() : '',
    // The artist gets what's left of 95%, at least 1%; The NutPub's 5% is fixed, so it isn't stored.
    splits: (Array.isArray(input.splits) ? input.splits : []).slice(0, 8).reduce((list, s) => {
      const used = list.reduce((sum, x) => sum + (x.percent || 0), 0);
      const n = Math.floor(Number(s?.percent));
      const lightning = text(s?.lightning, 120).toLowerCase();
      return [...list, { name: text(s?.name, 40), percent: n >= 1 && used < 94 ? Math.min(n, 94 - used) : null, lightning: LN_ADDRESS.test(lightning) ? lightning : '' }];
    }, []),
    comments: input.comments !== false,
    stream: {
      mode: ['ticket', 'pay', 'free', 'off'].includes(input.stream?.mode) ? input.stream.mode : 'pay',
      perMinute: sats(input.stream?.perMinute) ?? sats(input.stream?.price * 6), // `price`: per 10 s, in shows saved before 3 Nov
      freeMinutes: Number.isInteger(Number(input.stream?.freeMinutes)) && Number(input.stream.freeMinutes) >= 1 ? Math.min(30, Number(input.stream.freeMinutes)) : null, // 30 at most: it's on our Stream bill
    },
    online: { price: sats(input.online?.price), fiat: pounds(input.online?.fiat), locked: on(input.online?.locked) },
    tip: { label: text(input.tip?.label, 40), price: sats(input.tip?.price) },
    goal: {
      on: on(input.goal?.on),
      amount: sats(input.goal?.amount),
      minutes: Math.min(Math.max(Math.floor(Number(input.goal?.minutes)) || b.goal.minutes, 1), 600),
    },
    venue: text(input.venue, 120),
    capacity: (() => { const n = Math.floor(Number(input.capacity)); return input.capacity !== '' && input.capacity != null && n >= 1 && n <= 100_000 ? n : null; })(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : '',
    streams: TIME.test(input.streams) ? input.streams : '',
    starts: TIME.test(input.starts) ? input.starts : '',
    lastOrders: TIME.test(input.lastOrders) ? input.lastOrders : '',
    ticket: { on: on(input.ticket?.on), price: sats(input.ticket?.price), fiat: pounds(input.ticket?.fiat), locked: on(input.ticket?.locked) },
    door: { on: on(input.door?.on) },
    // The first drink is off on every gig until after 27 Nov (decided 9 Nov): one kind of ticket for everyone. When it
    // comes back it should lock once a gig's first ticket sells, as the artist's name does.
    drink: { price: sats(input.drink?.price), mode: DRINK_LATER ? 'off' : ['artist', 'venue'].includes(input.drink?.mode) ? 'artist' : 'off' }, // 'venue': before 29 Oct
    goalsThanks: text(input.goalsThanks, 140),
    goals: [0, 1, 2].map((i) => ({ label: text(input.goals?.[i]?.label, 60), at: sats(input.goals?.[i]?.at) })),
    live: {
      server: /^rtmps?:\/\/\S+$|^srt:\/\/\S+$/i.test(text(input.live?.server, 300)) ? text(input.live?.server, 300) : '',
      key: text(input.live?.key, 300),
      playback: /^https:\/\/\S+$/i.test(text(input.live?.playback, 300)) ? text(input.live?.playback, 300) : '',
    },
    wallet: { on: (input.wallet ?? input.pocket)?.on !== false }, // `pocket`: its name in shows saved before 6 Oct
    retry: { on: input.retry?.on !== false },
    languages: LANGUAGES.filter((l) => (input.languages || []).includes(l)),
    language: LANGUAGES.includes(input.language) ? input.language : 'en',
  };
  if (!show.languages.length) show.languages = ['en'];
  if (!show.languages.includes(show.language)) show.language = show.languages[0];

  const problems = [];
  if (!show.artist) problems.push('artist');
  if (!show.venue) problems.push('venue');
  if (!show.date) problems.push('date');
  else if (show.date < new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) problems.push('date.past');
  if (show.stream.mode === 'pay' && !show.stream.perMinute) problems.push('stream.perMinute');
  if (show.goal.on && !show.goal.amount) problems.push('goal.amount');
  if (show.ticket.on && !show.ticket.price) problems.push('ticket.price');
  if (show.stream.mode === 'ticket' && !show.online.price) problems.push('online.price');
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

// The gig has been: the host ended the night, or its date has gone.
export const gigOver = async (settled) => (await kv.get('stage')) === 'closed' || settled.problems.includes('date.past');

// A finished gig clears itself when the artist gives the next one a date: tickets, chat and stage. Payments stay to collect.
export async function clearGig() {
  await batch([sql('DELETE FROM tickets'), sql('DELETE FROM passkeys'), sql('DELETE FROM nostr'), sql('DELETE FROM drinks'), sql('DELETE FROM live_paid'), sql('DELETE FROM watchers'), sql("DELETE FROM kv WHERE key IN ('freeFrom', 'liveFrom', 'endedAt')"), sql('UPDATE messages SET deleted = 1')]);
  const at = now();
  await kv.set('nightStart', at); // Takings counts this gig from here
  await kv.set('stage', 'doors');
  await kv.set('stageAt', at);
}

// Next gig (Plan gig, once a gig is over): one tap clears it, as a new date would, and keeps every setting. A date
// that has gone becomes today, so the page is ready to use at once. Refused while a gig is still on: it would cancel
// tickets people hold.
export async function nextGig() {
  const was = await currentShow();
  if (!(await gigOver(was))) throw new Error('This gig isn\u2019t over yet.');
  await clearGig();
  if (was.problems.includes('date.past')) {
    const show = { ...was.show, date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) };
    await run("UPDATE shows SET settings = ?, updated = ? WHERE id = 'current'", JSON.stringify(show), now());
  }
  return currentShow();
}

export async function saveShow(input) {
  const { show, problems } = clean(input);
  const was = await currentShow();
  // A new date on a gig that hasn't happened is a postponement: its tickets stand.
  if (show.date && show.date !== was.show.date && !problems.includes('date.past') && (await gigOver(was))) await clearGig();
  // Once a ticket has sold the name and the address are fixed until New night: posters and saved links depend on them.
  if ((await one('SELECT 1 AS x FROM tickets LIMIT 1'))) {
    const before = (await currentShow()).show;
    show.artist = before.artist;
    show.page = before.page;
  }
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

// A 10-second piece of the recorded set, at the show's rate a minute.
export const piecePrice = (show) => Math.ceil(show.stream.perMinute / 6);

// What a ticket costs and who gets what: the artist's price, plus the first drink if the artist added one.
export function ticketSplit(show) {
  const drink = show.drink.mode === 'artist' ? show.drink.price || 0 : 0;
  const artist = show.ticket.price || 0;
  return { artist, drink, total: artist + drink };
}

// A UK time on the gig's date as Unix seconds. The offset is read for that date, so summer time works too.
function ukAt(date, hhmm) {
  if (!date || !hhmm) return null;
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const tz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(guess).find((x) => x.type === 'timeZoneName').value; // "GMT" or "GMT+1"
  const hours = Number(tz.replace('GMT', '') || 0);
  return Math.floor(guess.getTime() / 1000) - hours * 3600;
}
// Last orders: an unpoured drink's lock opens for the artist then.
export const lastOrdersAt = (show) => ukAt(show.date, show.lastOrders);
// The one start time: the stream opens to the public then, by itself, unless the artist opened it early.
export const opensAt = (show) => ukAt(show.date, show.streams);

// The stage: 'doors' (the public waits: a countdown, no picture), 'open' (the stream is public), 'on' (the show has
// started: room phones show the picture), 'closed' (the night is over). Doors turns open by itself at the start time.
export async function stageNow(show) {
  const stage = await kv.get('stage', 'doors');
  const at = opensAt(show);
  return stage === 'doors' && at && Date.now() / 1000 >= at ? 'open' : stage;
}

// How often (in seconds) a page should ask the server. Every 2 s on the gig day (6am to 6am UK time), while the stream
// is on air, and for half an hour after the host presses a stage button (a rehearsal); otherwise once a minute: a tab
// left open for weeks mustn't eat the free plan's 100,000 requests a day.
export function pollEvery({ live, date, stageAt }, at = Date.now()) {
  if (live || (stageAt && at - Date.parse(stageAt) < 30 * 60_000)) return 2;
  return new Date(at - 6 * 3_600_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === date ? 2 : 60;
}

// The show, read once per request.
export const current = (c) => (c.current ??= currentShow());
export const showOf = async (c) => (await current(c)).show;
