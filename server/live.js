// Live video through Cloudflare Stream: one live input per artist, made through the Stream API. The account and its
// API token (Stream: Edit) are Worker secrets, STREAM_ACCOUNT and STREAM_TOKEN: nothing about them is in the repo.
// The artist streams to it from Larix or OBS; Stream records each broadcast and deletes it after 30 days.
import QRCode from 'qrcode';
import { kv } from './db.js';
import { current, showOf, saveShow } from './shows.js';
import { one, run } from './db.js';
import { cashuGate } from './gate.js';
import { artistKey } from './takings.js';
import { hasTicket } from './door.js';
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
    meta: { name: `nutpub-${page}` },
    recording: { mode: 'automatic', requireSignedURLs: true }, // the plain link is refused: only a token plays it
    deleteRecordingAfterDays: 30,
  });
  await kv.set(`live:${page}`, input.uid);
  console.log(`live input made for /${page}`);
  return input;
}

// Is the artist streaming right now? Stream's word on the input, asked at most every 10 s per Worker: every phone
// polls the stage every 2 s, and that mustn't become a Stream API call each time.
const ON_AIR = ['connected', 'reconnected'];
let onAir = { page: '', live: false, at: 0 };
export async function liveNow(page) {
  if (!page || !ACCOUNT || !TOKEN) return false;
  if (onAir.page === page && Date.now() - onAir.at < 10_000) return onAir.live;
  let live = false;
  try {
    const uid = await kv.get(`live:${page}`);
    if (uid) {
      const input = await stream('GET', `/live_inputs/${uid}`);
      live = ON_AIR.includes(input.status?.current?.state ?? input.status);
    }
  } catch (e) {
    console.log(`live status: ${String(e.message || e).slice(0, 120)}`);
  }
  onAir = { page, live, at: Date.now() };
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

// The gate on the live picture. A token for the input's id lasts 30 s, and a paid 402 every 10 s renews it: the 20 s
// between is slack for a slow payment. Once it runs out Stream refuses the playlists and the segments, so the picture
// stops with no word from here. Stream's segment links carry their own signature, so only the playlists need a new token.
const PAID_FOR = 30;
const REPEAT_WITHIN = 8; // a request this soon after a payment is a lost reply asked for again: same token time, no charge
const FREE_FOR = 60; // a ticket or a free show: nothing to pay, so a longer token, renewed every 30 s
const seconds = () => Math.floor(Date.now() / 1000);
const liveLink = async (show, exp) => {
  const uid = await kv.get(`live:${show.page}`);
  return show.live.playback.replace(uid, await signToken(uid, exp));
};

export function mountLive(route, admin, pass) {
  route('GET', '/api/live/token', pass,
    async (c) => {
      const show = await showOf(c);
      if (!show.live.playback || !(await liveNow(show.page))) return json({ error: 'not_live' }, 409); // never charged for nothing
      if (show.stream.mode === 'free' || (await hasTicket(c.pass))) return json({ url: await liveLink(show, seconds() + FREE_FOR), every: 30 });
      if (!show.stream.price) return json({ error: 'not_ready', detail: 'No price per 10 s set yet.' }, 409);
      const last = await one('SELECT until, sats FROM live_paid WHERE pass = ?', c.pass);
      if (last && last.until - seconds() > PAID_FOR - REPEAT_WITHIN) return json({ url: await liveLink(show, last.until), every: 10, spent: last.sats });
      return null;
    },
    cashuGate(async (c) => (await showOf(c)).stream.price, async (c) => `${(await showOf(c)).title || 'The show'}: 10 seconds live`,
      { lockTo: artistKey, kind: 'piece' }),
    async (c) => {
      const until = seconds() + PAID_FOR;
      await run(`INSERT INTO live_paid (pass, until, sats) VALUES (?, ?, ?)
                 ON CONFLICT(pass) DO UPDATE SET until = excluded.until, sats = sats + excluded.sats`, c.pass, until, c.paid);
      const { sats } = await one('SELECT sats FROM live_paid WHERE pass = ?', c.pass);
      return json({ url: await liveLink(await showOf(c), until), every: 10, spent: sats, paid: c.paid });
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
