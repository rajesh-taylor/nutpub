// The blind-signed venue ticket on the phone (session 39; the maths is in server/blind.js). The ticket is made here
// from 32 random bytes kept in this browser (and in its passkey, if saved: the passkey's user ID, or sealed with its PRF
// answer, session 59): only its blinded copy
// goes with the 402. The gig's signature comes back with a DLEQ proof, checked against tonight's public gig key, and is
// unblinded here; the unblinded ticket stays in this browser, so the door QR works with no signal.
import { ticketFrom, unblind, doorProof, shortY, b64u, unb64u } from '../server/blind.js';

const KEY = (keep) => `nutpub-ticket${keep}`;
const read = (keep) => { try { return JSON.parse(localStorage.getItem(KEY(keep)) || 'null'); } catch { return null; } };
const write = (keep, v) => { try { localStorage.setItem(KEY(keep), JSON.stringify(v)); } catch {} };
// A sealed ticket, opened (session 59): its 32 bytes for this tab only (sessionStorage goes with the tab), so a reload
// of Show Time doesn't ask again; another visit asks the passkey (Open your ticket).
const OPEN = (keep) => `nutpub-open${keep}`;
const opened = (pass, keep) => { try { const o = JSON.parse(sessionStorage.getItem(OPEN(keep)) || 'null'); return o?.pass === pass ? o.seed : null; } catch { return null; } };
const open = (pass, keep, seed) => { try { sessionStorage.setItem(OPEN(keep), JSON.stringify({ pass, seed })); } catch {} };
// The 32 bytes, plain (as before PRF) or opened in this tab; null if sealed and not opened yet.
const seedOf = (k, keep) => (k?.seed || (k?.sealed ? opened(k.pass, keep) : null));

// This purchase's 32 bytes: made once, before paying; one ticket per browser, the newest.
export function seedFor(pass, keep = '') {
  const k = read(keep);
  if (k?.pass === pass && seedOf(k, keep)) return unb64u(seedOf(k, keep));
  if (k?.pass === pass && k.sealed) throw new Error('Open your ticket first.'); // sealed: never a second ticket over it
  const seed = crypto.getRandomValues(new Uint8Array(32));
  write(keep, { pass, seed: b64u(seed) });
  return seed;
}
// Find my ticket (the passkey's user ID) or a saved ticket link brings the 32 bytes back.
export const keepSeed = (pass, seed, keep = '') => write(keep, { pass, seed: typeof seed === 'string' ? seed : b64u(seed) });
// The plain 32 bytes only (the saved ticket link carries them): never a sealed ticket's.
export const seedText = (pass, keep = '') => { const k = read(keep); return k?.pass === pass ? k.seed || null : null; };
// The passkey's user ID for this ticket (passkey.js, tidyPasskeys): the 32 bytes, or a sealed ticket's own handle.
export const userIdOf = (pass, keep = '') => { const k = read(keep); return k?.pass === pass ? k.seed || k.handle || null : null; };

// Sealed (client/seal.js): the plain 32 bytes leave this browser's storage; the sealed copy, its passkey's id and
// handle stay, with the gig's signature. Opened in this tab at once, so the door QR shows straight after saving.
export function keepSealed(pass, s, seed, keep = '') {
  const k = read(keep);
  const signed = k?.pass === pass ? { C: k.C, blind: k.blind, signedC: k.signedC } : {};
  write(keep, { pass, sealed: s.sealed, cred: s.cred, handle: s.handle, ...signed });
  open(pass, keep, typeof seed === 'string' ? seed : b64u(seed));
}
// This browser's sealed ticket for this pass, still to open: { sealed, cred }, or null.
export const toOpen = (pass, keep = '') => { const k = read(keep); return k?.pass === pass && k.sealed && !opened(pass, keep) ? { sealed: k.sealed, cred: k.cred } : null; };
// Opened with its passkey (passkey.js, openSealed): this tab has it.
export const opens = (pass, seed, keep = '') => open(pass, keep, typeof seed === 'string' ? seed : b64u(seed));

const made = new Map(); // seed → ticket, so the 30-second QR doesn't redo the maths
const ticketOf = async (seed) => { if (!made.has(seed)) made.set(seed, await ticketFrom(unb64u(seed))); return made.get(seed); };
// The blinded copy for the 402.
export const blindFor = async (pass, keep = '') => (await ticketOf(b64u(seedFor(pass, keep)))).B_;

// The ticket, signed and unblinded: { t, C }, or null when this browser hasn't its 32 bytes (or no signature yet).
// door: /api/door/me's answer (blind, sig).
export async function signedTicket(pass, door, keep = '') {
  const k = read(keep);
  const seed = k?.pass === pass ? seedOf(k, keep) : null;
  if (!seed) return null;
  const t = await ticketOf(seed);
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
