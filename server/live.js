// Live video through Cloudflare Stream: one live input per artist, made through the Stream API. The account and its
// API token (Stream: Edit) are Worker secrets, STREAM_ACCOUNT and STREAM_TOKEN: nothing about them is in the repo.
// The artist streams to it from Larix or OBS; Stream records each broadcast. closing.js deletes each recording 7 days
// after it was made (Stream's own setting can't go below 30 days, kept as a backstop).
import QRCode from 'qrcode';
import { kv, stageDb } from './db.js';
import { MINT_TEST } from './config.js';
import { current, showOf, saveShow, stageNow } from './shows.js';
import { one, all, run } from './db.js';
import { cashuGate } from './gate.js';
import { artistKey } from './takings.js';
import { hasTicket } from './door.js';
import { modOf } from './mods.js';
import { json } from './http.js';

let ACCOUNT = '';
let TOKEN = '';
let KEY_ID = '';
let KEY_JWK = '';
export const useStream = (env) => {
  ACCOUNT = env.STREAM_ACCOUNT || ''; TOKEN = env.STREAM_TOKEN || '';
  KEY_ID = env.STREAM_KEY_ID || ''; KEY_JWK = env.STREAM_KEY_JWK || '';
};

async function stream(method, path, data) {
  if (!ACCOUNT || !TOKEN) throw new Error('Stream isn’t set up: the Worker secrets STREAM_ACCOUNT and STREAM_TOKEN are missing.');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(10000),
  });
  const out = await res.json().catch(() => ({}));
  if (!out.success) throw Object.assign(new Error(out.errors?.[0]?.message || `Stream said ${res.status}`), { status: res.status });
  return out.result;
}

// The artist's live input: made once, then read back. Deleted in the dashboard: a new one.
export async function liveInput(page) {
  const uid = await kv.get(`live:${page}`);
  if (uid) {
    try { return await stream('GET', `/live_inputs/${uid}`); } catch (e) { if (e.status !== 404) throw e; }
  }
  const input = await stream('POST', '/live_inputs', {
    meta: { name: `nutpub-${stageDb()?.id ? `${stageDb().id}-` : ''}${page}` },
    recording: { mode: 'automatic', requireSignedURLs: true }, // the plain link is refused: only a token plays it
    deleteRecordingAfterDays: 30,
  });
  await kv.set(`live:${page}`, input.uid);
  console.log(`live input made for /${page}`);
  return input;
}

// The artist's recordings (one a broadcast), and deleting one: closing.js deletes each 7 days after it was made.
export async function recordings() {
  const uids = (await all("SELECT value FROM kv WHERE key LIKE 'live:%'")).map((r) => JSON.parse(r.value));
  const out = [];
  for (const uid of uids.filter(Boolean)) out.push(...(await stream('GET', `/live_inputs/${uid}/videos`)));
  return out;
}
export const deleteRecording = (uid) => stream('DELETE', `/${uid}`);

// Practice stages (every <id>.thenutpub.com) stop a stream 20 minutes after it first comes on air in a gig: Stream bills
// by the minute, and a phone left streaming for hours would run up the bill. The input is switched off (Stream refuses
// the phone), by whichever comes first: a page asking (liveNow) or the stage's alarm. A new gig switches it back on.
export const PRACTICE_MINUTES = 20;
const enable = (uid, on) => stream('PUT', `/live_inputs/${uid}`, { enabled: on });
async function practiceCap(uid, input, live) {
  const st = stageDb();
  if (!st?.id) return live;
  let from = await kv.get('onAirFrom');
  if (!from && input.enabled === false) await enable(uid, true); // a new gig: on again (it shows as live at the next ask)
  if (live && !from) { from = await kv.set('onAirFrom', seconds()); await st.alarmAt?.(Date.now() + PRACTICE_MINUTES * 60_000 + 5_000); }
  if (from && seconds() - from >= PRACTICE_MINUTES * 60) {
    if (input.enabled !== false) await enable(uid, false);
    return false;
  }
  return live;
}
// The stage's alarm: 20 minutes on, switch its stream off, whether or not anyone is looking.
export async function stopPractice() {
  const from = await kv.get('onAirFrom');
  if (!stageDb()?.id || !from || seconds() - from < PRACTICE_MINUTES * 60 - 30) return;
  for (const r of await all("SELECT value FROM kv WHERE key LIKE 'live:%'")) {
    try { await enable(JSON.parse(r.value), false); } catch (e) { console.log(`practice stop: ${String(e.message || e).slice(0, 120)}`); }
  }
}

// Is the artist streaming right now? Stream's word on the input, asked at most every 10 s per Worker: every phone
// polls the stage every 2 s, and that mustn't become a Stream API call each time.
const ON_AIR = ['connected', 'reconnected'];
const onAir = new Map(); // per stage: { live, at }
export async function liveNow(page) {
  if (!page || !ACCOUNT || !TOKEN) return false;
  const seen = onAir.get(`${stageDb()?.id ?? ''}/${page}`);
  if (seen && Date.now() - seen.at < 10_000) return seen.live;
  let live = false;
  try {
    const uid = await kv.get(`live:${page}`);
    if (uid) {
      const input = await stream('GET', `/live_inputs/${uid}`);
      live = await practiceCap(uid, input, ON_AIR.includes(input.status?.current?.state ?? input.status));
    }
  } catch (e) {
    console.log(`live status: ${String(e.message || e).slice(0, 120)}`);
  }
  onAir.set(`${stageDb()?.id ?? ''}/${page}`, { live, at: Date.now() });
  return live;
}

// Larix Grove: one link (or its QR) sets Larix up: where to stream, 720p, a keyframe every 4 s (Stream wants ≤ 8),
// and Larix's own copy on the phone off, so a gig doesn't fill it. Scanned again: it replaces the one of that name.
// Larix keeps any other connection ticked, and streams to every ticked one.
export const larixLink = ({ server, key }, name) => 'larix://set/v1?'
  + `conn[][url]=${encodeURIComponent(server + key)}&conn[][name]=${encodeURIComponent(name)}&conn[][overwrite]=on`
  + '&enc[vid][res]=1280x720&enc[vid][keyframe]=4&enc[record][enabled]=off';

// A playback token, signed here with the signing key (RS256): no API call, so no rate limit. It goes in the link in
// place of the video's id, and stops working at `exp` (Unix seconds).
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const utf8 = new TextEncoder();
let signer = null;
export async function signToken(sub, exp) {
  signer ??= crypto.subtle.importKey('jwk', JSON.parse(atob(KEY_JWK)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const part = (o) => b64url(utf8.encode(JSON.stringify(o)));
  const signed = `${part({ alg: 'RS256', kid: KEY_ID })}.${part({ sub, kid: KEY_ID, exp })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signer, utf8.encode(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

// The gate on the live picture. A token for the input's id lasts 80 s, and a paid 402 every minute renews it: the 20 s
// between is slack for a slow payment. Once it runs out Stream refuses the playlists and the segments, so the picture
// stops with no word from here. Stream's segment links carry their own signature, so only the playlists need a new token.
const MINUTE = 60;
const SLACK = 20;
const FREE_FOR = 60; // a ticket or a free show: nothing to pay, so a longer token, renewed every 30 s
const seconds = () => Math.floor(Date.now() / 1000);
const liveLink = async (show, exp) => {
  const uid = await kv.get(`live:${show.page}`);
  return show.live.playback.replace(uid, await signToken(uid, exp));
};

// A seat at the live picture, so Stream's bill has a ceiling. One row per pass, kept for a little longer than the
// longest gap between renewals. Who counts: everyone on a free stream, and on the test mint everyone (test sats cost
// nothing, Stream's minutes do). People already watching are never turned away. A ticket opens one screen at a time:
// the newest takes over (`start=1` on its first token) and the old one is told at its next renewal.
export const VIEWER_LIMIT = 10;
const FREE_HOURS = 3; // from the night's first free viewer; New night starts it again
const SEAT = 90;
export async function takeSeat(c, show, ticketed) {
  const t = seconds();
  const free = show.stream.mode === 'free';
  if (free) {
    const from = (await kv.get('freeFrom')) ?? (await kv.set('freeFrom', t));
    if (t - from > FREE_HOURS * 3600) return json({ error: 'free_over', detail: 'This free stream has run its three hours.' }, 409);
  }
  const screen = c.req.headers.get('X-Screen') || '';
  const mine = await one('SELECT screen FROM watchers WHERE pass = ? AND until > ?', c.pass, t);
  if (ticketed && mine && mine.screen !== screen && c.url.searchParams.get('start') !== '1') {
    return json({ error: 'moved', detail: 'Now playing on another screen.' }, 409);
  }
  if (!mine && (free || MINT_TEST)) {
    const { n } = await one('SELECT COUNT(*) AS n FROM watchers WHERE until > ?', t);
    if (n >= VIEWER_LIMIT) return json({ error: 'full', detail: 'This stream is full. Try again in a minute.' }, 409);
  }
  await run(`INSERT INTO watchers (pass, screen, until) VALUES (?, ?, ?)
             ON CONFLICT(pass) DO UPDATE SET screen = excluded.screen, until = excluded.until`, c.pass, screen, t + SEAT);
  return null;
}

// Free, then paid (Pay as you watch only): the first minutes are free for everyone, timed from the first moment the
// stream is both on air and public (a sound check before the start time doesn't count). One clock for the night: a
// dropped stream doesn't restart it; the next gig does (clearGig). Returns when the free part ends (server seconds),
// null while it hasn't started, undefined when the gig has no free minutes.
export async function freeUntil(show, stage, live) {
  const mins = show.stream.mode === 'pay' && show.stream.freeMinutes;
  if (!mins) return undefined;
  let from = await kv.get('liveFrom');
  if (!from && live && (stage === 'open' || stage === 'on')) from = await kv.set('liveFrom', seconds());
  return from ? from + mins * 60 : null;
}

export function mountLive(route, admin, pass) {
  route('GET', '/api/live/token', pass,
    async (c) => {
      const show = await showOf(c);
      if (!show.live.playback || !(await liveNow(show.page))) return json({ error: 'not_live' }, 409); // never charged for nothing
      const stage = await stageNow(show);
      if (stage === 'closed') return json({ error: 'closed', detail: 'The show has ended.' }, 409);
      if (show.stream.mode === 'off') return json({ error: 'not_streamed', detail: 'This gig isn’t streamed.' }, 409);
      // A moderator watches from before the start time, free, and takes none of the viewers' places.
      if (await modOf(c)) return json({ url: await liveLink(show, seconds() + FREE_FOR), every: 30 });
      // Before the start time the artist may be streaming (a sound check): nobody watches it, so nobody pays for it.
      if (stage === 'doors') return json({ error: 'soon', detail: 'The stream hasn’t started yet.' }, 409);
      if (show.stream.mode === 'off') return json({ error: 'not_streamed', detail: 'This gig isn’t streamed.' }, 409);
      const ticketed = await hasTicket(c.pass);
      if (show.stream.mode === 'ticket' && !ticketed) return json({ error: 'no_ticket', detail: 'Buy a ticket to watch online.' }, 403);
      if (show.stream.mode === 'pay' && !ticketed && !show.stream.perMinute) return json({ error: 'not_ready', detail: 'No price a minute set yet.' }, 409);
      const refused = await takeSeat(c, show, ticketed); // before any payment: nobody pays for a seat they can't have
      if (refused) return refused;
      if (show.stream.mode === 'free' || ticketed) return json({ url: await liveLink(show, seconds() + FREE_FOR), every: 30 });
      // The free minutes: a token that runs out when they do. After them, a viewer who hasn't said yes to paying
      // (X-Free-Only) is told so instead of being asked for a payment their page would make by itself.
      const freeEnd = await freeUntil(show, stage, true);
      if (freeEnd) {
        const left = freeEnd - seconds();
        if (left > 0) return json({ url: await liveLink(show, freeEnd), every: Math.min(30, left), freeUntil: freeEnd });
        if (c.req.headers.get('X-Free-Only')) return json({ error: 'free_over', freeUntil: freeEnd }, 409);
      }
      // Still inside a paid minute (a rejoin, or a lost reply asked for again): the same token, no charge.
      const last = await one('SELECT until, sats FROM live_paid WHERE pass = ?', c.pass);
      const left = last ? last.until - SLACK - seconds() : 0;
      if (left > 0) return json({ url: await liveLink(show, last.until), every: left, spent: last.sats });
      return null;
    },
    cashuGate(async (c) => (await showOf(c)).stream.perMinute, async (c) => `${(await showOf(c)).title || 'The show'}: a minute live`,
      { lockTo: artistKey, kind: 'piece' }),
    async (c) => {
      const until = seconds() + MINUTE + SLACK;
      await run(`INSERT INTO live_paid (pass, until, sats) VALUES (?, ?, ?)
                 ON CONFLICT(pass) DO UPDATE SET until = excluded.until, sats = sats + excluded.sats`, c.pass, until, c.paid);
      const { sats } = await one('SELECT sats FROM live_paid WHERE pass = ?', c.pass);
      return json({ url: await liveLink(await showOf(c), until), every: MINUTE, spent: sats, paid: c.paid });
    });

  // The artist's own look at the stream on Show Time, before and during the show: no seat, no charge. Renewed every
  // minute; the token lasts two.
  route('GET', '/api/admin/live/preview', admin, async (c) => {
    const show = await showOf(c);
    if (!show.live.playback || !(await liveNow(show.page))) return json({ off: true });
    return json({ url: await liveLink(show, seconds() + 2 * MINUTE), every: MINUTE });
  });

  // Make (or read back) the artist's stream: its server and key go into the show, on the host's pages only.
  route('POST', '/api/admin/live', admin, async (c) => {
    const { show } = await current(c);
    if (!show.page) return json({ error: 'Give the artist a name first: the stream is made for their page.' }, 400);
    try {
      const input = await liveInput(show.page);
      return json(await saveShow({ ...show, live: { server: input.rtmps.url, key: input.rtmps.streamKey, playback: input.playback?.hls || show.live.playback } }));
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  });

  // The Larix link and its QR. Host only: both carry the stream key.
  route('GET', '/api/admin/live/larix', admin, async (c) => {
    const { show } = await current(c);
    if (!show.live.server || !show.live.key) return json({ error: 'No stream yet: press Make my stream.' }, 409);
    const link = larixLink(show.live, `NutPub · ${show.artist || show.page}`);
    const svg = await QRCode.toString(link, { type: 'svg', margin: 2, color: { dark: '#050914', light: '#efe3c8' } });
    return json({ link, svg });
  });
}
