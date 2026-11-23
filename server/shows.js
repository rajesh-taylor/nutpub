// The show: what the account holder (artist or venue) sets on /setup before going live. One current show,
// plus named templates to start the next one from. Both live in D1.
import { one, all, run, sql, batch, kv, stageDb } from './db.js';
import { keepGigLine } from './closing.js';
import { PRICING, UPFRONT } from './config.js';
import { getRate } from './rate.js';
import { endReplay } from './replay.js';

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'pt'];

// A page address: "Longy" -> longy, "Bitfest '26" -> bitfest-26. Names the site's own folders use are left out.
const TAKEN = ['api', 'img', 'js', 'fonts', 'gig']; // gig: a stage's gig with no page name yet (below)
export const pageName = (name) => {
  const s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return TAKEN.includes(s) ? '' : s;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const FREE_MAX = 100; // a free stream's most viewers at once, for now (agreed 17 Nov)
export const SPARE_HOURS = 1; // a free stream is paid for an hour past its end: an overrun (and nobody is cut off)
export const WATCH_TIMES = 2; // the replay's watching limit: twice through
const DRINK_LATER = true;
const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i; // name@wallet.example

// A new show. Prices are left for the account holder: what a pint or a coffee costs depends on the town.
// The show as every viewer may see it: the artist's Lightning address and the stream's details stay with the host.
export const publicShow = (show) => {
  const open = structuredClone(show);
  delete open.lightning; delete open.live; delete open.splits; // the picture's link comes with a token, from /api/live/token
  return open;
};

export const NUTZAP_EMOJI = ['⚡', '🥜', '🍺', '🎸', '🎤', '🔥', '❤️', '🙌'];
export const blank = () => ({
  title: '',                            // optional: the artist may leave it blank
  description: '',                      // optional: a line or two under the title
  set: '',                              // the recorded clip that plays when nobody's live: '' the default, or a name under media/sets/ (frankie-1)
  artist: '',                           // not on the tag line; the buttons use it ("Tip Longy")
  venue: '',
  capacity: null,                       // how many venue tickets can be sold; blank: no limit
  date: '',                             // YYYY-MM-DD, UK time
  streams: '',                          // HH:MM, the one start time: the stream opens to the public then
  starts: '',                           // HH:MM, the show's start: gone from setup 10 Nov (one start time), kept for old shows
  lastOrders: '',                       // HH:MM: an unpoured drink's lock opens for the artist then (NUT-11 locktime)
  page: '',                             // the show page's address (/longy): set once, kept when the artist is renamed
  lightning: '',                        // the artist's Lightning address: where the takings page pays out
  splits: [],                           // more people's shares: { name, percent, lightning }. Saved, not paid out yet
  comments: true,                       // the live chat's words: on unless the artist turns them off (tips still come, without words)
  // tipWords (session 55c): comments need a tip (21 sats or more) while no mod is on. Not stored until the artist saves:
  // clean() makes it true for a free stream, false otherwise.
  chatRows: 5,                          // over the picture, the newest 3, 5 or 10 lines of the chat (Rajesh 14 Nov; 5 from 19 Nov: at 3, lines went by while typing)
  stream: { mode: 'pay', perMinute: null, freeMinutes: null }, // freeMinutes: Pay as you watch only, the first minutes free (10 Nov). Watching from home: 'ticket' (a Watch online ticket), 'pay' (sats a minute), 'free' (tips only) or 'off' (no stream)
  replay: { mode: 'off', price: null, fiat: null, locked: false }, // after End night the gig page plays the recording (sessions 34-35): 'off' or 'on', one price for the whole replay (sats; fiat: £, which fills the sats unless locked), never below the minimum for the show's length
  free: { viewers: null },              // a free stream (tips only): the most viewers at once, which the artist pays for up front (session 35)
  online: { price: null, fiat: null, locked: false }, // the Watch online ticket, in sats; fiat: £ by card, which fills the sats unless locked
  tip: { label: '', price: null },      // always on
  goal: { on: false, amount: null, minutes: 30 }, // all or nothing; refunds itself if missed
  ticket: { on: false, price: null, fiat: null, locked: false }, // the venue ticket in sats; fiat: £, the card price, which fills the sats unless locked
  door: { on: false },                  // door check: the ticket page's QR (new every 30 s) is scanned once at the door (off by default)
  drink: { price: null, mode: 'off' },  // 'off', or 'artist': the artist adds a first drink to the ticket price
  // drink.at: '' (its QR reaches the fan's phone when the show starts) or HH:MM on the gig day (Rajesh 18 Nov: bought
  // days ahead, the drink waits for the night; the coin is paid and locked to the bar's key at the ticket either way).
  drinks: false,                        // the first drink may be on: until after 27 Nov only on a judge's practice gig (setlist.js)
  drinkCoin: false,                     // the drink travels as the coin itself, an animated NUT-16 QR the bar's camera reads (gig 3, 17 Nov)
  goals: [{ label: '', at: null }, { label: '', at: null }], // up to 2 stretch goals, fed by tips (Rajesh 13 Nov: two at most)
  nutzaps: [{ sats: 21, emoji: '⚡' }, { sats: 210, emoji: '⚡' }, { sats: 2100, emoji: '⚡' }], // up to 3 one-tap Nutzaps under the comment box; no amount: no button
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
    set: /^[a-z0-9-]{1,40}$/.test(input.set) ? input.set : '',
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
    tipWords: typeof input.tipWords === 'boolean' ? input.tipWords : input.stream?.mode === 'free',
    chatRows: [5, 10].includes(Number(input.chatRows)) ? Number(input.chatRows) : 3,
    stream: {
      mode: ['ticket', 'pay', 'free', 'off'].includes(input.stream?.mode) ? input.stream.mode : 'pay',
      perMinute: sats(input.stream?.perMinute) ?? sats(input.stream?.price * 6), // `price`: per 10 s, in shows saved before 3 Nov
      freeMinutes: Number.isInteger(Number(input.stream?.freeMinutes)) && Number(input.stream.freeMinutes) >= 1 ? Math.min(30, Number(input.stream.freeMinutes)) : null, // 30 at most: it's on our Stream bill
    },
    // A paid stream only: a free stream with tips has no replay. Shows saved by session 34 ('25', '50', 'own': a price
    // a minute) come back as 'on' at the minimum.
    replay: {
      mode: ['ticket', 'pay'].includes(input.stream?.mode) && ['on', '25', '50', 'own'].includes(input.replay?.mode) ? 'on' : 'off',
      price: input.replay?.perMinute == null ? sats(input.replay?.price) : null,
      fiat: input.replay?.perMinute == null ? pounds(input.replay?.fiat) : null,
      locked: on(input.replay?.locked),
    },
    free: { viewers: (() => { const n = Math.floor(Number(input.free?.viewers)); return n >= 1 && n <= FREE_MAX ? n : null; })() },
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
    // comes back it should lock once a gig's first ticket sells, as the artist's name does. Judges' practice gigs
    // (Frankie's and Your gig, 13–14 Nov) have it: `drinks`, set when the gig opens (setlist.js).
    drinks: on(input.drinks),
    drinkCoin: on(input.drinks) && on(input.drinkCoin),
    drink: { at: TIME.test(input.drink?.at) ? input.drink.at : '', price: sats(input.drink?.price), fiat: pounds(input.drink?.fiat), locked: on(input.drink?.locked), mode: DRINK_LATER && !on(input.drinks) ? 'off' : ['artist', 'venue'].includes(input.drink?.mode) ? 'artist' : 'off' }, // 'venue': before 29 Oct
    goalsThanks: text(input.goalsThanks, 140),
    goals: [0, 1].map((i) => ({ label: text(input.goals?.[i]?.label, 60), at: sats(input.goals?.[i]?.at) })),
    // Shows saved before 13 Nov have none: the three defaults. 21 sats or more each (as a tip), an emoji from the list.
    nutzaps: Array.isArray(input.nutzaps) ? [0, 1, 2].map((i) => { const n = sats(input.nutzaps[i]?.sats); return { sats: n >= 21 ? n : null, emoji: NUTZAP_EMOJI.includes(input.nutzaps[i]?.emoji) ? input.nutzaps[i].emoji : '⚡' }; }) : b.nutzaps,
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
  // Any streamed gig needs its length (session 35): the replay's lowest price and a free stream's cost count hours.
  if (show.stream.mode !== 'off' && !(show.streams && show.lastOrders && showMinutes(show))) problems.push('streamEnds');
  if (UPFRONT && show.stream.mode === 'free' && !show.free.viewers) problems.push('free.viewers');
  if (show.goal.on && !show.goal.amount) problems.push('goal.amount');
  if (show.ticket.on && !show.ticket.price) problems.push('ticket.price');
  if (show.stream.mode === 'ticket' && !show.online.price) problems.push('online.price');
  if (show.drink.mode === 'artist' && !show.drink.price) problems.push('drink.price');
  if (show.drink.mode === 'artist' && show.drink.price && show.ticket.on && show.ticket.price && show.drink.price >= show.ticket.price) problems.push('drink.over'); // the drink comes out of the ticket
  if (show.drink.mode === 'artist' && !(show.date && show.lastOrders)) problems.push('lastOrders');
  return { show, problems };
}

const now = () => new Date().toISOString();

export async function currentShow() {
  const row = await one("SELECT settings, updated FROM shows WHERE id = 'current'");
  const { show, problems } = clean(row ? JSON.parse(row.settings) : blank());
  // No page name yet: on Longy's site the home page; on a stage (whose / is the setlist) /gig, so Plan gig's phone and
  // the fan's tab show the ticket, not the setlist (Rajesh 15 Nov).
  return { show, problems, updated: row?.updated ?? null, path: show.page ? `/${show.page}` : stageDb()?.id ? '/gig' : '/' };
}

// The gig has been: the host ended the night, or its date has gone.
export const gigOver = async (settled) => (await kv.get('stage')) === 'closed' || settled.problems.includes('date.past');

// A finished gig clears itself when the artist gives the next one a date, or presses Finish gig on Takings: tickets,
// chat and stage. Its one-line totals are kept first (Past gigs). Payments stay to collect.
export async function clearGig() {
  await keepGigLine((await kv.get('endedAt')) || undefined);
  await batch([sql('DELETE FROM tickets'), sql('DELETE FROM blinded'), sql('DELETE FROM door_in'), sql('DELETE FROM door_words'), sql('DELETE FROM passkeys'), sql('DELETE FROM nostr'), sql('DELETE FROM drinks'), sql('DELETE FROM live_paid'), sql('DELETE FROM watchers'), sql("DELETE FROM kv WHERE key IN ('freePaid', 'freeFrom', 'liveFrom', 'onAirFrom', 'endedAt', 'stageTimes', 'reachedAt', 'moved', 'gigKey', 'quiet', 'slowAuto', 'slowHeld', 'modSeen')"), sql('UPDATE messages SET deleted = 1')]);
  const at = now();
  await kv.set('nightStart', at); // Takings counts this gig from here
  await kv.set('stage', 'doors');
  await kv.set('stageAt', at);
}

// Finish gig (Takings, once a gig is over; it was Next gig on Plan gig): one tap clears it, as a new date would, and keeps every setting. A date
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

// keep (session 55): a show producer's save. The artist's own fields stay as stored, whatever the page sent: the name
// and page address (Cellar's You), the Lightning address and the splits (who gets paid).
export async function saveShow(input, { keep = false } = {}) {
  const was = await currentShow();
  if (keep) input = { ...input, artist: was.show.artist, page: was.show.page, lightning: was.show.lightning, splits: was.show.splits };
  const { show, problems } = clean(input);
  // A new date on a gig that hasn't happened is a postponement: its tickets stand.
  if (show.date && show.date !== was.show.date && !problems.includes('date.past') && (await gigOver(was))) await clearGig();
  // A new date ends the last gig's replay: the page is the next gig's now (Finish gig alone keeps it, session 34).
  if (show.date && show.date !== was.show.date && (await kv.get('replay', null))) await endReplay();
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
export async function loadTemplate(name, opts = {}) {
  const row = await one('SELECT settings FROM templates WHERE name = ?', String(name ?? ''));
  if (!row) throw new Error('No template by that name.');
  return saveShow(JSON.parse(row.settings), opts);
}

export async function deleteTemplate(name) {
  await run('DELETE FROM templates WHERE name = ?', String(name ?? ''));
  return listTemplates();
}

// A 10-second piece of the recorded set, at the show's rate a minute.
export const piecePrice = (show) => Math.ceil(show.stream.perMinute / 6);

// The show's length in minutes, from the stream's start to its end (past midnight counts). 0: not set.
export function showMinutes(show) {
  if (!TIME.test(show.streams) || !TIME.test(show.lastOrders)) return 0;
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (m(show.lastOrders) - m(show.streams) + 1440) % 1440;
}
const satsOf = (pence, gbp) => (pence > 0 && gbp > 0 ? Math.ceil((pence / 100) * (1e8 / gbp)) : 0);

// The replay's lowest price in pence, by the show's length to the minute, rounded up (PRICING, a Worker secret).
export const replayMinPence = (show, p = PRICING) => {
  const mins = showMinutes(show);
  return p.replayHour || p.replayMin ? Math.max(p.replayMin, Math.ceil((p.replayHour * mins) / 60)) : 0;
};
// The replay's one price, in sats (0: no replay): the artist's, or the minimum if that's more, at today's rate. `pence`
// is what the fan's page shows in pounds: the artist's £ if it's at least the minimum, else the minimum.
export function replayPriceAt(show, gbp, p = PRICING) {
  const r = show.replay;
  if (r?.mode !== 'on' || !['ticket', 'pay'].includes(show.stream.mode)) return { sats: 0, pence: 0, minPence: 0, minSats: 0 };
  const minPence = replayMinPence(show, p);
  const minSats = satsOf(minPence, gbp);
  const own = r.price || 0;
  const sats = Math.max(own, minSats);
  const fiatPence = r.fiat ? Math.round(r.fiat * 100) : 0;
  const pence = sats === own && fiatPence >= minPence && !r.locked ? fiatPence : sats === minSats ? minPence : Math.round((sats * gbp) / 1e6);
  return { sats, pence, minPence, minSats };
}
export async function replayPrice(show) {
  return replayPriceAt(show, (await getRate()).gbp);
}

// A free stream's price, paid up front by the artist: one viewer-hour's cost × the most viewers at once × the show's
// hours plus the spare hour, to the minute, rounded up to the penny.
export const freePence = (show, p = PRICING) => (UPFRONT && show.stream.mode === 'free' && show.free.viewers && showMinutes(show)
  ? Math.ceil((p.viewerHour * show.free.viewers * (showMinutes(show) + SPARE_HOURS * 60)) / 60) : 0);
// What's paid so far (kv freePaid, kept until the gig is cleared) and what's still due, in pence and in sats today.
export async function freeStatus(show) {
  const paid = await kv.get('freePaid', null);
  const pence = freePence(show);
  const due = Math.max(0, pence - (paid?.pence || 0));
  return { pence, due, dueSats: satsOf(due, (await getRate()).gbp), paid, covered: show.stream.mode !== 'free' || due === 0, viewers: show.free.viewers, minutes: showMinutes(show), upfront: UPFRONT };
}

// What a ticket costs and who gets what (Rajesh 19 Nov): the ticket's price is what the fan pays; a first drink the
// artist includes comes out of it, locked to the bar; the rest is the artist's.
export function ticketSplit(show) {
  const total = show.ticket.price || 0;
  const drink = show.drink.mode === 'artist' ? Math.min(show.drink.price || 0, total) : 0;
  return { artist: total - drink, drink, total };
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
// When the drink's QR reaches the fan's phone: when the show starts, or at the artist's time on the gig day.
export const drinkOpen = (show, stage) => stage === 'on' || stage === 'closed' || (() => { const at = ukAt(show.date, show.drink?.at); return !!at && Date.now() / 1000 >= at; })();
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
