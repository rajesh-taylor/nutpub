// Nutzap checks (server/nutzap.js, NIP-61): the artist's "Nutzap me here" note (kind 10019) and a fan's Nutzap note
// (kind 9321), signed here as an extension or signer app would, and every way one can be wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { eventId } from '../server/nostr.js';
import { checkInfo, checkNutzap, relaysOf, INFO_KIND, NUTZAP_KIND } from '../server/nutzap.js';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const MINT = 'https://testnut.cashu.space';
const ARTIST_SK = hexToBytes('0000000000000000000000000000000000000000000000000000000000000005');
const FAN_SK = hexToBytes('0000000000000000000000000000000000000000000000000000000000000007');
const ARTIST = hex(schnorr.getPublicKey(ARTIST_SK));
const FAN = hex(schnorr.getPublicKey(FAN_SK));
const LOCK = '02511095c6bc30aa2700bb26c9fb0fcde445d03141b318f58063fa998c8409e02f'; // the artist's wallet key (Takings)
const AT = 1_794_500_000;
async function sign(ev, sk) {
  const e = { pubkey: hex(schnorr.getPublicKey(sk)), created_at: AT, content: '', ...ev };
  e.id = await eventId(e);
  e.sig = hex(schnorr.sign(hexToBytes(e.id), sk, new Uint8Array(32)));
  return e;
}
const infoTags = (over = {}) => [['relay', 'wss://relay.damus.io'], ['mint', over.mint ?? MINT, 'sat'], ['pubkey', over.lock ?? LOCK]];
const proof = (n) => ({ amount: 2 ** n, id: '00ad268c4d1f5826', secret: `["P2PK",{"nonce":"${n}","data":"${LOCK}"}]`, C: `02${String(n).repeat(64).slice(0, 64)}` });
const PROOFS = [proof(1), proof(4)];
const zapTags = (proofs = PROOFS, over = {}) => [...proofs.map((p) => ['proof', JSON.stringify(p)]), ['u', over.mint ?? MINT], ['p', over.to ?? ARTIST]];
const zap = (over = {}, sk = FAN_SK) => sign({ kind: NUTZAP_KIND, tags: over.tags ?? zapTags(), content: over.content ?? 'great set', created_at: over.at ?? AT }, sk);
const check = (ev, over = {}) => checkNutzap(ev, { proofs: PROOFS, fan: FAN, artist: ARTIST, mint: MINT, at: AT, ...over });

test('Nutzap me here: our mint, the artist’s lock key, a relay', async () => {
  const ev = await sign({ kind: INFO_KIND, tags: infoTags() }, ARTIST_SK);
  assert.equal(await checkInfo(ev, LOCK, MINT), null);
  assert.deepEqual(relaysOf(ev), ['wss://relay.damus.io']);
  assert.equal(await checkInfo(ev, LOCK, `${MINT}/`), null, 'a trailing slash is the same mint');
});

test('Nutzap me here, refused', async () => {
  const good = await sign({ kind: INFO_KIND, tags: infoTags() }, ARTIST_SK);
  assert.equal(await checkInfo({ ...good, content: 'x' }, LOCK, MINT), 'bad_signature');
  assert.equal(await checkInfo(await sign({ kind: 1, tags: infoTags() }, ARTIST_SK), LOCK, MINT), 'wrong_kind');
  assert.equal(await checkInfo(await sign({ kind: INFO_KIND, tags: infoTags({ mint: 'https://other.mint' }) }, ARTIST_SK), LOCK, MINT), 'wrong_mint');
  assert.equal(await checkInfo(good, `03${LOCK.slice(2)}`, MINT), 'wrong_lock', 'an old key from before a new one on Takings');
  assert.equal(await checkInfo(await sign({ kind: INFO_KIND, tags: infoTags({ lock: ARTIST }) }, ARTIST_SK), LOCK, MINT), 'wrong_lock', 'a 32-byte key is not a lock key');
  assert.equal(await checkInfo(await sign({ kind: INFO_KIND, tags: infoTags().slice(1) }, ARTIST_SK), LOCK, MINT), 'no_relays');
  assert.equal(await checkInfo(await sign({ kind: INFO_KIND, tags: [['relay', 'http://plain.example'], ...infoTags().slice(1)] }, ARTIST_SK), LOCK, MINT), 'no_relays');
});

test('a Nutzap: the fan signed in, to the artist, carrying the payment’s coins', async () => {
  assert.equal(await check(await zap()), null);
  // The coins in any order, and the note may carry DLEQ proofs (NIP-61 asks for them) the payment doesn't show.
  assert.equal(await check(await zap({ tags: zapTags([{ ...PROOFS[1], dleq: { e: 'aa', s: 'bb', r: 'cc' } }, PROOFS[0]]) })), null);
  assert.equal(await check(await zap({ at: AT - 290 })), null, 'signed 290 s ago: a phone app can be slow');
});

test('a Nutzap, refused', async () => {
  const good = await zap();
  assert.equal(await check({ ...good, content: 'changed' }), 'bad_signature');
  assert.equal(await check(await sign({ kind: 1, tags: zapTags(), content: '' }, FAN_SK)), 'wrong_kind');
  assert.equal(await check(await zap({}, ARTIST_SK)), 'not_you', 'signed by someone other than the fan signed in');
  assert.equal(await check(good, { fan: null }), 'not_you', 'not signed in');
  assert.equal(await check(await zap({ at: AT - 301 })), 'too_old');
  assert.equal(await check(await zap({ tags: zapTags(PROOFS, { to: FAN }) })), 'wrong_artist');
  assert.equal(await check(await zap({ tags: zapTags(PROOFS, { mint: 'https://other.mint' }) })), 'wrong_mint');
  assert.equal(await check(await zap({ content: 'x'.repeat(281) })), 'too_long');
  assert.equal(await check(await zap({ tags: zapTags([PROOFS[0]]) })), 'wrong_coins', 'one coin missing');
  assert.equal(await check(await zap({ tags: zapTags([...PROOFS, proof(2)]) })), 'wrong_coins', 'a coin that wasn’t paid');
  assert.equal(await check(await zap({ tags: zapTags([PROOFS[0], { ...PROOFS[1], amount: 32 }]) })), 'wrong_coins', 'a bigger amount than paid');
  assert.equal(await check(await zap({ tags: zapTags([PROOFS[0], { ...PROOFS[1], C: `03${PROOFS[1].C.slice(2)}` }]) })), 'wrong_coins', 'another signature');
  assert.equal(await check(await zap({ tags: [['proof', '{not json'], ...zapTags([])] })), 'wrong_coins');
});
