// The ticket's passkey, on the phone (WebAuthn; the checks are in server/passkey.js). No email, no account: the
// phone's password manager keeps it. For a venue ticket its user handle is the blind-signed ticket's 32 bytes
// (ticket.js), never sent to the NutPub: Find my ticket gets them back and rebuilds the ticket from them. Where the
// password manager gives a PRF answer (session 59), the 32 bytes are sealed with it instead (seal.js): the passkey's user
// ID is then 32 random bytes of its own, and the NutPub keeps the sealed copy beside the passkey, unable to open it.
import { seal, unseal, SEAL_INPUT } from './seal.js';
export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (text) => { const s = text.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (ch) => ch.charCodeAt(0)); };

export const passkeysWork = () => typeof PublicKeyCredential === 'function' && !!navigator.credentials?.create
  && typeof AuthenticatorAttestationResponse?.prototype?.getPublicKey === 'function';

// A challenge fetched ahead, so the passkey sheet opens straight from the tap (Safari wants it right after a tap).
let ready = null;
async function fetchChallenge() {
  const r = await fetch('/api/passkey/challenge', { method: 'POST' }).then((x) => x.json());
  return { value: r.challenge, until: Date.now() + (r.ms || 300000) - 30000 };
}
// Can this browser ask for a PRF answer? Asked ahead with the challenge (no wait between the tap and the sheet).
let prfAsk = null;
const prfCan = () => (prfAsk ??= Promise.resolve(globalThis.PublicKeyCredential?.getClientCapabilities?.())
  .then((c) => (c ? c['extension:prf'] !== false : false)).catch(() => false)); // a browser that lists its features (Safari 18.4+, Chrome 133+) is asked unless it says no
export function warm() { prfCan(); if (!ready || ready.until < Date.now()) ready = fetchChallenge().catch(() => null); return ready; }
export async function take() {
  let c = await warm();
  if (!c || c.until < Date.now()) { ready = null; c = await warm(); }
  ready = null;
  if (!c) throw new Error('No connection: try again in a moment.');
  return c.value;
}
export const said = async (res) => { if (res.ok) return res.json(); const e = await res.json().catch(() => ({})); throw new Error(e.detail && e.error !== 'passkey' ? e.detail : 'That didn’t work: try again.'); };
export const cancelled = (e) => e?.name === 'NotAllowedError' || e?.name === 'AbortError';

// The ticket's user handle: made once per ticket and kept in this browser, so a second save (a retry after the
// server missed the first, say) replaces the phone's entry instead of adding a second one beside it.
function handleFor(pass) {
  const key = 'nutpub-handle';
  let all = {};
  try { all = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  if (typeof all[pass] === 'string') return unb64u(all[pass]);
  const id = crypto.getRandomValues(new Uint8Array(32));
  try { localStorage.setItem(key, JSON.stringify({ [pass]: b64u(id) })); } catch {} // one ticket per browser: the newest
  return id;
}

// Keep this ticket with a passkey. `name` is what the password manager lists (the artist, the venue and the date);
// `id`: the venue ticket's 32 bytes, its user ID (a Watch online ticket gets 32 bytes of its own).
// Sealed (session 59): a venue ticket, where the browser can ask for PRF, gets a user ID of its own and its 32 bytes
// sealed with the passkey's PRF answer. Gives back { sealed, cred, handle } then. If the passkey gave no answer after all,
// the server never hears of it, the password manager is told to drop it, and { again: true } asks for one more press,
// which saves it as before (the 32 bytes as its user ID). Nothing changes for a browser without PRF.
let noSeal = false;
export async function makePasskey(pass, name, id = null, sealIt = false) {
  const challenge = await take();
  const sealing = !!(sealIt && id && !noSeal && (await prfCan()));
  const handle = sealing ? crypto.getRandomValues(new Uint8Array(32)) : null;
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'The NutPub', id: location.hostname },
      user: { id: handle || id || handleFor(pass), name, displayName: name },
      challenge: unb64u(challenge),
      pubKeyCredParams: [-7, -8, -257].map((alg) => ({ type: 'public-key', alg })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
      attestation: 'none', timeout: 120000,
      ...(sealing ? { extensions: { prf: { eval: { first: SEAL_INPUT } } } } : {}),
    } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  let sealed = null;
  if (sealing) {
    const prf = cred.getClientExtensionResults?.().prf?.results?.first;
    if (!prf) { noSeal = true; forgetPasskey(cred.id); return { again: true }; }
    sealed = await seal(new Uint8Array(prf), id, new Uint8Array(cred.rawId));
  }
  const r = cred.response;
  await said(await fetch('/api/passkey', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, alg: r.getPublicKeyAlgorithm(), publicKey: b64u(r.getPublicKey()),
    clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()), ...(sealed ? { sealed } : {}) }) }));
  return sealed ? { sealed, cred: cred.id, handle: b64u(handle) } : { ok: true };
}

// A sealed ticket in this browser, opened with its own passkey: the face or fingerprint, then its PRF answer opens the
// copy here (nothing asked of the server). The 32 bytes, or null if the fan closed the sheet.
export async function openSealed(s) {
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64u(s.cred) }], userVerification: 'preferred', timeout: 120000,
      extensions: { prf: { eval: { first: SEAL_INPUT } } } } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const prf = cred.getClientExtensionResults?.().prf?.results?.first;
  if (!prf) throw new Error('This browser can’t open a sealed ticket: open it where you saved it.');
  return unseal(new Uint8Array(prf), s.sealed, new Uint8Array(cred.rawId)).catch(() => { throw new Error('That passkey doesn’t open this ticket.'); });
}

// ---- Passkeys kept tidy (WebAuthn Signal API, session 50): the page tells the password manager what the NutPub still
// knows, so a passkey whose night is over goes and a ticket's passkey keeps its current name. Each method only where
// the browser has it (Safari 26, Chrome 132; not Firefox), fired and never awaited (Safari 26.0–26.1 never answered
// one of them), every error swallowed: a missing signal never stops the page.
export function signal(method, options) {
  try {
    const f = globalThis.PublicKeyCredential?.[method];
    if (typeof f !== 'function') return false;
    Promise.resolve(f.call(globalThis.PublicKeyCredential, options)).catch(() => {});
    return true;
  } catch { return false; }
}
const here = () => globalThis.location?.hostname;
// Find my ticket picked a passkey the NutPub no longer knows (its night is over): forget it.
export const forgetPasskey = (credentialId, rpId = here()) => signal('signalUnknownCredential', { rpId, credentialId });
// The ticket page, opened: `ids` are the only passkeys for this ticket's user ID (none once the ticket's gone), and
// `name` what the password manager lists them as. userId: the 32 bytes, or their base64url.
export function tidyPasskeys(userId, ids, name = '', rpId = here()) {
  if (!userId || !rpId) return;
  const id = typeof userId === 'string' ? userId : b64u(userId);
  signal('signalAllAcceptedCredentials', { rpId, userId: id, allAcceptedCredentialIds: ids });
  if (ids.length && name) signal('signalCurrentUserDetails', { rpId, userId: id, name, displayName: name });
}
// Find my ticket on another browser: it keeps the Watch online ticket's user ID too, so the page can keep its name.
export const keepHandle = (pass, id) => { try { localStorage.setItem('nutpub-handle', JSON.stringify({ [pass]: typeof id === 'string' ? id : b64u(id) })); } catch {} };
// A Watch online ticket's user ID, if this browser holds one for this pass (handleFor, keepHandle).
export function handleOf(pass) {
  try { const h = JSON.parse(localStorage.getItem('nutpub-handle') || '{}')?.[pass]; return typeof h === 'string' ? h : null; } catch { return null; }
}

// The passkey check: Find my ticket (any of this site's passkeys). Gives back the ticket's pass and kind ('room' |
// 'home') from the server, and the 32 bytes: the passkey's user ID from the phone itself, or, for a sealed ticket
// (session 59), the server's sealed copy opened here with the passkey's PRF answer. Null if the fan closed the sheet.
export async function checkPasskey() {
  const challenge = await take();
  const ask = await prfCan();
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000,
      ...(ask ? { extensions: { prf: { eval: { first: SEAL_INPUT } } } } : {}) } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  const res = await fetch('/api/passkey/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) }) });
  // "For another night": only when the server says so plainly, never on a lost connection.
  if (res.status === 404 && (await res.clone().json().catch(() => ({}))).error === 'no_ticket') forgetPasskey(cred.id);
  const found = await said(res);
  const user = r.userHandle ? new Uint8Array(r.userHandle) : null;
  if (found.sealed) {
    const prf = cred.getClientExtensionResults?.().prf?.results?.first;
    if (!prf) throw new Error('This ticket is sealed, and this browser can’t open it: try the phone you saved it on.');
    const seed = await unseal(new Uint8Array(prf), found.sealed, new Uint8Array(cred.rawId)).catch(() => { throw new Error('That passkey doesn’t open this ticket.'); });
    return { pass: found.pass, kind: found.kind, seed, sealed: { sealed: found.sealed, cred: cred.id, handle: user ? b64u(user) : null } };
  }
  return { ...found, seed: user?.length === 32 ? user : null };
}
