// Nostr sign-in checks (server/nostr.js): BIP-340's own test vectors for the Schnorr check, then real events signed
// here as an extension would, and every way one can be wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { serialize, eventId, verifyEvent, checkAuth, profileName, cleanName, npub, shortNpub, AUTH_KIND } from '../server/nostr.js';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const URL_ = 'https://thenutpub.com/api/nostr';
const SK = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003');
const PK = hex(schnorr.getPublicKey(SK));
async function sign(ev, sk = SK) {
  const e = { pubkey: hex(schnorr.getPublicKey(sk)), ...ev };
  e.id = await eventId(e);
  e.sig = hex(schnorr.sign(hexToBytes(e.id), sk, new Uint8Array(32)));
  return e;
}
const auth = (at, tags = [['u', URL_], ['method', 'POST']]) => sign({ kind: AUTH_KIND, created_at: at, tags, content: '' });

test('BIP-340 vectors 0 and 1: the Schnorr check itself', () => {
  // Vector 0: secret key 3, message and aux all zero.
  assert.equal(PK, 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
  const sig0 = 'e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0';
  assert.equal(hex(schnorr.sign(new Uint8Array(32), SK, new Uint8Array(32))), sig0);
  assert.ok(schnorr.verify(hexToBytes(sig0), new Uint8Array(32), hexToBytes(PK)));
  // Vector 1.
  const pk1 = 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659';
  const msg1 = '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89';
  const sig1 = '6896bd60eeae296db48a229ff71dfe071bde413e6d43f917dc8dcf8c78de33418906d11ac976abccb20b091292bff4ea897efcb639ea871cfa95f6de339e4b0a';
  assert.ok(schnorr.verify(hexToBytes(sig1), hexToBytes(msg1), hexToBytes(pk1)));
});

test('the id is the hash of NIP-01\'s compact JSON', async () => {
  const ev = { pubkey: PK, created_at: 1700000000, kind: 1, tags: [['t', 'gig']], content: 'Cheers "Longy"\n' };
  assert.equal(serialize(ev), `[0,"${PK}",1700000000,1,[["t","gig"]],"Cheers \\"Longy\\"\\n"]`);
  assert.match(await eventId(ev), /^[0-9a-f]{64}$/);
});

test('a signed event checks out; any change to it does not', async () => {
  const ev = await sign({ kind: 1, created_at: 1700000000, tags: [], content: 'hi' });
  assert.ok(await verifyEvent(ev));
  assert.equal(await verifyEvent({ ...ev, content: 'hj' }), false); // id no longer the hash
  const other = await sign({ kind: 1, created_at: 1700000000, tags: [], content: 'hi' }, hexToBytes('11'.repeat(32)));
  assert.equal(await verifyEvent({ ...ev, sig: other.sig }), false); // someone else's signature
  assert.equal(await verifyEvent({ ...ev, pubkey: other.pubkey }), false);
  assert.equal(await verifyEvent({ ...ev, tags: [[1]] }), false);
  assert.equal(await verifyEvent(null), false);
});

test('the sign-in note: just now, for this address, POST', async () => {
  const at = 1763000000;
  assert.equal(await checkAuth(await auth(at), URL_, at), null);
  assert.equal(await checkAuth(await auth(at - 61), URL_, at), 'too_old');
  assert.equal(await checkAuth(await auth(at + 61), URL_, at), 'too_old');
  assert.equal(await checkAuth(await auth(at, [['u', 'https://evil.example/api/nostr'], ['method', 'POST']]), URL_, at), 'wrong_place');
  assert.equal(await checkAuth(await auth(at, [['u', URL_], ['method', 'GET']]), URL_, at), 'wrong_place');
  assert.equal(await checkAuth(await sign({ kind: 1, created_at: at, tags: [['u', URL_], ['method', 'POST']], content: '' }), URL_, at), 'wrong_kind');
  const a = await auth(at);
  assert.equal(await checkAuth({ ...a, created_at: at - 1 }, URL_, at), 'bad_signature');
});

test('the name comes only from the signer\'s own profile', async () => {
  const mine = await sign({ kind: 0, created_at: 1, tags: [], content: JSON.stringify({ name: 'rt', display_name: 'Rajesh' }) });
  assert.equal(await profileName(mine, PK), 'Rajesh');
  const nameOnly = await sign({ kind: 0, created_at: 1, tags: [], content: JSON.stringify({ name: 'longy' }) });
  assert.equal(await profileName(nameOnly, PK), 'longy');
  const theirs = await sign({ kind: 0, created_at: 1, tags: [], content: JSON.stringify({ name: 'Jack' }) }, hexToBytes('22'.repeat(32)));
  assert.equal(await profileName(theirs, PK), ''); // someone else's profile: no name borrowed
  assert.equal(await profileName({ ...mine, content: JSON.stringify({ name: 'Satoshi' }) }, PK), ''); // altered
  assert.equal(await profileName(await sign({ kind: 0, created_at: 1, tags: [], content: 'not json' }), PK), '');
  assert.equal(await profileName(undefined, PK), '');
});

test('names are cleaned for one line of chat', () => {
  assert.equal(cleanName('  Ra‮jesh\n '), 'Ra jesh');
  assert.equal(cleanName('x'.repeat(50)).length, 32);
  assert.equal(cleanName('🎸'.repeat(40)), '🎸'.repeat(32)); // by character, not by byte
});

test('npub: NIP-19 encoding, and its short form', () => {
  // NIP-19's own example.
  assert.equal(npub('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e'), 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg');
  assert.equal(shortNpub('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e'), 'npub10elf…jptg');
});
