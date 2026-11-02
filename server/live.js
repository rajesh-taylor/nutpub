// Live video through Cloudflare Stream: one live input per artist, made through the Stream API. The account and its
// API token (Stream: Edit) are Worker secrets, STREAM_ACCOUNT and STREAM_TOKEN: nothing about them is in the repo.
// The artist streams to it from Larix or OBS; Stream records each broadcast and deletes it after 30 days.
import QRCode from 'qrcode';
import { kv } from './db.js';
import { current, saveShow } from './shows.js';
import { json } from './http.js';

let ACCOUNT = '';
let TOKEN = '';
export const useStream = (env) => { ACCOUNT = env.STREAM_ACCOUNT || ''; TOKEN = env.STREAM_TOKEN || ''; };

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
    recording: { mode: 'automatic', requireSignedURLs: false }, // signed playback comes with the gate
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

export function mountLive(route, admin) {
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
