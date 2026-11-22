// The 12 words win the gig back (session 54): client/recover.js makes the words' recovery key and signs; server/recover.js
// checks. Known answers first (the global rule: no new signing without them): RFC 5869's HKDF and RFC 8032's Ed25519, both
// through the very calls the pages use; then our own, frozen, and made again by Node's own crypto (an independent
// implementation). Then the gig's routes. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { hkdfSync, createPrivateKey, createPublicKey, sign as nodeSign } from 'node:crypto';
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { recoverSeed, recoverPublic, signRecover, recoverMessage as clientMessage, RECOVER_INFO } from '../client/recover.js';
import { recoverMessage as serverMessage, recoverSigned, mountRecover } from '../server/recover.js';
import { withStage, kv } from '../server/db.js';
import { makeChallenge } from '../server/passkey.js';

const hex = (b) => Buffer.from(b).toString('hex');
const unhex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));
const WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const FIELDS = { stage: 'x7k2p9', challenge: 'A'.repeat(54), recoverKey: 'aa'.repeat(32), artistKey: '02' + 'bb'.repeat(32) };

test('HKDF-SHA256 through WebCrypto: RFC 5869 test cases 1 and 3 (case 3: no salt, as the words use)', async () => {
  const hkdf = async (ikm, salt, info, bits) => hex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
    await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bits));
  const ikm = new Uint8Array(22).fill(0x0b);
  assert.equal(await hkdf(ikm, unhex('000102030405060708090a0b0c'), unhex('f0f1f2f3f4f5f6f7f8f9'), 336),
    '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  assert.equal(await hkdf(ikm, new Uint8Array(0), new Uint8Array(0), 336),
    '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8');
});

test('Ed25519: RFC 8032 test 1, signed by @noble/curves, checked by WebCrypto', async () => {
  const sk = unhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
  const pk = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const sig = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
  assert.equal(hex(ed25519.getPublicKey(sk)), pk);
  assert.equal(hex(ed25519.sign(new Uint8Array(0), sk)), sig);
  const key = await crypto.subtle.importKey('raw', unhex(pk), { name: 'Ed25519' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'Ed25519' }, key, unhex(sig), new Uint8Array(0)), true);
});

test('our known answer: these words → this recovery key → this signature (and Node’s own crypto agrees)', async () => {
  const seed = await recoverSeed(WORDS);
  assert.equal(hex(seed), '8d900852e1b014e775ed418fca01bcb783028731b608d79c94ad96e6db12cc0a');
  // The info is the tag and one zero byte (the global rule's form); the input is the words' 16 bytes, not the wallet's seed.
  const node = hkdfSync('sha256', mnemonicToEntropy(WORDS, wordlist), Buffer.alloc(0), Buffer.concat([Buffer.from(RECOVER_INFO), Buffer.from([0])]), 32);
  assert.equal(hex(Buffer.from(node)), hex(seed));
  const pub = await recoverPublic(WORDS);
  assert.equal(pub, 'f07099e084a16c720b204cf905716cf30c4f2a3406d3057e9276322ea39003ff');
  const nodeKey = createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: Buffer.from(seed).toString('base64url'), x: Buffer.from(unhex(pub)).toString('base64url') }, format: 'jwk' });
  assert.equal(Buffer.from(createPublicKey(nodeKey).export({ format: 'jwk' }).x, 'base64url').toString('hex'), pub);
  const sig = await signRecover(WORDS, FIELDS);
  assert.equal(sig, '50a4146188fdf3e403f55eb07b8c5be3a683969284c5d5af3ec49de5de973e05152873df35e29c568125b8665a4f11bedaae64c8f5dbf9e2536315e7af4c5502');
  assert.equal(hex(nodeSign(null, clientMessage(FIELDS), nodeKey)), sig); // Ed25519 is deterministic: same bytes
  // Another set of words makes another key.
  assert.notEqual(await recoverPublic(OTHER), pub);
});

test('the page and the gig sign and check the same bytes; any change to what was signed fails', async () => {
  assert.deepEqual(serverMessage(FIELDS), clientMessage(FIELDS));
  assert.equal(hex(clientMessage(FIELDS)).startsWith(hex(Buffer.from(`${RECOVER_INFO}\0x7k2p9\0`))), true);
  const pub = await recoverPublic(WORDS);
  const sig = await signRecover(WORDS, FIELDS);
  assert.equal(await recoverSigned(pub, sig, FIELDS), true);
  for (const change of [{ stage: 'q4m8z1' }, { challenge: 'B'.repeat(54) }, { recoverKey: 'cc'.repeat(32) }, { artistKey: '03' + 'bb'.repeat(32) }]) {
    assert.equal(await recoverSigned(pub, sig, { ...FIELDS, ...change }), false, JSON.stringify(change));
  }
  assert.equal(await recoverSigned(await recoverPublic(OTHER), sig, FIELDS), false);
  assert.equal(await recoverSigned(pub, 'zz', FIELDS), false);
});

// ---- The gig's routes, on a stage (its own SQLite) beside thenutpub.com's D1.
let stageSql; let frontSql; let stage; let env; let call;
const fake = (sqlite) => {
  const statement = (text, args = []) => ({
    text, args, bind: (...a) => statement(text, a),
    first: async () => sqlite.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(text).all(...args) }),
    run: async () => { const r = sqlite.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (text) => statement(text), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
};
beforeEach(() => {
  stageSql = new DatabaseSync(':memory:');
  stageSql.exec(readFileSync('schema.sql', 'utf8'));
  frontSql = new DatabaseSync(':memory:');
  frontSql.exec(readFileSync('schema.sql', 'utf8'));
  stage = { id: 'x7k2p9', adminKey: 'old-setup-key', prefix: 'x7k2p9:', ...fake(stageSql) };
  stageSql.prepare("INSERT INTO kv (key, value) VALUES ('stage-self', ?)").run(JSON.stringify({ id: 'x7k2p9', adminKey: 'old-setup-key' }));
  env = { DB: fake(frontSql) };
  frontSql.exec("INSERT INTO key_stages (key, stage, role, created) VALUES ('thief-or-old', 'x7k2p9', 'artist', '2026-11-22'), ('thief-or-old', 'q4m8z1', 'artist', '2026-11-22')");
  const table = {};
  const admin = (c) => (c.req.headers.get('X-Admin') === stage.adminKey ? null : new Response('{"error":"forbidden"}', { status: 403 }));
  mountRecover((method, path, ...steps) => { table[`${method} ${path}`] = async (c) => { for (const s of steps) { const r = await s(c); if (r) return r; } }; }, admin);
  call = (method, path, data, headers = {}) => withStage(stage, async () => {
    const req = new Request(`https://x7k2p9.thenutpub.com${path}`, { method, headers, body: data ? JSON.stringify(data) : undefined });
    const res = await table[`${method} ${path}`]({ req, url: new URL(req.url), params: {}, env });
    return { status: res.status, ...(await res.json()) };
  });
});
const inStage = (fn) => withStage(stage, fn);
const NEXT = { recoverKey: 'cc'.repeat(32), artistKey: '03' + 'dd'.repeat(32) };
const open = async (words, next = NEXT) => {
  const challenge = await inStage(() => makeChallenge());
  return call('POST', '/api/recover', { challenge, ...next, sig: await signRecover(words, { stage: 'x7k2p9', challenge, ...next }) });
};

test('the words’ key is set once by the setup key; the same again is fine; another is refused', async () => {
  const pub = await recoverPublic(WORDS);
  assert.equal((await call('PUT', '/api/admin/recover-key', { pubkey: pub })).status, 403); // no setup key
  assert.equal((await call('PUT', '/api/admin/recover-key', { pubkey: pub }, { 'X-Admin': 'old-setup-key' })).status, 200);
  assert.equal((await call('PUT', '/api/admin/recover-key', { pubkey: pub }, { 'X-Admin': 'old-setup-key' })).status, 200);
  const swap = await call('PUT', '/api/admin/recover-key', { pubkey: await recoverPublic(OTHER) }, { 'X-Admin': 'old-setup-key' });
  assert.equal(swap.status, 409); // a stolen browser with the setup key can't swap the words
  assert.equal((await call('GET', '/api/admin/recover-key', null, { 'X-Admin': 'old-setup-key' })).pubkey, pub);
});

test('the right words open the gig: a new setup key, the next keys, off every passkey, a claim code', async () => {
  assert.equal((await open(WORDS)).status, 409); // no words on record yet
  await inStage(async () => { await kv.set('recoverKey', await recoverPublic(WORDS)); await kv.set('artistKey', '02' + 'ee'.repeat(32)); await kv.set('handoff', { hash: 'x', until: Date.now() + 1e6 }); await kv.set('artist-passkey', { name: 'NutPub · Artist · 22 Nov' }); });
  assert.equal((await open(OTHER)).status, 403); // words for another gig
  const r = await open(WORDS);
  assert.equal(r.status, 200);
  assert.match(r.key, /^[0-9a-f]{64}$/);
  assert.notEqual(r.key, 'old-setup-key');
  assert.equal(stage.adminKey, r.key);
  assert.equal(JSON.parse(stageSql.prepare("SELECT value FROM kv WHERE key = 'stage-self'").get().value).adminKey, r.key);
  // The old setup key is out (every other browser signed out), and no Sign in on your phone code is left.
  assert.equal((await call('GET', '/api/admin/recover-key', null, { 'X-Admin': 'old-setup-key' })).status, 403);
  await inStage(async () => {
    assert.equal(await kv.get('handoff'), null);
    assert.equal(await kv.get('artistKey'), NEXT.artistKey);
    assert.equal(await kv.get('recoverKey'), NEXT.recoverKey);
    assert.equal(await kv.get('artist-passkey'), null);
  });
  // Off every passkey, this gig only; a claim code (its SHA-256) for the next passkey.
  assert.deepEqual(frontSql.prepare('SELECT stage FROM key_stages').all().map((x) => x.stage), ['q4m8z1']);
  assert.equal(frontSql.prepare('SELECT COUNT(*) AS n FROM stage_claims WHERE stage = ?').get('x7k2p9').n, 1);
  assert.equal(frontSql.prepare('SELECT COUNT(*) AS n FROM stage_claims WHERE hash = ?').get(r.claim).n, 0);
  // The old words open nothing now.
  assert.equal((await open(WORDS)).status, 403);
});

test('a challenge works once; bad keys are refused before anything changes', async () => {
  await inStage(async () => kv.set('recoverKey', await recoverPublic(WORDS)));
  const challenge = await inStage(() => makeChallenge());
  const sig = await signRecover(WORDS, { stage: 'x7k2p9', challenge, ...NEXT });
  assert.equal((await call('POST', '/api/recover', { challenge, ...NEXT, artistKey: 'nope', sig })).status, 400);
  assert.equal((await call('POST', '/api/recover', { challenge, ...NEXT, sig })).status, 200);
  assert.equal((await call('POST', '/api/recover', { challenge, ...NEXT, sig })).status, 403); // the key's changed: the old words are out
});
