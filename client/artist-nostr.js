// Nutzaps are always on (Rajesh 12 Nov): the artist's own pages (Show Time, Takings) send the "Nutzap me here" note
// (NIP-61, kind 10019) by themselves whenever the NutPub has none for the artist's current key: the test mint, the key
// tips are locked to (the one Takings collects with) and a few public relays. Signed with a Nostr key made for the
// artist in this browser, quietly (an extension would pop up a question on every page). Losing that key costs
// nothing: the money is locked to the wallet key, and the next page simply sends a new note.
import { publish } from './nostr.js';

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const KEY = 'nutpub-artist-nostr';

export async function nutzapsOn(api, artistKey) {
  const { on } = await api('GET', '/api/admin/nutzap-info');
  if (on || !artistKey) return on;
  const { generateSecretKey, finalizeEvent } = await import('nostr-tools/pure');
  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  let sk = null;
  try { sk = localStorage.getItem(KEY); } catch {}
  if (!/^[0-9a-f]{64}$/.test(sk || '')) { sk = hex(generateSecretKey()); try { localStorage.setItem(KEY, sk); } catch {} }
  const { mint } = await fetch('/api/health').then((r) => r.json());
  const event = finalizeEvent({ kind: 10019, created_at: Math.floor(Date.now() / 1000), content: '',
    tags: [...RELAYS.map((r) => ['relay', r]), ['mint', mint.url, 'sat'], ['pubkey', artistKey]] }, Uint8Array.from(sk.match(/../g), (h) => parseInt(h, 16)));
  const res = await api('PUT', '/api/admin/nutzap-info', { event });
  publish(event, RELAYS).catch(() => {});
  return res.on;
}
