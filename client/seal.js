// Passkeys that seal the ticket (session 59, Rajesh's encryption rule). A venue ticket is its 32 bytes (the seed,
// server/blind.js). Where the password manager gives a PRF answer (WebAuthn's prf extension: Apple Passwords, Proton
// Pass, tried 23–24 Nov), that answer makes the seal's key, and the seed is kept sealed: in this browser between
// visits, and on the server beside the passkey, which can't open it. Only that passkey, with the fan's face or
// fingerprint, gives the same answer again.
//
// key   = HKDF-SHA256(the PRF answer, no salt, info = utf8("refueler.nutpub.ticket-seal.v1") ‖ 0x00), one job only
// seal  = 0x01 ‖ nonce (12 random bytes, new every time) ‖ AES-GCM(key, nonce, seed, aad = the passkey's id)
// The passkey's id as AAD: a sealed copy only opens with the passkey it was made for.
import { derive } from '../server/blind.js';

const VERSION = 1;
// What the passkey is asked to answer (PRF's input). The answer, not this, is the secret.
export const SEAL_INPUT = new TextEncoder().encode('refueler.nutpub.ticket-seal.v1');

const keyFrom = async (prf) => {
  if (!(prf instanceof Uint8Array) || prf.length < 32) throw new Error('bad_prf');
  return crypto.subtle.importKey('raw', await derive(prf, 'ticket-seal'), 'AES-GCM', false, ['encrypt', 'decrypt']);
};
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (text) => { const s = String(text).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (ch) => ch.charCodeAt(0)); };

// Seal the 32 bytes. `nonce` is for the known-answer tests only: every real seal takes 12 fresh random bytes.
export async function seal(prf, seed, aad, nonce = crypto.getRandomValues(new Uint8Array(12))) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('bad_seed');
  if (!(nonce instanceof Uint8Array) || nonce.length !== 12) throw new Error('bad_nonce');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, await keyFrom(prf), seed));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = VERSION;
  out.set(nonce, 1);
  out.set(ct, 13);
  return b64u(out);
}

// Open it: the 32 bytes, or an error ('bad_seal') if the answer, the passkey or the copy is wrong.
export async function unseal(prf, text, aad) {
  let b;
  try { b = unb64u(text); } catch { throw new Error('bad_seal'); }
  if (b.length !== 1 + 12 + 32 + 16 || b[0] !== VERSION) throw new Error('bad_seal');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(1, 13), additionalData: aad }, await keyFrom(prf), b.slice(13)));
  } catch { throw new Error('bad_seal'); }
}

// A sealed copy as the server takes it: 61 bytes in base64url (82 characters).
export const isSealed = (text) => /^[\w-]{82}$/.test(String(text || ''));
