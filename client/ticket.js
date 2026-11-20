// The blind-signed venue ticket on the phone (session 39; the maths is in server/blind.js). The ticket is made here
// from 32 random bytes kept in this browser (and in its passkey, if saved: the passkey's user ID): only its blinded copy
// goes with the 402. The gig's signature comes back with a DLEQ proof, checked against tonight's public gig key, and is
// unblinded here; the unblinded ticket stays in this browser, so the door QR works with no signal.
import { ticketFrom, unblind, doorProof, shortY, b64u, unb64u } from '../server/blind.js';

const KEY = (keep) => `nutpub-ticket${keep}`;
const read = (keep) => { try { return JSON.parse(localStorage.getItem(KEY(keep)) || 'null'); } catch { return null; } };
const write = (keep, v) => { try { localStorage.setItem(KEY(keep), JSON.stringify(v)); } catch {} };

// This purchase's 32 bytes: made once, before paying; one ticket per browser, the newest.
export function seedFor(pass, keep = '') {
  const k = read(keep);
  if (k?.pass === pass && k.seed) return unb64u(k.seed);
  const seed = crypto.getRandomValues(new Uint8Array(32));
  write(keep, { pass, seed: b64u(seed) });
  return seed;
}
// Find my ticket (the passkey's user ID) or a saved ticket link brings the 32 bytes back.
export const keepSeed = (pass, seed, keep = '') => write(keep, { pass, seed: typeof seed === 'string' ? seed : b64u(seed) });
export const seedText = (pass, keep = '') => { const k = read(keep); return k?.pass === pass ? k.seed || null : null; };

const made = new Map(); // seed → ticket, so the 30-second QR doesn't redo the maths
const ticketOf = async (seed) => { if (!made.has(seed)) made.set(seed, await ticketFrom(unb64u(seed))); return made.get(seed); };
// The blinded copy for the 402.
export const blindFor = async (pass, keep = '') => (await ticketOf(b64u(seedFor(pass, keep)))).B_;

// The ticket, signed and unblinded: { t, C }, or null when this browser hasn't its 32 bytes (or no signature yet).
// door: /api/door/me's answer (blind, sig).
export async function signedTicket(pass, door, keep = '') {
  const k = read(keep);
  if (k?.pass !== pass || !k.seed) return null;
  const t = await ticketOf(k.seed);
  if (k.C && k.blind === t.B_ && (!door?.sig || k.signedC === door.sig.C_)) return { t, C: k.C };
  if (!door?.sig || door.blind !== t.B_) return null;
  // Tonight's gig key, asked for with no pass: the same for everyone, so the proof shows the gig itself signed it.
  const K = (await fetch('/api/door/gig').then((r) => r.json())).pub;
  const C = unblind(t, door.sig, K);
  write(keep, { ...k, C, blind: t.B_, signedC: door.sig.C_ });
  return { t, C };
}
// The door QR's proof for one 30-second step: the ticket and the step, signed by the ticket's own key.
export const proofAt = (mine, step) => doorProof(mine.t, mine.C, step);
// Let in? The phone finds its own fingerprint in the door's list (short form): when, or null.
export const inAt = (mine, inside) => (inside || []).find(([y]) => y === shortY(mine.t.y))?.[1] ?? null;
