// Passkey checks (server/passkey.js): real signatures made here with WebCrypto, as a phone's password manager would,
// then every way one can be wrong. Plus a frozen known answer (a P-256 key, its DER signature) so a change to the
// DER handling or the signed bytes shows up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { useDb, run } from '../server/db.js';
import { b64u, derToRaw, readAuthData, checkCreate, checkGet, makeChallenge, challengeOk, mountPasskeys } from '../server/passkey.js';

const utf8 = new TextEncoder();
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
const SITE = { origin: 'https://thenutpub.com', rpId: 'thenutpub.com' };

// r||s to DER, as authenticators send it.
function rawToDer(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = cat([0], b); return cat([0x02, b.length], b); };
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return cat([0x30, body.length], body);
}
const authData = async ({ rpId = SITE.rpId, flags = 0x01 | 0x04 | 0x08 | 0x10, count = 0, credId } = {}) => {
  const c = new Uint8Array(4); new DataView(c.buffer).setUint32(0, count);
  const head = cat(await sha256(utf8.encode(rpId)), [credId ? flags | 0x40 : flags], c);
  if (!credId) return head;
  return cat(head, new Uint8Array(16), [credId.length >> 8, credId.length & 0xff], credId, [0xa0]); // aaguid, id, (COSE key: not read)
};
const clientData = (type, challenge, origin = SITE.origin) => b64u.enc(utf8.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false })));

async function phone(alg = -7) {
  const params = alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : alg === -8 ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const keys = await crypto.subtle.generateKey(params, true, ['sign', 'verify']);
  const credId = crypto.getRandomValues(new Uint8Array(20));
  const publicKey = b64u.enc(await crypto.subtle.exportKey('spki', keys.publicKey));
  const create = async (challenge, opts = {}) => ({ challenge, id: b64u.enc(credId), alg, publicKey,
    clientDataJSON: clientData('webauthn.create', challenge, opts.origin), authenticatorData: b64u.enc(await authData({ ...opts, credId })) });
  const get = async (challenge, opts = {}) => {
    const ad = await authData(opts);
    const cd = clientData(opts.type || 'webauthn.get', challenge, opts.origin);
    const signed = cat(ad, await sha256(b64u.dec(cd)));
    let sig = new Uint8Array(await crypto.subtle.sign(alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : params, keys.privateKey, signed));
    if (alg === -7) sig = rawToDer(sig);
    return { challenge, id: b64u.enc(credId), clientDataJSON: cd, authenticatorData: b64u.enc(ad), signature: b64u.enc(sig) };
  };
  return { create, get };
}

test('a new passkey, then Find my ticket, for ES256, Ed25519 and RS256', async () => {
  for (const alg of [-7, -8, -257]) {
    const p = await phone(alg);
    const kept = await checkCreate(await p.create('c1'), { ...SITE, challenge: 'c1' });
    assert.equal(kept.alg, alg);
    assert.equal(kept.synced, true);
    const auth = await checkGet(await p.get('c2'), kept, { ...SITE, challenge: 'c2' });
    assert.equal(auth.up, true);
  }
});

test('every wrong passkey check is refused', async () => {
  const p = await phone();
  const kept = await checkCreate(await p.create('c1'), { ...SITE, challenge: 'c1' });
  const want = { ...SITE, challenge: 'c2' };
  const no = async (r, code, stored = kept) => assert.rejects(checkGet(r, stored, want), new RegExp(code));
  await no(await p.get('other'), 'wrong_challenge');
  await no(await p.get('c2', { origin: 'https://thenutpub.com.evil.example' }), 'wrong_origin');
  await no(await p.get('c2', { rpId: 'evil.example' }), 'wrong_site');
  await no(await p.get('c2', { type: 'webauthn.create' }), 'wrong_type');
  await no(await p.get('c2', { flags: 0x04 }), 'no_presence');
  const r = await p.get('c2');
  const sig = b64u.dec(r.signature); sig[sig.length - 1] ^= 1;
  await no({ ...r, signature: b64u.enc(sig) }, 'bad_signature');
  await no(await (await phone()).get('c2'), 'bad_signature'); // someone else's passkey, claiming this one's id
  await no(await p.get('c2', { count: 5 }), 'cloned', { ...kept, count: 7 });
  await checkGet(await p.get('c2', { count: 8 }), { ...kept, count: 7 }, want); // counting up is fine
});

test('a new passkey must be for this site and carry its own id', async () => {
  const p = await phone();
  await assert.rejects(checkCreate(await p.create('c1'), { ...SITE, challenge: 'x' }), /wrong_challenge/);
  await assert.rejects(checkCreate(await p.create('c1', { rpId: 'evil.example' }), { ...SITE, challenge: 'c1' }), /wrong_site/);
  await assert.rejects(checkCreate({ ...(await p.create('c1')), id: 'AAAA' }, { ...SITE, challenge: 'c1' }), /wrong_id/);
  await assert.rejects(checkCreate({ ...(await p.create('c1')), alg: -35 }, { ...SITE, challenge: 'c1' }), /unsupported_alg/);
});

test('known answer: a P-256 DER signature over fixed bytes', async () => {
  // Made once with WebCrypto (11 Nov 2026) and frozen here.
  const spki = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsHiQ7rIjSbQWOWgODOyj7EhQf-g3O3-jAFTlMVZPzgKKKyJKnU4EuKgA4s3rNECi0YiV8SWklan5zVGN9-TxrQ';
  const der = 'MEQCIHdO8p2rySmkAfM4kUqZbhAMzenUJLsGuCL3L-iEJCqZAiA81JObz1y8UKCBaBpFlpGjaDa3GZ1_1UHziNdzdSfcGg';
  const key = await crypto.subtle.importKey('spki', b64u.dec(spki), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const msg = utf8.encode('NutPub passkey known answer, 11 Nov 2026');
  const ecdsa = { name: 'ECDSA', hash: 'SHA-256' };
  assert.equal(await crypto.subtle.verify(ecdsa, key, derToRaw(b64u.dec(der)), msg), true);
  assert.equal(await crypto.subtle.verify(ecdsa, key, derToRaw(b64u.dec(der)), utf8.encode('something else')), false);
});

test('DER signatures: short r and s, and junk', () => {
  const raw = derToRaw(Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x05, 0x02, 0x01, 0x07]));
  assert.equal(raw.length, 64);
  assert.equal(raw[31], 5);
  assert.equal(raw[63], 7);
  assert.throws(() => derToRaw(Uint8Array.from([0x31, 0x06, 0x02, 0x01, 0x05, 0x02, 0x01, 0x07])), /bad_signature/);
  assert.throws(() => derToRaw(Uint8Array.from([0x30, 0x07, 0x02, 0x01, 0x05, 0x02, 0x01, 0x07, 0x00])), /bad_signature/);
});

test('the authenticator data is read right', async () => {
  const id = Uint8Array.from([1, 2, 3]);
  const a = readAuthData(await authData({ count: 258, credId: id }));
  assert.deepEqual([...a.credentialId], [1, 2, 3]);
  assert.equal(a.count, 258);
  assert.equal(a.uv, true);
});

// ---- The routes, over an in-memory SQLite with the real tables (D1's few calls).
function routes() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  useDb({ prepare: (text) => ({ bind: (...args) => {
    const st = db.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } };
  } }) });
  const table = {};
  const pass = async (c) => { c.pass = c.req.headers.get('X-Pass') || ''; return null; };
  mountPasskeys((method, path, ...steps) => { table[`${method} ${path}`] = async (c) => { for (const s of steps) { const r = await s(c); if (r) return r; } }; }, pass);
  return async (method, path, data, headers = {}) => {
    const req = new Request(`https://thenutpub.com${path}`, { method, headers, body: data ? JSON.stringify(data) : undefined });
    const res = await table[`${method} ${path}`]({ req, url: new URL(req.url), params: {} });
    return { status: res.status, ...(await res.json()) };
  };
}
const challenge = async (call) => (await call('POST', '/api/passkey/challenge')).challenge;

test('challenges: made without a write, five minutes, signed, used once', async () => {
  routes();
  const c = await makeChallenge();
  assert.equal(await challengeOk(c), true);
  assert.equal(await challengeOk(c, Date.now() + 6 * 60 * 1000), false);
  const b = b64u.dec(c); b[10] ^= 1;
  assert.equal(await challengeOk(b64u.enc(b)), false);
  assert.equal(await challengeOk('junk'), false);
});

test('a ticket kept with a passkey comes back with Find my ticket, once per challenge', async () => {
  const call = routes();
  await run("INSERT INTO tickets (pass, sats, at, kind, code, secret) VALUES ('p1', 100, 'now', 'room', 'c0de', 's3cret')");
  const p = await phone();
  let ch = await challenge(call);
  assert.equal((await call('POST', '/api/passkey', await p.create(ch), { 'X-Pass': 'nobody' })).error, 'no_ticket');
  const made = await call('POST', '/api/passkey', await p.create(ch), { 'X-Pass': 'p1' });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal((await call('POST', '/api/passkey', await p.create(ch), { 'X-Pass': 'p1' })).error, 'old_challenge');
  ch = await challenge(call);
  const found = await call('POST', '/api/passkey/check', await p.get(ch));
  assert.deepEqual([found.pass, found.kind, found.code, found.secret], ['p1', 'room', 'c0de', 's3cret']);
  assert.equal((await call('POST', '/api/passkey/check', await p.get(ch))).error, 'old_challenge');
  assert.equal((await call('POST', '/api/passkey/check', await (await phone()).get(await challenge(call)))).error, 'no_ticket');
  await run('DELETE FROM tickets'); // New night
  assert.equal((await call('POST', '/api/passkey/check', await p.get(await challenge(call)))).error, 'no_ticket');
});
