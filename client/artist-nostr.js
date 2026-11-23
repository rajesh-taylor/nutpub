// Nutzaps are always on (Rajesh 12 Nov): the artist's own pages (Show Time, Takings) send the "Nutzap me here" note
// (NIP-61, kind 10019) by themselves whenever the NutPub has none for the artist's current key: the test mint, the key
// tips are locked to (the one Takings collects with) and a few public relays. Signed with a Nostr key made for the
// artist in this browser, quietly (an extension would pop up a question on every page). Losing that key costs
// nothing: the money is locked to the wallet key, and the next page simply sends a new note.
// Session 55d: the same key signs the gig's live listing (NIP-53, kind 30311) on Show Time (listLive, below).
import { publish } from './nostr.js';

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const KEY = 'nutpub-artist-nostr';
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));

// This browser's artist Nostr key (made the first time, if `make`), as bytes; null if there's none.
async function nostrKey(make) {
  let sk = null;
  try { sk = localStorage.getItem(KEY); } catch {}
  if (/^[0-9a-f]{64}$/.test(sk || '')) return bytes(sk);
  if (!make) return null;
  const { generateSecretKey } = await import('nostr-tools/pure');
  sk = hex(generateSecretKey());
  try { localStorage.setItem(KEY, sk); } catch {}
  return bytes(sk);
}

export async function nutzapsOn(api, artistKey) {
  const { on } = await api('GET', '/api/admin/nutzap-info');
  if (on || !artistKey) return on;
  const { finalizeEvent } = await import('nostr-tools/pure');
  const sk = await nostrKey(true);
  const { mint } = await fetch('/api/health').then((r) => r.json());
  const event = finalizeEvent({ kind: 10019, created_at: Math.floor(Date.now() / 1000), content: '',
    tags: [...RELAYS.map((r) => ['relay', r]), ['mint', mint.url, 'sat'], ['pubkey', artistKey]] }, sk);
  const res = await api('PUT', '/api/admin/nutzap-info', { event });
  publish(event, RELAYS).catch(() => {});
  return res.on;
}

// The gig listed live on Nostr (session 55d): the server builds the listing for the gig as it is now (planned, live or
// ended); this browser signs it with the key above, the server checks and keeps it, then it goes to the Nutzap note's
// relays. Never from localhost: its link would say localhost. Signed only if this browser's key is the Nutzap note's
// (another browser's key can't speak for the artist on Nostr). Returns what's on Nostr now, for Show Time's line.
export async function listLive(api) {
  const local = location.protocol !== 'https:';
  // Twice at most: an old gig's listing may need ending first, then this gig's goes out.
  for (let i = 0; ; i++) {
    const r = await api('GET', '/api/admin/nostr-live');
    const out = { on: r.on, sent: r.sent, local };
    if (!r.want || i === 2) return out;
    const sk = await nostrKey(false);
    const { finalizeEvent, getPublicKey } = await import('nostr-tools/pure');
    if (!sk || getPublicKey(sk) !== r.pubkey) return out;
    // Newer than the last one, even within the same second (a step pressed just after a listing went out).
    const event = finalizeEvent({ ...r.want, created_at: Math.max(Math.floor(Date.now() / 1000), (r.last || 0) + 1) }, sk);
    const put = await api('PUT', '/api/admin/nostr-live', { event });
    if (!local) publish(event, put.relays || r.relays).catch(() => {});
  }
}
