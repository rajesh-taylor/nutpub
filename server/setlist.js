// The setlist (agreed Sat 14 Nov): every new stage starts with its own copies of two example gigs, then the artist's
// own. 1. Longy: venue tickets and a flat-fee Watch online ticket, his clip. 2. Frankie Peroni: venue tickets and the
// stream at 60 sats a minute, his first song from The Fickle Pickle. 3. Your gig. One gig at a time is the stage's
// current show; Finish gig on Takings ticks it off and opens the next. They're examples: nothing is sold until the
// artist, as a fan in another tab, buys it. Longy's own stage (thenutpub.com) has no setlist.
import { kv, run, one, stageDb } from './db.js';
import { blank, clean, currentShow } from './shows.js';
import { usePhotos } from './photo.js';

const ukDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const ukTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

const GIGS = {
  longy: {
    photos: { tall1: '/img/longy-tall.jpg', wide2: '/img/longy-wide.jpg' },
    show: {
      artist: 'Longy', page: 'longy', venue: 'Peggy Sue’s Music Bar', capacity: 100,
      ticket: { on: true, price: 26869, fiat: 15, locked: false },
      stream: { mode: 'ticket', perMinute: null, freeMinutes: null }, // his clip is under a minute: a flat fee, never by the minute
      online: { price: 8997, fiat: 5, locked: false },
      tip: { label: 'Tip Longy', price: 2100 },
      nutzaps: [{ sats: 21, emoji: '⚡' }, { sats: 210, emoji: '🎸' }, { sats: 2100, emoji: '🎤' }],
      languages: ['en', 'de', 'es', 'fr', 'pt'],
    },
  },
  frankie: {
    photos: { tall1: '/img/frankie-tall.jpg', wide1: '/img/frankie-wide.jpg' },
    show: {
      artist: 'Frankie Peroni', page: 'frankie-peroni', venue: 'The Fickle Pickle, Westcliff-on-Sea',
      description: 'The Devils Train, filmed at The Fickle Pickle. Russ Strutter, bass · Levent Basharan, lead guitar solo · Emma Jane Beaumont, backing vocals. Find Frankie on Fountain: frankieperoni@fountain.fm',
      set: 'frankie-1',
      ticket: { on: true, price: 17912, fiat: 10, locked: false },
      stream: { mode: 'pay', perMinute: 60, freeMinutes: null },
      tip: { label: 'Tip Frankie', price: 2100 },
    },
  },
  // Session 26 fills this in with hints; Frankie's second song is the artist's own show.
  yours: { photos: {}, show: { set: 'frankie-2' } },
};
export const STEPS = ['longy', 'frankie', 'yours'];

// Puts a gig on the stage as its current show: today's date, the stream open from now, its own photos.
async function open(step, env) {
  const { show } = clean({ ...blank(), ...GIGS[step].show, date: ukDay(), streams: ukTime() });
  await run(`INSERT INTO shows (id, settings, updated) VALUES ('current', ?, ?)
             ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated = excluded.updated`, JSON.stringify(show), new Date().toISOString());
  await usePhotos(env, GIGS[step].photos);
  await kv.set('setlist', { at: step, done: (await kv.get('setlist', { done: [] })).done });
}

// The stage's setlist: { at, done }. A stage made before the setlist (14 Nov) gets it on first look. An example left
// untouched past its day (nothing sold) is put back on today, so it's ready whenever the artist comes back.
export async function setlist(env) {
  if (!stageDb()?.id) return null;
  let list = await kv.get('setlist', null);
  if (!list) { await open('longy', env); return kv.get('setlist'); }
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
  await kv.set('setlist', { at: list.at, done });
  const next = STEPS[STEPS.indexOf(list.at) + 1];
  if (next) await open(next, env);
  return kv.get('setlist');
}
