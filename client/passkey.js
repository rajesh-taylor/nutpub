// The ticket's passkey, on the phone (WebAuthn; the checks are in server/passkey.js). No email, no account: the
// phone's password manager keeps it. For a venue ticket its user handle is the blind-signed ticket's 32 bytes
// (ticket.js), never sent to the NutPub: Find my ticket gets them back and rebuilds the ticket from them.
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
export function warm() { if (!ready || ready.until < Date.now()) ready = fetchChallenge().catch(() => null); return ready; }
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
export async function makePasskey(pass, name, id = null) {
  const challenge = await take();
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'The NutPub', id: location.hostname },
      user: { id: id || handleFor(pass), name, displayName: name },
      challenge: unb64u(challenge),
      pubKeyCredParams: [-7, -8, -257].map((alg) => ({ type: 'public-key', alg })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
      attestation: 'none', timeout: 120000,
    } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  return said(await fetch('/api/passkey', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, alg: r.getPublicKeyAlgorithm(), publicKey: b64u(r.getPublicKey()),
    clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()) }) }));
}

// The passkey check: Find my ticket (any of this site's passkeys). Gives back the ticket's pass and kind ('room' |
// 'home') from the server, and the passkey's user ID from the phone itself (seed: the venue ticket's 32 bytes). Null if
// the fan closed the sheet.
export async function checkPasskey() {
  const challenge = await take();
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000 } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  const found = await said(await fetch('/api/passkey/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) }) }));
  const seed = r.userHandle ? new Uint8Array(r.userHandle) : null;
  return { ...found, seed: seed?.length === 32 ? seed : null };
}
