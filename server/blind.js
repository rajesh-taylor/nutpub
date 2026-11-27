// Blind-signed venue tickets (session 39, agreed with Rajesh 20 Nov): the gig's key signs a ticket it can't see, so the
// door can tell a ticket is real and unused without knowing which purchase it came from. Cashu's own maths (NUT-00's
// blind signature, NUT-12's DLEQ proof), from cashu-ts, checked against Cashu's published test vectors
// (test/blind.test.js). The same file runs on the phone (it makes, unblinds and shows the ticket) and on the server
// (it signs, and the door checks).
//
// The ticket is made on the phone from 32 random bytes (the seed: the passkey's user ID, never sent). From the seed,
// with HKDF-SHA256 (one key per job, Rajesh's encryption rule): a nonce, the ticket's own key, and the blinding factor.
// The ticket's secret is a NUT-10 secret locked to that key, ["P2PK", {nonce, data: the key's public half}], so only
// the phone holding the key can show it at the door. The phone sends only B_ = Y + rG (Y = hash_to_curve(secret)) with
// the 402; the server answers C_ = kB_ under tonight's gig key k, with a DLEQ proof that k signed it; the phone takes
// C = C_ - rK. At the door the QR carries the ticket (nonce, key, C) and a Schnorr signature of the 30-second time step
// by the ticket's key. The door checks kY = C (signed by tonight's gig), the signature on a step from the last minute
// (fresh) and Y against its list of tickets already in (first time). Y is the ticket's fingerprint: the server never
// saw it before the door, and nothing it holds links it to B_.
import {
  blindMessage, createBlindSignature, unblindSignature, verifyUnblindedSignature, hashToCurve, createDLEQProof,
  verifyDLEQProof, schnorrSignMessage, schnorrVerifyMessage, pointFromHex, getPubKeyFromPrivKey, createRandomSecretKey,
} from 'cashu-ts-next';

const utf8 = new TextEncoder();
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n; // secp256k1's order
export const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (text) => Uint8Array.from(String(text).match(/../g) || [], (b) => parseInt(b, 16));
export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (text) => { const s = String(text).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (ch) => ch.charCodeAt(0)); };
const POINT = /^0[23][0-9a-f]{64}$/;
export const isPoint = (h) => { if (!POINT.test(h || '')) return false; try { pointFromHex(h); return true; } catch { return false; } };

// HKDF-SHA256 from the seed, one output per job: info = utf8("refueler.nutpub.<purpose>.v1") ‖ 0x00, no salt.
export async function derive(seed, purpose, length = 32) {
  const key = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits']);
  const tag = utf8.encode(`refueler.nutpub.${purpose}.v1`);
  const info = new Uint8Array(tag.length + 1);
  info.set(tag);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, key, length * 8));
}
// A scalar for secp256k1: 1 ≤ k < n. A 32-byte HKDF output falls outside about once in 2^128: then the seed is refused.
const scalar = (bytes) => { const k = BigInt(`0x${hex(bytes)}`); if (k === 0n || k >= N) throw new Error('bad_seed'); return k; };

export const secretOf = (nonce, pub) => JSON.stringify(['P2PK', { nonce, data: pub }]);

// The ticket, from its 32 bytes: the same seed always makes the same ticket (that's Find my ticket).
export async function ticketFrom(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('bad_seed');
  const [nonce, key, blind] = await Promise.all(['ticket-nonce', 'ticket-key', 'ticket-blind'].map((p) => derive(seed, p)));
  scalar(key);
  const r = scalar(blind);
  const pub = hex(getPubKeyFromPrivKey(key));
  const secret = secretOf(hex(nonce), pub);
  const { B_ } = blindMessage(utf8.encode(secret), r);
  return { nonce: hex(nonce), key: hex(key), pub, r, secret, B_: B_.toHex(true), y: fingerprint(secret) };
}

// The ticket's fingerprint at the door: Y = hash_to_curve(secret), as a mint keeps a spent coin's (NUT-07).
export const fingerprint = (secret) => hashToCurve(utf8.encode(secret)).toHex(true);
// The short form the door's list goes out in (the phone looks for its own there, so it never says which is its own).
export const shortY = (y) => String(y).slice(2, 18);

// ---- Tonight's gig key: made by the server at New night; its private half never leaves the server.
export function makeGigKey() {
  const priv = createRandomSecretKey();
  const pub = hex(getPubKeyFromPrivKey(priv));
  return { priv: hex(priv), pub, id: `00${pub.slice(2, 16)}` };
}

// The server signs B_ without seeing inside, with a NUT-12 DLEQ proof that tonight's key made it.
export function signBlind(B_hex, gig) {
  const B_ = pointFromHex(B_hex);
  const k = unhex(gig.priv);
  const { C_ } = createBlindSignature(B_, k, gig.id);
  const { e, s } = createDLEQProof(B_, k);
  return { C_: C_.toHex(true), e: hex(e), s: hex(s), id: gig.id };
}

// The phone checks the proof against tonight's public gig key, then unblinds: C = C_ - rK.
export function unblind(ticket, sig, K) {
  const B_ = pointFromHex(ticket.B_);
  const C_ = pointFromHex(sig.C_);
  const A = pointFromHex(K);
  if (!verifyDLEQProof({ e: unhex(sig.e), s: unhex(sig.s) }, B_, C_, A)) throw new Error('bad_dleq');
  return unblindSignature(C_, ticket.r, A).toHex(true);
}

// ---- At the door. What's signed every 30 seconds: the step, tagged for this one job.
export const doorMessage = (step) => `refueler.nutpub.door.v1:${step}`;
// The QR's payload: nonce (32) ‖ the ticket's key (33) ‖ C (33) ‖ the step (4, big-endian) ‖ its signature (64).
const SIZE = 32 + 33 + 33 + 4 + 64;
export function doorProof(ticket, C, step) {
  const sig = unhex(schnorrSignMessage(doorMessage(step), ticket.key));
  const out = new Uint8Array(SIZE);
  out.set(unhex(ticket.nonce), 0);
  out.set(unhex(ticket.pub), 32);
  out.set(unhex(C), 65);
  new DataView(out.buffer).setUint32(98, step);
  out.set(sig, 102);
  return b64u(out);
}
export function readProof(text) {
  let b;
  try { b = unb64u(text); } catch { return null; }
  if (b.length !== SIZE) return null;
  const p = { nonce: hex(b.slice(0, 32)), pub: hex(b.slice(32, 65)), C: hex(b.slice(65, 98)),
    step: new DataView(b.buffer, b.byteOffset).getUint32(98), sig: hex(b.slice(102)) };
  if (!isPoint(p.pub) || !isPoint(p.C)) return null;
  return { ...p, secret: secretOf(p.nonce, p.pub) };
}

// The door's first two checks: signed by tonight's gig (kY = C), and fresh (the ticket's key signed a step from the
// last minute, or the next one for a phone a little fast). The third, first time in, is the server's list.
export function checkProof(p, gig, nowStep) {
  let signed = false;
  try { signed = verifyUnblindedSignature({ C: pointFromHex(p.C), secret: utf8.encode(p.secret), id: gig.id }, unhex(gig.priv)); } catch {}
  const fresh = signed && Math.abs(p.step - nowStep) <= 1 && schnorrVerifyMessage(p.sig, doorMessage(p.step), p.pub);
  return { signed, fresh, y: signed ? fingerprint(p.secret) : null };
}
