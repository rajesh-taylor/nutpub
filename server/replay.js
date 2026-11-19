// Replays (session 34, agreed with Rajesh 19 Nov). After End night the gig page plays the night again until the
// recording is deleted, 7 days after the broadcast (closing.js): ticket holders free, everyone else by the minute at
// the replay rate (Plan gig's Replay card, shows.js replayRate), through the usual 402, locked to the artist's key.
// Minutes paid live don't carry over. A gig that went out live plays Stream's recording of it; a judge's gig (a clip,
// never live) plays its clip again from the start. Nothing new is kept and nothing is kept longer: the replay's rows
// go when it ends.
import { one, run, kv, sql, batch, stageDb } from './db.js';
import { currentShow, replayPrice, showOf, stageNow } from './shows.js';
import { closesAt } from './stages.js';
import { json } from './http.js';
import { cashuGate } from './gate.js';
import { artistKey } from './takings.js';
import { recordings, signToken } from './live.js';

const DAY = 86_400_000;
const KEEP = 7 * DAY;
const seconds = () => Math.floor(Date.now() / 1000);
const TABLES = ['replay_free', 'replay_paid', 'replay_pieces'];

// End night: the replay starts if the gig has one. Who held a ticket then watches it free. The rate is read afresh
// each time (the artist may change it, or turn it off, on Plan gig).
export async function startReplay() {
  const { show } = await currentShow();
  if (!(await replayPrice(show)).rate) return endReplay();
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

// What the gig page needs: 'on' (with the rate and the days left), 'gone' (7 days on), 'deleted' (by the artist).
// Null: no replay (none set, turned off, or a new gig has started).
export async function replayNow(show = null) {
  const r = await kv.get('replay', null);
  if (!r) return null;
  show ??= (await currentShow()).show;
  const { rate } = await replayPrice(show);
  const left = Date.parse(r.until) - Date.now();
  const state = r.deleted ? 'deleted' : left <= 0 ? 'gone' : rate ? 'on' : null;
  if (!state) return null;
  return { state, rate, days: Math.max(0, Math.ceil(left / DAY)), until: r.until, recorded: r.recorded, start: r.start };
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

// The clip's replay (set.js): has this pass paid for piece n of the replay? Live pieces don't count.
export const replayPiecePaid = async (pass, n) => !!(await one('SELECT 1 AS x FROM replay_pieces WHERE pass = ? AND piece = ?', pass, n));
export const replayPieceNext = async (pass) => (await one('SELECT COALESCE(MAX(piece) + 1, 0) AS n FROM replay_pieces WHERE pass = ?', pass)).n;
export const replayPieceKeep = (pass, n, sats) => run('INSERT OR IGNORE INTO replay_pieces (pass, piece, sats, at) VALUES (?, ?, ?, ?)', pass, n, sats, new Date().toISOString());
export const replaySpent = async (pass) => (await one(`SELECT (SELECT COALESCE(SUM(sats), 0) FROM replay_pieces WHERE pass = ?1)
  + (SELECT COALESCE(SUM(sats), 0) FROM replay_paid WHERE pass = ?1) AS sats`, pass)).sats;

// The recording of the night: Stream's longest finished part since the gig began (a dropped stream makes several).
async function nightVideo(r) {
  const vs = (await recordings()).filter((v) => (!r.start || v.created >= r.start) && v.status?.state !== 'live-inprogress' && v.playback?.hls);
  return vs.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0] || null;
}
const videoLink = async (v, exp) => v.playback.hls.replace(v.uid, await signToken(v.uid, exp));

// The recording's token, as live: a minute paid buys a token for 80 s; a ticket's lasts an hour and is renewed.
const MINUTE = 60;
const SLACK = 20;
export function mountReplay(route, pass) {
  route('GET', '/api/replay/token', pass,
    async (c) => {
      const r = await replayNow();
      if (!r) return json({ error: 'no_replay' }, 409);
      if (r.state !== 'on') return json({ error: r.state }, 410);
      if (!r.recorded) return json({ error: 'clip', detail: 'This gig’s replay is its clip.' }, 409);
      let v;
      try { v = await nightVideo(r); } catch (e) { return json({ error: 'stream', detail: String(e.message || e) }, 502); }
      if (!v) return json({ error: 'gone' }, 410);
      c.video = v;
      c.rate = r.rate;
      if (await replayFree(c.pass)) return json({ url: await videoLink(v, seconds() + 60 * MINUTE), every: 30 * MINUTE, free: true });
      const last = await one('SELECT until, sats FROM replay_paid WHERE pass = ?', c.pass);
      const left = last ? last.until - SLACK - seconds() : 0;
      if (left > 0) return json({ url: await videoLink(v, last.until), every: left, spent: last.sats });
      return null;
    },
    cashuGate((c) => c.rate, async (c) => `${(await showOf(c)).title || 'The show'}: a minute of the replay`, { lockTo: artistKey, kind: 'replay' }),
    async (c) => {
      const until = seconds() + MINUTE + SLACK;
      await run(`INSERT INTO replay_paid (pass, until, sats) VALUES (?, ?, ?)
                 ON CONFLICT(pass) DO UPDATE SET until = excluded.until, sats = sats + excluded.sats`, c.pass, until, c.paid);
      const { sats } = await one('SELECT sats FROM replay_paid WHERE pass = ?', c.pass);
      return json({ url: await videoLink(c.video, until), every: MINUTE, spent: sats, paid: c.paid });
    });
}
