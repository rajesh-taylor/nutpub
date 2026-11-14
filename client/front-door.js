// The home page's front door: Put on a gig makes a passkey on this phone (its password manager keeps it, synced to
// the artist's other devices) and a stage of the artist's own, then opens it; Back to your stage finds it again with
// that passkey. No email, no account. The checks are in server/stages.js.
import { passkeysWork, warm, take, said, cancelled, b64u, unb64u } from './passkey.js';

const $ = (id) => document.getElementById(id);
const say = (text) => { $('door-said').textContent = text; $('door-said').hidden = !text; };
const busy = (on) => { for (const b of [$('put-on'), $('come-back')]) b.disabled = on; };

async function putOn() {
  const challenge = await take();
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'The NutPub', id: location.hostname },
      // The user handle means nothing: 32 random bytes, never sent to us. The name is what the password manager lists.
      user: { id: crypto.getRandomValues(new Uint8Array(32)), name: `My NutPub stage · ${day}`, displayName: 'My NutPub stage' },
      challenge: unb64u(challenge),
      pubKeyCredParams: [-7, -8, -257].map((alg) => ({ type: 'public-key', alg })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
      attestation: 'none', timeout: 120000,
    } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  return said(await fetch('/api/stages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, alg: r.getPublicKeyAlgorithm(), publicKey: b64u(r.getPublicKey()),
    clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()) }) }));
}

async function comeBack() {
  const challenge = await take();
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000 } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  return said(await fetch('/api/stages/back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) }) }));
}

const go = (fn) => async () => {
  say(''); busy(true);
  try {
    const out = await fn();
    if (out?.url) { location.href = out.url; return; }
  } catch (e) { say(e.message || 'That didn’t work: try again.'); }
  busy(false);
};

if (passkeysWork()) {
  warm(); // a challenge ahead, so the passkey sheet opens straight from the tap
  $('put-on').addEventListener('click', go(putOn));
  $('come-back').addEventListener('click', go(comeBack));
  if (location.hash === '#back') $('come-back').focus();
} else {
  busy(true);
  say('This browser can’t keep a passkey: open thenutpub.com in Safari or Chrome on your phone.');
}
