// The home page's front door: Back to your stage finds an artist's stage again with its passkey (made by Put on a gig,
// 14 Nov). No email, no account. The checks are in server/stages.js. Judge for yourself is a plain link to /judge
// (14 Nov, the three gig cards, no passkeys); Put on a gig with a passkey comes back for real artists after 27 Nov
// (git history: putOn() in this file).
import { passkeysWork, warm, take, said, cancelled, b64u, unb64u } from './passkey.js';

const $ = (id) => document.getElementById(id);
const say = (text) => { $('door-said').textContent = text; $('door-said').hidden = !text; };
const busy = (on) => { $('come-back').disabled = on; };

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
  $('come-back').addEventListener('click', go(comeBack));
  if (location.hash === '#back') $('come-back').focus();
} else {
  busy(true); // Back to your stage needs a passkey; Judge for yourself doesn't, so the page says nothing about it
}
