// Nutzaps (NIP-61, 13 Nov): a tip with your Nostr name on it, in public. Tip stays anonymous; a Nutzap is signed.
// 1. The artist turns Nutzaps on in Show Time: their browser signs a "Nutzap me here" note (kind 10019) naming this
//    show's test mint and the key the tips are locked to (the artist's wallet key, the one Takings collects with). It
//    goes to public relays and here; we keep the newest, and only while its lock key is still the artist's.
// 2. A fan signed in with Nostr presses Nutzap: the same 402 as a tip, so the browser wallet locks the sats to the
//    artist's key (NUT-11). The fan's extension or signer app signs a public note (kind 9321) carrying those exact
//    coins, addressed to the artist. It comes here with the payment: the note is checked first, then the payment goes
//    through the gate like any tip (gate.js), then it's in the chat, on the room's screen and in Takings. The fan's
//    browser also sends the note to the artist's relays, where any Nostr app can see it.
import { getDecodedToken } from '@cashu/cashu-ts';
import { MINT_URL } from './config.js';
import { kv, run } from './db.js';
import { keysetIds } from './gate.js';
import { verifyEvent } from './nostr.js';
import { json, body } from './http.js';

export const INFO_KIND = 10019;
export const NUTZAP_KIND = 9321;
export const FRESH = 300; // a Nutzap note signed in the last 5 minutes (a signer app on a phone can take a while)
const COMPRESSED = /^0[23][0-9a-f]{64}$/;
const norm = (url) => String(url || '').replace(/\/+$/, '');
const tags = (ev, name) => ev.tags.filter((t) => t[0] === name);
const tag = (ev, name) => tags(ev, name)[0]?.[1];

// "Nutzap me here": signed, our mint (in sats), locked to the artist's key, and at least one wss:// relay.
export async function checkInfo(ev, artistKey, mint = MINT_URL) {
  if (!(await verifyEvent(ev))) return 'bad_signature';
  if (ev.kind !== INFO_KIND) return 'wrong_kind';
  if (!tags(ev, 'mint').some(([, url, ...units]) => norm(url) === norm(mint) && (!units.length || units.includes('sat')))) return 'wrong_mint';
  const lock = String(tag(ev, 'pubkey') || '').toLowerCase();
  if (!COMPRESSED.test(lock) || lock !== artistKey) return 'wrong_lock';
  if (!relaysOf(ev).length) return 'no_relays';
  return null;
}
export const relaysOf = (ev) => tags(ev, 'relay').map((t) => t[1]).filter((u) => /^wss:\/\/[^\s]+$/.test(u || '')).slice(0, 5);

// For the gig page: the artist's Nostr key and relays, while their note still locks to the current artist key.
export async function nutzapInfo(artistKey) {
  let ev;
  try { ev = JSON.parse((await kv.get('nutzapInfo')) || 'null'); } catch { return null; }
  if (!ev || !artistKey || String(tag(ev, 'pubkey') || '').toLowerCase() !== artistKey) return null;
  return { pubkey: ev.pubkey, relays: relaysOf(ev) };
}
export const saveInfo = (ev) => kv.set('nutzapInfo', JSON.stringify(ev));

// The coins inside a cashuB token, as the gate will see them.
export async function tokenProofs(token) {
  return getDecodedToken(token, await keysetIds()).proofs;
}
// A Nutzap note: signed by the fan signed in on this pass, to the artist, on our mint, recent, and carrying exactly
// the coins of the payment that came with it (same secrets, signatures and amounts), so what the artist sees on
// Nostr is what was paid.
export async function checkNutzap(ev, { proofs, fan, artist, mint = MINT_URL, at = Math.floor(Date.now() / 1000) }) {
  if (!(await verifyEvent(ev))) return 'bad_signature';
  if (ev.kind !== NUTZAP_KIND) return 'wrong_kind';
  if (!fan || ev.pubkey !== fan) return 'not_you';
  if (Math.abs(ev.created_at - at) > FRESH) return 'too_old';
  if (tag(ev, 'p') !== artist) return 'wrong_artist';
  if (norm(tag(ev, 'u')) !== norm(mint)) return 'wrong_mint';
  if (ev.content.length > 280) return 'too_long';
  let inNote;
  try { inNote = tags(ev, 'proof').map((t) => JSON.parse(t[1])); } catch { return 'wrong_coins'; }
  const key = (p) => `${p?.secret}|${String(p?.C || '').toLowerCase()}|${Number(p?.amount)}`;
  const want = proofs.map(key).sort();
  const got = inNote.map(key).sort();
  if (want.length !== got.length || want.some((k, i) => k !== got[i])) return 'wrong_coins';
  return null;
}
export const WHY = {
  bad_signature: 'The Nutzap’s signature didn’t check out.',
  wrong_kind: 'That isn’t a Nutzap.',
  not_you: 'Signed with a different Nostr key from the one signed in here.',
  too_old: 'The Nutzap was signed too long ago: try again.',
  wrong_artist: 'The Nutzap was addressed to someone else.',
  wrong_mint: 'The Nutzap names another mint.',
  too_long: 'Your words are too long for a Nutzap.',
  wrong_coins: 'The Nutzap doesn’t carry the payment that came with it.',
};

// Kept for Takings and the chat until the night's records go (closing.js): which tip was a Nutzap, from whom.
export const recordNutzap = (locked, message, ev, name) => run(
  'INSERT INTO nutzaps (locked, message, pubkey, name, event, at) VALUES (?, ?, ?, ?, ?, ?)',
  locked, message, ev.pubkey, name || null, JSON.stringify(ev), new Date().toISOString());

// Show Time's "Turn on Nutzaps": the artist's signed note, checked and kept; GET says whether it's on.
export function mountNutzaps(route, admin, artistKey) {
  route('GET', '/api/admin/nutzap-info', admin, async () => json({ on: await nutzapInfo(await artistKey()) }));
  route('PUT', '/api/admin/nutzap-info', admin, async (c) => {
    const ev = (await body(c))?.event;
    const key = await artistKey();
    if (!key) return json({ error: 'not_ready', detail: 'Open Takings once first: it makes the key your tips are locked to.' }, 409);
    const why = await checkInfo(ev, key);
    if (why) return json({ error: why, detail: 'That “Nutzap me here” note didn’t check out.' }, 400);
    await saveInfo(ev);
    return json({ on: await nutzapInfo(key) });
  });
}
