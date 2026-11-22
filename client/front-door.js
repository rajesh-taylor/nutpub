// The front door, on thenutpub.com: the artist's passkey (session 53). Made once (step 0 on /judge, and Put on a gig
// after 27 Nov), it opens every stage it starts, on any phone or laptop its password manager syncs to; Back to your
// gigs brings them back. No email, no account. The checks are in server/stages.js.
//
// This browser keeps { id, uid, link, name, how } under nutpub-artist: the passkey's id (so a second Make here is refused),
// its user ID (32 random bytes, never sent: a retry replaces the password manager's entry instead of adding a second),
// the link code (adds the stage this browser starts to the passkey, nothing else) and the name it was saved as.
// The home page (home.html) wires its own button here; /judge imports what it needs.
import { passkeysWork, warm, take, said, cancelled, b64u, unb64u, forgetPasskey } from './passkey.js';

export { passkeysWork, warm };
const KEEP = 'nutpub-artist';
const SKIP = 'nutpub-artist-skip';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
export function artistHere() {
  try { const a = JSON.parse(read(KEEP) || 'null'); return a && typeof a === 'object' ? a : null; } catch { return null; }
}
const keep = (a) => write(KEEP, JSON.stringify(a));
// The link code, sent when this browser starts a stage (X-Artist-Link); null without one.
export const artistLink = () => (/^[0-9a-f]{32}$/.test(artistHere()?.link || '') ? artistHere().link : null);
// The server didn't know the link (the passkey was forgotten): drop it, keep the rest.
export const dropLink = () => { const a = artistHere(); if (a) { delete a.link; keep(a); } };
// Not now & continue, remembered in this browser.
export const skipped = () => read(SKIP) === '1';
export const skip = (on = true) => write(SKIP, on ? '1' : null);

// The name the password manager lists (Rajesh 22 Nov): one passkey per person, never one per gig, so no gig and no
// count in it; the date is the day it was made, with its year (Rajesh 22 Nov, session 55: "The NutPub · Producer ·
// 22 Nov ’26"). After 27 Nov the artist's name comes first ("Longy · …"). One added from another device carries its
// number (session 54b): "The NutPub · Artist · 22 Nov ’26 · 2". role: Artist, Producer or Mod.
export const passkeyName = (at = new Date(), nth = 1, role = 'Artist') => {
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const year = at.toLocaleDateString('en-GB', { year: '2-digit', timeZone: 'Europe/London' });
  return `The NutPub · ${role} · ${day} ’${year}${nth > 1 ? ` · ${nth}` : ''}`;
};

// Make your artist passkey. claims: [{ stage, claim }], stages this browser started before it (they join it).
// add (session 54b): the code another device showed: the passkey joins that artist, and their open gigs come back
// ({ stages }); nth: which of the artist's passkeys it is (from checkCode). Null if the sheet was closed.
export async function makeArtist(claims = [], add = null, nth = 1) {
  const challenge = await take();
  const had = artistHere() || {};
  const uid = /^[A-Za-z0-9_-]{43}$/.test(had.uid || '') ? had.uid : b64u(crypto.getRandomValues(new Uint8Array(32)));
  const name = passkeyName(new Date(), add ? Math.max(2, nth) : 1);
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'The NutPub', id: location.hostname },
      user: { id: unb64u(uid), name, displayName: name },
      challenge: unb64u(challenge),
      pubKeyCredParams: [-7, -8, -257].map((alg) => ({ type: 'public-key', alg })),
      excludeCredentials: had.id ? [{ type: 'public-key', id: unb64u(had.id) }] : [],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
      attestation: 'none', timeout: 120000,
    } });
  } catch (e) {
    if (e?.name === 'InvalidStateError') throw new Error('This browser already has your artist passkey: press Back to your gigs.');
    if (cancelled(e)) return null;
    throw e;
  }
  const r = cred.response;
  const res = await fetch('/api/artist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, alg: r.getPublicKeyAlgorithm(), publicKey: b64u(r.getPublicKey()),
    clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()), name, claims, ...(add ? { add } : {}) }) });
  // The code ran out under the sheet: the NutPub keeps no passkey, so the password manager is told (session 50's lesson).
  if (res.status === 403 && (await res.clone().json().catch(() => ({}))).error === 'add') forgetPasskey(cred.id);
  const out = await said(res);
  keep({ id: cred.id, uid, link: out.link, name: out.name, how: add ? 'added' : 'made' });
  skip(false);
  return out;
}

// Back to your gigs: any of this site's artist passkeys, then its open stages ({ stage, gig, artist, venue, state,
// url }), newest first. claims: [{ stage, claim }], gigs opened with their 12 words (session 54): they join it first.
// This browser keeps the passkey's link code too, so a gig started here joins it. Null if the sheet was closed.
export async function backToGigs(claims = []) {
  const challenge = await take();
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000 } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  const res = await fetch('/api/stages/back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), claims }) });
  // A passkey the NutPub no longer knows: the password manager is told (as Find my ticket does), and so is this browser.
  if (res.status === 404 && (await res.clone().json().catch(() => ({}))).error === 'no_stage') {
    forgetPasskey(cred.id);
    if (artistHere()?.id === cred.id) write(KEEP, null);
  }
  const out = await said(res);
  const had = artistHere();
  keep({ how: 'back', ...(had?.id === cred.id ? had : {}), id: cred.id, link: out.link, name: out.name }); // how: made here, or signed in
  skip(false);
  return out;
}

// ---- Another device (session 54b). The add code: 8 characters (Crockford base32), shown K7QX-3MPA, typed any way.
export const tidyCode = (text) => String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
export const codeOk = (code) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code);
export const showCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
// Add a passkey on another device: any of this site's artist passkeys, once (a link code can't), then { code, ms }.
// Null if the sheet was closed.
export async function addCode() {
  const challenge = await take();
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000 } });
  } catch (e) { if (cancelled(e)) return null; throw e; }
  const r = cred.response;
  const res = await fetch('/api/artist/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) }) });
  if (res.status === 404 && (await res.clone().json().catch(() => ({}))).error === 'no_stage') forgetPasskey(cred.id);
  return said(res);
}
// The new device, as the code is typed: still good? (Checked before the sheet, so the sheet opens straight from the tap.)
// { ok, n }: n, which of the artist's passkeys this one will be. ok null: no answer (no connection).
export async function checkCode(code) {
  const res = await fetch('/api/artist/add/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
  if (!res) return { ok: null };
  return { ok: res.ok, n: (await res.json().catch(() => ({}))).n };
}

// ---- Crew (session 55): an invite from an artist's Cellar, opened at thenutpub.com/crew#i=<stage>.<code>.
// Still good, and what for? { role, name, artist, until }, or throws with the reason. Spends nothing.
export async function inviteCheck(stage, code) {
  return said(await fetch('/api/crew/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, code }) }));
}
// Yes to it: make a passkey (how 'make') or use one this person has (how 'use'), then { url, role, name }: the gig's
// address with a one-time sign-in code. Null if the sheet was closed. role: 'producer' (session 55) or 'mod' (55b).
export async function joinCrew({ stage, code }, how, role) {
  const challenge = await take();
  let cred; let sent;
  if (how === 'use') {
    try {
      cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: location.hostname, userVerification: 'preferred', timeout: 120000 } });
    } catch (e) { if (cancelled(e)) return null; throw e; }
    const r = cred.response;
    sent = { how, challenge, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) };
  } else {
    const had = artistHere() || {};
    const uid = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const name = passkeyName(new Date(), 1, role === 'mod' ? 'Mod' : 'Producer');
    try {
      cred = await navigator.credentials.create({ publicKey: {
        rp: { name: 'The NutPub', id: location.hostname },
        user: { id: unb64u(uid), name, displayName: name },
        challenge: unb64u(challenge),
        pubKeyCredParams: [-7, -8, -257].map((alg) => ({ type: 'public-key', alg })),
        excludeCredentials: had.id ? [{ type: 'public-key', id: unb64u(had.id) }] : [],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
        attestation: 'none', timeout: 120000,
      } });
    } catch (e) {
      if (e?.name === 'InvalidStateError') throw new Error('This browser has a NutPub passkey already: press Use it.');
      if (cancelled(e)) return null;
      throw e;
    }
    const r = cred.response;
    sent = { how: 'make', challenge, id: cred.id, alg: r.getPublicKeyAlgorithm(), publicKey: b64u(r.getPublicKey()),
      clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.getAuthenticatorData()), name };
  }
  const res = await fetch('/api/crew', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, code, ...sent }) });
  const err = res.ok ? null : (await res.clone().json().catch(() => ({}))).error;
  // A new passkey the NutPub didn't keep (the invite went under the sheet): the password manager is told.
  if (how !== 'use' && (err === 'invite' || err === 'already')) forgetPasskey(cred.id);
  if (how === 'use' && err === 'no_stage') forgetPasskey(cred.id);
  const out = await said(res);
  const had = artistHere();
  keep({ how: how === 'use' ? 'back' : 'crew', ...(had?.id === cred.id ? had : {}), id: cred.id, link: out.link, name: out.name });
  skip(false);
  return out;
}

// One line a gig: "Longy · Peggy Sue’s Music Bar · on now", then Open. Someone else's gig says what you are there
// (session 55): "Longy · Peggy Sue’s · on now · producer".
const STATE = { on: 'on now', over: 'over', done: 'done', soon: 'not started' };
export function gigsList(stages, onOpen = () => {}) {
  const ul = Object.assign(document.createElement('ul'), { className: 'your-gigs' });
  for (const s of stages) {
    const li = document.createElement('li');
    const words = [s.artist, s.venue, STATE[s.state], s.role && s.role !== 'artist' ? s.role : ''].filter(Boolean).join(' · ');
    const a = Object.assign(document.createElement('a'), { className: 'btn primary', href: s.url, textContent: 'Open' });
    a.addEventListener('click', () => onOpen(s));
    li.append(Object.assign(document.createElement('span'), { textContent: words || 'A gig' }), a);
    ul.append(li);
  }
  return ul;
}

// ---- The home page (home.html, parked since 15 Nov): "Been before? Back to your gigs".
const $ = (id) => document.getElementById(id);
if ($('come-back') && !document.body.classList.contains('judge')) {
  const say = (text) => { $('door-said').textContent = text; $('door-said').hidden = !text; };
  const busy = (on) => { $('come-back').disabled = on; };
  if (passkeysWork()) {
    warm(); // a challenge ahead, so the passkey sheet opens straight from the tap
    $('come-back').addEventListener('click', async () => {
      say(''); busy(true);
      try {
        const out = await backToGigs();
        if (out?.stages.length === 1) { location.href = out.stages[0].url; return; }
        if (out && !out.stages.length) say('No gigs open on this passkey now: practice gigs close 7 days after they’re made.');
        else if (out) { $('your-gigs')?.replaceChildren(gigsList(out.stages)); }
      } catch (e) { say(e.message || 'That didn’t work: try again.'); }
      busy(false);
    });
    if (location.hash === '#back') $('come-back').focus();
  } else busy(true); // Back to your gigs needs a passkey; Judge for yourself doesn't
}
