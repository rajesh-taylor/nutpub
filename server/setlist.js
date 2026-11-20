// The setlist (agreed Sat 14 Nov): every new stage starts with its own copies of two example gigs, then the artist's
// own. 1. Longy: venue tickets and a flat-fee Watch online ticket, his clip. 2. Frankie Peroni: venue tickets and the
// stream at 60 sats a minute, his first song from The Fickle Pickle. 3. Your gig. One gig at a time is the stage's
// current show; Finish gig on Takings ticks it off and opens the next. They're examples: nothing is sold until the
// artist, as a fan in another tab, buys it. Longy's own stage (thenutpub.com) has no setlist.
// A stage made by a gig card on /judge (Rajesh 14 Nov) holds one gig only: { at, done, only: true }, no next gig.
import { endReplay } from './replay.js';
import { kv, run, one, stageDb } from './db.js';
import { blank, clean, currentShow, clearGig } from './shows.js';
import { usePhotos } from './photo.js';
import { getRate } from './rate.js';
import { satsFrom } from './money.js';
import { seedMods } from './mods.js';
import { addMessage } from './door.js';
import { randomHex } from './http.js';

const ukDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const ukTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

const GIGS = {
  longy: {
    photos: { tall1: '/img/longy-tall.jpg', wide2: '/img/longy-wide.jpg' },
    show: {
      artist: 'Longy', page: 'longy', venue: 'Peggy Sue’s Music Bar', capacity: 100,
      // Online only (Rajesh 15 Nov, late): one Watch online ticket at £20, no venue tickets. His clip is under a minute:
      // a flat fee, never by the minute. Comments, tips and a stretch goal.
      ticket: { on: false, price: null, fiat: null, locked: false },
      stream: { mode: 'ticket', perMinute: null, freeMinutes: null },
      online: { price: null, fiat: 20, locked: false }, hours: 2, // the show's length: every streamed gig has one (session 35)
      goals: [{ label: 'Longy’s next gig streamed in HD', at: null }, { label: '', at: null }], goalsFiat: [16], // £16: the judge's tips fill it (Rajesh 19 Nov)
      tip: { label: 'Tip Longy', price: 2100 },
      nutzaps: [{ sats: 21, emoji: '⚡' }, { sats: 210, emoji: '🎸' }, { sats: 2100, emoji: '🎤' }],
      languages: ['en', 'de', 'es', 'fr', 'pt'],
    },
    // Rajesh 14 Nov: a pinned message per gig, Aaron of Essex as Longy's mod, and his question 5 s into the clip.
    pin: 'Longy’s album: https://fountain.fm/album/NDsFdfoGddTW1qx8Mfds', // Rajesh 19 Nov: his Fountain link only
    mods: [{ name: 'Aaron of Essex', icon: '🎤' }],
    cues: [{ after: 5, mod: { name: 'Aaron of Essex', icon: '🎤' }, text: 'Where\u2019s everyone watching from tonight?' },
      // The answers, one at a time over the next ten seconds, each from a different guest (Rajesh 14 Nov).
      { after: 8, text: 'London 🇬🇧' }, { after: 10.5, text: 'Texas 🇺🇸' }, { after: 13, text: 'Berlin 🇩🇪' }, // flags (Rajesh 19 Nov)
      // Rajesh 18 Nov: a big Nutzap from a Nostr name, a nod to who made it all possible.
      { after: 16, text: 'I approve', sats: 210000, nostr: 'Satoshi 💎🙌', nutzap: true },
      // Rajesh 19 Nov: a fuller chat, four more places and a cheer from a Rod (not that one).
      // Inside his 30-second clip, so they all come the first time through.
      { after: 18, text: 'Dublin 🇮🇪' }, { after: 20.5, text: 'Lisbon 🇵🇹', nostr: 'satsback_sara' },
      { after: 23, text: 'Tokyo 🇯🇵' }, { after: 25.5, text: 'São Paulo 🇧🇷' },
      { after: 28, text: 'Go on Longy! 🎸🎤', nostr: 'Rod (not that one)' }],
  },
  frankie: {
    photos: { tall1: '/img/frankie-tall.jpg', wide1: '/img/frankie-wide.jpg' },
    show: {
      artist: 'Frankie Peroni', page: 'frankie-peroni', venue: 'The Fickle Pickle, Westcliff-on-Sea',
      description: 'The Devils Train, filmed at The Fickle Pickle. Russ Strutter, bass · Levent Basharan, lead guitar solo · Emma Jane Beaumont, backing vocals. Find Frankie on Fountain: frankieperoni@fountain.fm',
      set: 'frankie-1',
      // Pay as you watch (Rajesh 15 Nov, late): 60 sats a minute online, the only way judges pay here. A £30 venue
      // ticket is on sale, with no door check and no drink: those are gig 3's.
      ticket: { on: true, price: null, fiat: 30, locked: false },
      stream: { mode: 'pay', perMinute: 60, freeMinutes: null },
      // Rajesh 20 Nov: no replay for judges (the card shows Off; the Pub Menu's technical page tells it).
      replay: { mode: 'off', price: null, fiat: null, locked: false }, hours: 2,
      tip: { label: 'Tip Frankie', price: 2100 },
    },
    // Rajesh 20 Nov: the pin starts empty; the judge pastes Frankie's Fountain link (gig 2's first step, judge-line.js).
    pin: '',
    // A guest's line half a minute in: a quiet nod to the btc++ Berlin talk on federated mints.
    // Rajesh 18 Nov: a big tip half a minute in, then two Nutzaps from Nostr names, 2 s and 5 s after it.
    cues: [{ after: 30, text: 'Real music, real singer songwriters 🇬🇧', sats: 50000 },
      { after: 32, text: 'What a voice ⚡', sats: 21, nostr: 'southend_sam', nutzap: true },
      { after: 37, text: 'Encore! 🎸', sats: 2100, nostr: 'westcliff_jo', nutzap: true }],
  },
  // Gig 3, Longy at The Fickle Pickle: the fan's night (agreed 16 Nov). Bought weeks ahead on the fan's phone from the
  // gig poster's QR: a £35 venue ticket, £5 of it the first drink (locked to the bar's key until last orders, then
  // Longy's). No door check. The stream is free with tips (the venue ticket plays it too). The judge types Longy's two
  // stretch goals on Plan gig, so they start empty. His 1080p clip from the night (media/sets/longy-2).
  pickle: { photos: { tall1: '/img/pickle-tall.jpg', wide1: '/img/pickle-wide.jpg', wide2: '/img/pickle-cheers.jpg' },
    show: {
      artist: 'Longy', page: 'longy', venue: 'The Fickle Pickle, Westcliff-on-Sea', capacity: 120,
      // Gigs 3 and 4 folded into one (Rajesh 19 Nov): the night at the venue. The judge types the ticket's price, exactly
      // £35, with a pint (£5 at the venue) included in it, and turns on Scan tickets at the door: both start empty and off.
      ticket: { on: true, price: null, fiat: null, locked: false }, door: { on: false },
      drinks: true, drink: { mode: 'artist', price: null }, drinkFiat: 5, drinkCoin: true, // the drink as the coin itself (NUT-16)
      set: 'longy-2', stream: { mode: 'free', perMinute: null, freeMinutes: null },
      free: { viewers: 30 }, hours: 3, // free to watch, paid up front by Longy: a step of its own for judges (session 35)
      goals: [{ label: '', at: null }, { label: '', at: null }],
      tip: { label: 'Tip Longy', price: 2100 },
      nutzaps: [{ sats: 21, emoji: '⚡' }, { sats: 210, emoji: '🎸' }, { sats: 2100, emoji: '🎤' }],
    },
    pin: 'At The Fickle Pickle: your ticket includes a drink on Longy. At home the stream is free: tips welcome.' },
  // Gig 4 (was gig 3; to be reshaped as the staff's night, agreed 16 Nov). At the venue (Rajesh 15 Nov, late; the step
  // keeps its old name, 'yours'): Frankie's second night at The
  // Fickle Pickle, ready-made, the stream free with tips: how most artists, Longy and Frankie among them, work today,
  // so not everything here is a 402. Ticketing with the venue: £30 at the door with the first drink in it, £25 to
  // Frankie and £5 locked to the bar's key until last orders, then Frankie's if it's not poured; the door scans the
  // ticket's QR. Sats from today's rate.
  yours: { photos: { tall1: '/img/yours-tall.jpg', wide1: '/img/yours-wide.jpg' },
    show: {
      artist: 'Frankie Peroni', page: 'frankie-peroni', venue: 'The Fickle Pickle, Westcliff-on-Sea', capacity: 120,
      ticket: { on: true, price: null, fiat: 25, locked: false }, door: { on: true },
      drinks: true, drink: { mode: 'artist', price: null }, drinkFiat: 5,
      set: 'frankie-2', stream: { mode: 'free', perMinute: null, freeMinutes: null },
      free: { viewers: 30 }, hours: 3,
      tip: { label: 'Tip Frankie', price: 2100 },
    },
    pin: 'At The Fickle Pickle: show your ticket at the door, your first drink is on Frankie. At home the stream is free: tips welcome.' },
};
// The home page offers three gigs (Rajesh 19 Nov: gig 4 folded into gig 3; stages.js JUDGE_GIGS). `yours` stays last on
// an artist's own setlist (Put on a gig, parked until after 27 Nov).
export const STEPS = ['longy', 'frankie', 'pickle', 'yours'];

// Puts a gig on the stage as its current show: today's date, the stream open from now, its own photos.
// Your gig comes back as the artist left it (kept aside while an example is done again).
async function open(step, env) {
  await endReplay(); // another gig on the stage: the last one's replay ends
  const kept = step === 'yours' ? await kv.get('yourGig', null) : null;
  const gig = structuredClone(kept || GIGS[step].show);
  // The examples' prices are in pounds: their sats come from today's rate when the gig opens.
  const { gbp } = await getRate();
  for (const p of [gig.ticket, gig.online]) if (p && p.fiat && !p.locked) p.price = satsFrom(p.fiat, gbp);
  if (gig.drinkFiat) Object.assign(gig.drink, { price: satsFrom(gig.drinkFiat, gbp), fiat: gig.drinkFiat });
  (gig.goalsFiat || []).forEach((f, i) => { if (gig.goals?.[i] && f) gig.goals[i].at = satsFrom(f, gbp); });
  // The end (last orders: an unpoured drink goes to the artist then): the gig's hours from now, by midnight at the latest.
  // Every streamed gig needs one (session 35): the replay's lowest price and a free stream's cost count hours.
  const lastOrders = gig.lastOrders || (gig.drinks || gig.stream?.mode !== 'off' ? lastOrdersIn(gig.hours || 3) : '');
  const { show } = clean({ ...blank(), ...gig, date: ukDay(), streams: ukTime(), ...(lastOrders ? { lastOrders } : {}) });
  await run(`INSERT INTO shows (id, settings, updated) VALUES ('current', ?, ?)
             ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`, JSON.stringify(show), new Date().toISOString());
  await usePhotos(env, GIGS[step].photos);
  // The gig's chat: its pinned message and named mods, and the lines that come in by themselves as the set plays.
  if (!kept) { await kv.set('pin', GIGS[step].pin || ''); await seedMods(GIGS[step].mods); }
  await kv.set('cues', GIGS[step].cues || []);
  await kv.set('cued', []);
  const list = await kv.get('setlist', { done: [] });
  await kv.set('setlist', { ...list, at: step, done: list.done || [] });
}

const lastOrdersIn = (hours) => {
  const [h, m] = ukTime().split(':').map(Number);
  const at = Math.min(h * 60 + m + hours * 60, 23 * 60 + 59);
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
};

// A line of the example gig's chat (cues, above), posted once when a viewer's set reaches its second: the fan's page
// asks (POST /api/cue). Only the second it's due at goes to the page; the words come from here. Nothing with comments off.
export const cueTimes = async () => (await kv.get('cues', [])).map((c) => c.after);
export async function cue(n) {
  const c = (await kv.get('cues', []))[n];
  const done = await kv.get('cued', []);
  if (!c || done.includes(n) || !(await currentShow()).show.comments) return false;
  await kv.set('cued', [...done, n]);
  // A pass of its own: in the chat as a mod, a Nostr name or 'guest 3f9a'. A scripted tip shows in the chat only:
  // no coins move, so it never reaches Takings or the stretch goal (both count locked coins).
  const id = await addMessage(randomHex(16), c.text, c.sats || 0, c.mod || null, c.nostr || null);
  // Its Nutzap tag: a row keyed by minus the message's id, so it never meets a real coin's (Takings joins on those).
  if (id && c.nutzap) await run('INSERT INTO nutzaps (locked, message, pubkey, name, event, at) VALUES (?, ?, ?, ?, ?, ?)', -id, id, '', c.nostr || null, '{}', new Date().toISOString());
  return true;
}

// The stage's setlist: { at, done }. A stage made before the setlist (14 Nov) gets it on first look. An example left
// untouched past its day (nothing sold) is put back on today, so it's ready whenever the artist comes back.
// only: the one gig a stage made on /judge holds (on its first look only).
export async function setlist(env, only = null) {
  if (!stageDb()?.id) return null;
  let list = await kv.get('setlist', null);
  if (!list) {
    if (STEPS.includes(only)) await kv.set('setlist', { at: only, done: [], only: true });
    await open(only || 'longy', env);
    return kv.get('setlist');
  }
  if (list.at !== 'yours' && !list.done.includes(list.at)) {
    const { problems } = await currentShow();
    const since = await kv.get('nightStart', '');
    const sold = await one('SELECT (SELECT COUNT(*) FROM tickets) + (SELECT COUNT(*) FROM locked WHERE at >= ?) AS n', since);
    if (problems.includes('date.past') && !sold.n) { await open(list.at, env); list = await kv.get('setlist'); }
  }
  return list;
}

// Finish gig: the gig on now is ticked off, and the next one opens.
export async function finished(env) {
  const list = await kv.get('setlist', null);
  if (!stageDb()?.id || !list) return null;
  const done = list.done.includes(list.at) ? list.done : [...list.done, list.at];
  await kv.set('setlist', { ...list, done });
  if (list.only) return kv.get('setlist'); // one gig: done, and back to /judge
  const next = STEPS.find((s) => !done.includes(s)); // the first not done yet (after a gig done again, it skips ahead)
  if (next) await open(next, env);
  return kv.get('setlist');
}

// Do a gig again (Rajesh 15 Nov: judges go back before moving on): tap a crossed-off line on the setlist. The gig on
// now is cleared as Finish gig clears it (sats waiting on Takings stay there: they're listed until moved); Your gig's
// settings are kept aside for when it comes back. The gig opens fresh and loses its tick until it's finished again.
export async function again(step, env) {
  const list = await kv.get('setlist', null);
  if (!stageDb()?.id || !list || list.only || !STEPS.includes(step)) return null;
  if (list.at === 'yours') await kv.set('yourGig', (await currentShow()).show);
  await clearGig();
  await kv.set('setlist', { ...list, done: list.done.filter((s) => s !== step) });
  await open(step, env);
  return kv.get('setlist');
}
