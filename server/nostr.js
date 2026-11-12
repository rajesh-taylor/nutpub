// Nostr sign-in for the chat (12 Nov): a fan with a Nostr browser extension (NIP-07: Alby, nos2x, …) shows their
// Nostr name in place of "guest 3f2a", in the chat and on the room's tippers screen. Nothing to sign up for, no
// password: the extension signs one short note saying "this is me, signing in to thenutpub.com just now" (NIP-98's
// HTTP auth, kind 27235), and the page sends along the fan's own profile (kind 0), which they signed when they made
// it. Both signatures are checked here (BIP-340 Schnorr), so a name can't be borrowed from someone else's profile.
// Kept: the phone's pass, the public key and the name, for the night; New night and closing the gig delete it.
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { bech32 } from '@scure/base';
import { one, run } from './db.js';
import { json, body, now } from './http.js';

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const utf8 = new TextEncoder();
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export const AUTH_KIND = 27235; // NIP-98
export const SKEW = 60; // seconds either side of now

// NIP-01: an event's id is the SHA-256 of [0, pubkey, created_at, kind, tags, content] as compact JSON.
export const serialize = (ev) => JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
export async function eventId(ev) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(serialize(ev)))));
}
// A well-formed event whose id is its contents' hash and whose signature is its pubkey's.
export async function verifyEvent(ev) {
  if (!ev || typeof ev !== 'object' || !HEX64.test(ev.pubkey) || !HEX64.test(ev.id) || !HEX128.test(ev.sig)) return false;
  if (!Number.isInteger(ev.kind) || !Number.isInteger(ev.created_at) || typeof ev.content !== 'string') return false;
  if (!Array.isArray(ev.tags) || !ev.tags.every((t) => Array.isArray(t) && t.every((s) => typeof s === 'string'))) return false;
  if ((await eventId(ev)) !== ev.id) return false;
  try { return schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey)); } catch { return false; }
}
const tag = (ev, name) => ev.tags.find((t) => t[0] === name)?.[1];

// The sign-in note: signed just now, for this address and POST (NIP-98). `url` may be a test for the address.
export async function checkAuth(ev, url, at = Math.floor(Date.now() / 1000)) {
  const place = typeof url === 'function' ? url : (u) => u === url;
  if (!(await verifyEvent(ev))) return 'bad_signature';
  if (ev.kind !== AUTH_KIND) return 'wrong_kind';
  if (Math.abs(ev.created_at - at) > SKEW) return 'too_old';
  if (!place(tag(ev, 'u')) || String(tag(ev, 'method') || '').toUpperCase() !== 'POST') return 'wrong_place';
  return null;
}

// The name from a profile, cleaned for one line of chat: no control or direction-changing characters, 32 at most.
export function cleanName(s) {
  const t = String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [...t].slice(0, 32).join('').trim();
}
export async function profileName(ev, pubkey) {
  if (!ev || ev.kind !== 0 || ev.pubkey !== pubkey || !(await verifyEvent(ev))) return '';
  try { const p = JSON.parse(ev.content); return cleanName(p.display_name || p.displayName || p.name || ''); } catch { return ''; }
}
export const npub = (pubkey) => bech32.encode('npub', bech32.toWords(hexToBytes(pubkey)));
export const shortNpub = (pubkey) => { const n = npub(pubkey); return `${n.slice(0, 9)}…${n.slice(-4)}`; };

// For the chat: this pass's Nostr handle, if it signed in.
export const nostrOf = (pass) => one('SELECT pubkey, name FROM nostr WHERE pass = ?', pass);
export const handle = (row) => (row ? row.name || shortNpub(row.pubkey) : null);

export function mountNostr(route, pass) {
  route('GET', '/api/nostr', pass, async (c) => {
    const row = await nostrOf(c.pass);
    return json(row ? { name: handle(row), npub: npub(row.pubkey) } : {});
  });
  route('POST', '/api/nostr', pass, async (c) => {
    const b = await body(c);
    // As for passkeys: the live site is https; `wrangler dev` hands the Worker http, and there localhost is allowed.
    const live = `https://${c.url.host}/api/nostr`;
    const dev = c.url.protocol === 'http:';
    const why = await checkAuth(b?.auth, (u) => u === live || (dev && /^http:\/\/localhost(:\d+)?\/api\/nostr$/.test(u)));
    if (why) return json({ error: why, detail: 'Your Nostr sign-in didn’t check out: try again.' }, 400);
    const pubkey = b.auth.pubkey;
    const name = await profileName(b.profile, pubkey);
    await run('INSERT INTO nostr (pass, pubkey, name, at) VALUES (?, ?, ?, ?) ON CONFLICT (pass) DO UPDATE SET pubkey = excluded.pubkey, name = excluded.name, at = excluded.at',
      c.pass, pubkey, name || null, now());
    return json({ name: name || shortNpub(pubkey), npub: npub(pubkey) });
  });
  route('DELETE', '/api/nostr', pass, async (c) => {
    await run('DELETE FROM nostr WHERE pass = ?', c.pass);
    return json({ ok: true });
  });
}
