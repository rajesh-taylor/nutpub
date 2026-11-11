// Passkeys for tickets (WebAuthn): no account, no email. Made on the phone straight after paying and kept by its
// password manager (iCloud Keychain, Google, Proton Pass, Bitwarden, KeePassDX), so "Find my ticket" brings the
// ticket back after the browser's data is cleared, or on a new phone. Once a ticket has a passkey, the door QR's
// secret goes only to a browser that has just passed its check.
//
// We keep the passkey's public key and which ticket it opens; never anything about the person. Its user handle (the
// 32 bytes the password manager keeps with it) is made on the phone and never sent here: it's the ticket's seed, for
// the blind-signed ticket to come, so Find my ticket can restore that one from the mint without us linking buyer to door.
//
// Signatures are checked with WebCrypto only: ES256 (P-256, most phones), Ed25519, RS256 (Windows Hello).
import { one, run, kv } from './db.js';
import { json, body, now, randomHex } from './http.js';

const utf8 = new TextEncoder();
export const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (text) => {
    const s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
  },
};
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

const ALGS = {
  [-7]: { key: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' }, der: 32 },
  [-8]: { key: { name: 'Ed25519' }, verify: { name: 'Ed25519' } },
  [-257]: { key: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
};
export const ALG_IDS = Object.keys(ALGS).map(Number);

// An ECDSA signature arrives in DER (SEQUENCE { INTEGER r, INTEGER s }); WebCrypto wants r and s side by side.
export function derToRaw(der, size = 32) {
  const fail = () => { throw new Error('bad_signature'); };
  if (der[0] !== 0x30 || der.length < 8) fail();
  let o = 2;
  if (der[1] & 0x80) o = 2 + (der[1] & 0x7f);
  const part = () => {
    if (der[o] !== 0x02) fail();
    const len = der[o + 1];
    let n = der.slice(o + 2, o + 2 + len);
    o += 2 + len;
    while (n.length > size && n[0] === 0) n = n.slice(1);
    if (n.length > size) fail();
    return concat(new Uint8Array(size - n.length), n);
  };
  const r = part();
  const s = part();
  if (o !== der.length) fail();
  return concat(r, s);
}

// The authenticator's data: the site's hash (32 bytes), flags, the sign count; on registration, the credential's id.
export function readAuthData(bytes) {
  if (bytes.length < 37) throw new Error('bad_auth_data');
  const flags = bytes[32];
  const out = { rpIdHash: bytes.slice(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), synced: !!(flags & 0x10),
    count: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0) };
  if (flags & 0x40 && bytes.length >= 55) {
    const len = (bytes[53] << 8) | bytes[54];
    out.credentialId = bytes.slice(55, 55 + len);
  }
  return out;
}

// What both ceremonies check: the browser's own record (type, challenge, origin) and the site's hash.
async function common({ clientDataJSON, authenticatorData }, want) {
  const cd = JSON.parse(new TextDecoder().decode(b64u.dec(clientDataJSON)));
  if (want.dev && /^http:\/\/localhost(:\d+)?$/.test(cd.origin)) want = { ...want, origin: cd.origin, rpId: 'localhost' };
  if (cd.type !== want.type) throw new Error('wrong_type');
  if (cd.challenge !== want.challenge) throw new Error('wrong_challenge');
  if (cd.origin !== want.origin || cd.crossOrigin === true) throw new Error('wrong_origin');
  const auth = readAuthData(b64u.dec(authenticatorData));
  if (!equal(auth.rpIdHash, await sha256(utf8.encode(want.rpId)))) throw new Error('wrong_site');
  if (!auth.up) throw new Error('no_presence');
  return auth;
}

// A new passkey (attestation "none": we trust the phone, as everywhere else). Returns what to keep.
export async function checkCreate(r, want) {
  const auth = await common(r, { ...want, type: 'webauthn.create' });
  const alg = Number(r.alg);
  if (!ALGS[alg]) throw new Error('unsupported_alg');
  if (!auth.credentialId || b64u.enc(auth.credentialId) !== r.id) throw new Error('wrong_id');
  await crypto.subtle.importKey('spki', b64u.dec(r.publicKey), ALGS[alg].key, false, ['verify']); // a key that loads
  return { id: r.id, publicKey: r.publicKey, alg, count: auth.count, synced: auth.synced };
}

// A passkey check: its signature over the authenticator's data and the hash of the browser's record.
export async function checkGet(r, stored, want) {
  const auth = await common(r, { ...want, type: 'webauthn.get' });
  const a = ALGS[stored.alg];
  if (!a) throw new Error('unsupported_alg');
  const key = await crypto.subtle.importKey('spki', b64u.dec(stored.publicKey), a.key, false, ['verify']);
  const signed = concat(b64u.dec(r.authenticatorData), await sha256(b64u.dec(r.clientDataJSON)));
  let sig = b64u.dec(r.signature);
  if (a.der) sig = derToRaw(sig, a.der);
  if (!(await crypto.subtle.verify(a.verify, key, sig, signed))) throw new Error('bad_signature');
  // Synced passkeys always say 0; one that counts must count up, or it's been copied.
  if (auth.count && stored.count && auth.count <= stored.count) throw new Error('cloned');
  return auth;
}

// ---- Routes. The site is whatever the page was loaded from (thenutpub.com).
// A challenge is made without writing anything (pages fetch one ahead, so most are never used): the time, 16 random
// bytes and an HMAC over both, under a key of its own kept in kv. Only a used one is written down, so it can't be
// used twice.
const CHALLENGE_MS = 5 * 60 * 1000;
// `wrangler dev` hands the Worker the live site's address (http://thenutpub.com), so plain http means development:
// there a page on localhost may make and check passkeys for localhost (they can't open a live ticket's passkey).
const site = (c) => ({ origin: `https://${c.url.host}`, rpId: c.url.hostname, dev: c.url.protocol === 'http:' });
let hmacKey = null;
async function challengeKey() {
  if (hmacKey) return hmacKey;
  let hex = await kv.get('passkeyChallengeKey');
  if (!hex) { await run("INSERT OR IGNORE INTO kv (key, value) VALUES ('passkeyChallengeKey', ?)", JSON.stringify(randomHex(32))); hex = await kv.get('passkeyChallengeKey'); }
  const raw = Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));
  return (hmacKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
}
const tag = async (bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', await challengeKey(), bytes)).slice(0, 16);
export async function makeChallenge(ms = Date.now()) {
  const head = new Uint8Array(24);
  new DataView(head.buffer).setBigUint64(0, BigInt(ms));
  head.set(crypto.getRandomValues(new Uint8Array(16)), 8);
  return b64u.enc(concat(head, await tag(head)));
}
export async function challengeOk(value, ms = Date.now()) {
  let b;
  try { b = b64u.dec(value); } catch { return false; }
  if (b.length !== 40) return false;
  const at = Number(new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0));
  if (!(at <= ms + 5000 && ms - at < CHALLENGE_MS)) return false;
  const want = await tag(b.slice(0, 24));
  let d = 0; for (let i = 0; i < 16; i++) d |= want[i] ^ b[24 + i];
  return d === 0;
}
const spend = async (value) => {
  await run('DELETE FROM challenges WHERE at < ?', Date.now() - CHALLENGE_MS);
  return (await run('INSERT OR IGNORE INTO challenges (value, at) VALUES (?, ?)', value, Date.now())).meta.changes === 1;
};
const fail = (e) => json({ error: 'passkey', detail: String(e.message || e) }, 400);
const old = () => json({ error: 'old_challenge' }, 400);

export function mountPasskeys(route, pass) {
  route('POST', '/api/passkey/challenge', async () => json({ challenge: await makeChallenge(), ms: CHALLENGE_MS }));

  // Keep this ticket with a passkey: only the browser that holds the ticket's pass can add one.
  route('POST', '/api/passkey', pass, async (c) => {
    const b = await body(c);
    if (!(await one('SELECT 1 AS x FROM tickets WHERE pass = ?', c.pass))) return json({ error: 'no_ticket' }, 403);
    if ((await one('SELECT COUNT(*) AS n FROM passkeys WHERE pass = ?', c.pass)).n >= 5) return json({ error: 'too_many' }, 409);
    if (!(await challengeOk(b?.challenge))) return old();
    let k;
    try { k = await checkCreate(b, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    await run('INSERT OR IGNORE INTO passkeys (id, pass, pubkey, alg, count, synced, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
      k.id, c.pass, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, now());
    return json({ ok: true, synced: k.synced });
  });

  // Find my ticket, and the door QR's secret: a passkey check gives back the ticket's pass, its door code and secret.
  route('POST', '/api/passkey/check', async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    const k = await one('SELECT id, pass, pubkey AS publicKey, alg, count FROM passkeys WHERE id = ?', String(b?.id || ''));
    if (!k) return json({ error: 'no_ticket', detail: 'This passkey’s ticket was for another night.' }, 404);
    let auth;
    try { auth = await checkGet(b, k, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    await run('UPDATE passkeys SET count = ?, used = ? WHERE id = ?', auth.count, now(), k.id);
    const t = await one('SELECT kind, code, secret FROM tickets WHERE pass = ?', k.pass);
    if (!t) return json({ error: 'no_ticket', detail: 'This passkey’s ticket was for another night.' }, 404);
    const room = t.kind === 'room';
    return json({ pass: k.pass, kind: t.kind, code: room ? t.code : null, secret: room ? t.secret : null });
  });
}

export const passkeysOf = async (pass) => (await one('SELECT COUNT(*) AS n FROM passkeys WHERE pass = ?', pass)).n;
