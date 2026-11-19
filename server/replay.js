// Replays (sessions 34-35, agreed with Rajesh 19 Nov). After End night the gig page plays the night again until the
// recording is deleted, 7 days after the broadcast (closing.js): ticket holders free, everyone else for one price
// (Plan gig's Replay card, shows.js replayPrice), one 402 locked to the artist's key. Either way each pass watches it
// twice through at most (WATCH_TIMES): watching time up to twice the recording's length. Live payments don't count. A gig that went out live plays Stream's recording of it; a judge's gig (a clip,
// never live) plays its clip again from the start. Nothing new is kept and nothing is kept longer: the replay's rows
// go when it ends.
import { one, run, kv, sql, batch, stageDb } from './db.js';
import { currentShow, replayPrice, showOf, stageNow, showMinutes, WATCH_TIMES } from './shows.js';
import { closesAt } from './stages.js';
import { json } from './http.js';
import { cashuGate } from './gate.js';
import { artistKey } from './takings.js';
import { recordings, signToken } from './live.js';

const DAY = 86_400_000;
const KEEP = 7 * DAY;
const seconds = () => Math.floor(Date.now() / 1000);
const TABLES = ['replay_free', 'replay_bought', 'replay_pieces'];

// End night: the replay starts if the gig has one. Who held a ticket then watches it free. The rate is read afresh
// each time (the artist may change it, or turn it off, on Plan gig).
export async function startReplay() {
  const { show } = await currentShow();
  if (!(await replayPrice(show)).sats) return endReplay();
  const ended = (await kv.get('endedAt')) || new Date().toISOString();
  const closes = closesAt(stageDb()?.made); // a judge's stage closes 7 days after it was made
  let until = new Date(Date.parse(ended) + KEEP).toISOString();
  if (closes && closes < until) until = closes;
  await batch([...TABLES.map((t) => sql(`DELETE FROM ${t}`)), sql('INSERT OR IGNORE INTO replay_free (pass) SELECT pass FROM tickets')]);
  return kv.set('replay', { start: await kv.get('nightStart', ''), ended, until, recorded: !!(await kv.get('reachedAt')), deleted: null });
}

// The replay is over (a new date, another gig on a judge's stage, or 7 days on): its rows go with it.
export async function endReplay() {
  await batch([...TABLES.map((t) => sql(`DELETE FROM ${t}`)), sql("DELETE FROM kv WHERE key = 'replay'")]);
  return null;
}

// The artist deleted the recording on Your takings: the replay ends now, and fans' pages say why.
export async function recordingDeleted(created) {
  const r = await kv.get('replay', null);
  if (r?.recorded && !r.deleted && (!r.start || created >= r.start)) await kv.set('replay', { ...r, deleted: new Date().toISOString() });
}

// What the gig page needs: 'on' (with the price and the days left), 'gone' (7 days on), 'deleted' (by the artist).
// Null: no replay (none set, turned off, or a new gig has started).
export async function replayNow(show = null) {
  const r = await kv.get('replay', null);
  if (!r) return null;
  show ??= (await currentShow()).show;
  const { sats, pence } = await replayPrice(show);
  const left = Date.parse(r.until) - Date.now();
  const state = r.deleted ? 'deleted' : left <= 0 ? 'gone' : sats ? 'on' : null;
  if (!state) return null;
  return { state, price: sats, pence, times: WATCH_TIMES, days: Math.max(0, Math.ceil(left / DAY)), until: r.until, recorded: r.recorded, start: r.start };
}

// The replay is what plays now: it's on, and no new gig has opened its stream (Start stream ends it, door.js).
export async function replayPlaying(c) {
  const show = await showOf(c);
  const r = await replayNow(show);
  return r?.state === 'on' && !['open', 'on'].includes(await stageNow(show)) ? r : null;
}

// closing.js, once a day: a replay past its end clears itself.
export async function closeReplay(at = Date.now()) {
  const r = await kv.get('replay', null);
  if (r && Date.parse(r.until) + DAY < at) await endReplay();
}

export const replayFree = async (pass) => !!(await one('SELECT 1 AS x FROM replay_free WHERE pass = ?', pass))
  || !!(await one('SELECT 1 AS x FROM tickets WHERE pass = ?', pass));
// Has this pass bought the replay (or, with a ticket, been let in free: sats 0)? And has it watched its two times?
export const replayBought = (pass) => one('SELECT sats, watched, until FROM replay_bought WHERE pass = ?', pass);
const letIn = (pass, sats) => run('INSERT OR IGNORE INTO replay_bought (pass, sats, watched, until) VALUES (?, ?, 0, 0)', pass, sats);
// For the gig page: whether this pass watches free (a ticket) or has bought it.
export async function replayFor(r, pass) {
  if (!r || !pass) return r;
  return { ...r, free: await replayFree(pass), bought: !!(await replayBought(pass)) };
}

// The clip's replay (set.js): from the top, each 10-second piece at most WATCH_TIMES times over (piece n < twice the
// clip's pieces). Free with a ticket or once bought; no payment per piece.
export const replayPieceSeen = async (pass, n) => !!(await one('SELECT 1 AS x FROM replay_pieces WHERE pass = ? AND piece = ?', pass, n));
export const replayPieceNext = async (pass) => (await one('SELECT COALESCE(MAX(piece) + 1, 0) AS n FROM replay_pieces WHERE pass = ?', pass)).n;
export const replayPieceKeep = (pass, n) => run('INSERT OR IGNORE INTO replay_pieces (pass, piece, sats, at) VALUES (?, ?, 0, ?)', pass, n, new Date().toISOString());
// May this pass play the clip's piece n now? 'ok', 'unpaid' (buy first) or 'watched' (twice through already).
export async function replayPieceOk(pass, n, clipPieces) {
  if (!(await replayFree(pass)) && !(await replayBought(pass))) return 'unpaid';
  if (n >= WATCH_TIMES * clipPieces && !(await replayPieceSeen(pass, n))) return 'watched';
  return 'ok';
}

// The recording of the night: Stream's longest finished part since the gig began (a dropped stream makes several).
async function nightVideo(r) {
  const vs = (await recordings()).filter((v) => (!r.start || v.created >= r.start) && v.status?.state !== 'live-inprogress' && v.playback?.hls);
  return vs.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0] || null;
}
const videoLink = async (v, exp) => v.playback.hls.replace(v.uid, await signToken(v.uid, exp));

// The recording's token: five minutes at a time, each counted towards the watching limit (twice the recording's
// length; the show's planned length if Stream doesn't know it yet). Bought once (or free with a ticket).
const STEP = 300;
const SLACK = 20;
const limitOf = (v, show) => WATCH_TIMES * (v.duration > 0 ? Math.ceil(v.duration) : showMinutes(show) * 60);
export function mountReplay(route, pass) {
  // The replay's one payment: the 402 for the whole replay, locked to the artist's key. A ticket lets you in free.
  route('GET', '/api/replay/buy', pass,
    async (c) => {
      const r = await replayNow();
      if (!r) return json({ error: 'no_replay' }, 409);
      if (r.state !== 'on') return json({ error: r.state }, 410);
      if (await replayBought(c.pass)) return json({ bought: true });
      if (await replayFree(c.pass)) { await letIn(c.pass, 0); return json({ bought: true, free: true }); }
      c.price = r.price;
      return null;
    },
    cashuGate((c) => c.price, async (c) => `${(await showOf(c)).title || 'The show'}: the replay, twice through`, { lockTo: artistKey, kind: 'replay' }),
    async (c) => {
      await letIn(c.pass, c.paid);
      return json({ bought: true, paid: c.paid });
    });

  route('GET', '/api/replay/token', pass, async (c) => {
    const r = await replayNow();
    if (!r) return json({ error: 'no_replay' }, 409);
    if (r.state !== 'on') return json({ error: r.state }, 410);
    if (!r.recorded) return json({ error: 'clip', detail: 'This gig’s replay is its clip.' }, 409);
    if (!(await replayBought(c.pass))) {
      if (!(await replayFree(c.pass))) return json({ error: 'replay_unpaid', detail: 'Buy the replay first.' }, 403);
      await letIn(c.pass, 0);
    }
    let v;
    try { v = await nightVideo(r); } catch (e) { return json({ error: 'stream', detail: String(e.message || e) }, 502); }
    if (!v) return json({ error: 'gone' }, 410);
    const b = await replayBought(c.pass);
    const t = seconds();
    if (b.until - SLACK > t) return json({ url: await videoLink(v, b.until), every: b.until - SLACK - t });
    const limit = limitOf(v, (await currentShow()).show);
    if (b.watched >= limit) return json({ error: 'watched', detail: 'You’ve watched it twice through.' }, 409);
    const until = t + STEP + SLACK;
    await run('UPDATE replay_bought SET watched = watched + ?, until = ? WHERE pass = ?', STEP, until, c.pass);
    return json({ url: await videoLink(v, until), every: STEP });
  });
}
