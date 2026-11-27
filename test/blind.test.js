// Blind-signed tickets (server/blind.js): Cashu's own test vectors for the maths (NUT-00 and NUT-12, from
// github.com/cashubtc/nuts tests/00-tests.md and tests/12-tests.md), a frozen known answer for the ticket made from a
// seed, and the door's three checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync } from 'node:crypto';
import { hashToCurve, blindMessage, createBlindSignature, createDLEQProof, verifyDLEQProof, pointFromHex } from 'cashu-ts-next';
import { derive, ticketFrom, makeGigKey, signBlind, unblind, doorProof, readProof, checkProof, fingerprint, shortY, hex, unhex } from '../server/blind.js';

const big = (h) => BigInt(`0x${h}`);

test('NUT-00: hash_to_curve', () => {
  for (const [msg, Y] of [
    ['0000000000000000000000000000000000000000000000000000000000000000', '024cce997d3b518f739663b757deaec95bcd9473c30a14ac2fd04023a739d1a725'],
    ['0000000000000000000000000000000000000000000000000000000000000001', '022e7158e11c9506f1aa4248bf531298daa7febd6194f003edcd9b93ade6253acf'],
    ['0000000000000000000000000000000000000000000000000000000000000002', '026cdbe15362df59cd1dd3c9c11de8aedac2106eca69236ecd9fbe117af897be4f'],
  ]) assert.equal(hashToCurve(unhex(msg)).toHex(true), Y);
});

test('NUT-00: blinded messages', () => {
  for (const [x, r, B_] of [
    ['d341ee4871f1f889041e63cf0d3823c713eea6aff01e80f1719f08f9e5be98f6', '99fce58439fc37412ab3468b73db0569322588f62fb3a49182d67e23d877824a', '033b1a9737a40cc3fd9b6af4b723632b76a67a36782596304612a6c2bfb5197e6d'],
    ['f1aaf16c2239746f369572c0784d9dd3d032d952c2d992175873fb58fae31a60', 'f78476ea7cc9ade20f9e05e58a804cf19533f03ea805ece5fee88c8e2874ba50', '029bdf2d716ee366eddf599ba252786c1033f47e230248a4612a5670ab931f1763'],
  ]) assert.equal(blindMessage(unhex(x), big(r)).B_.toHex(true), B_);
});

test('NUT-00: blinded signatures', () => {
  const B_ = pointFromHex('02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2');
  assert.equal(createBlindSignature(B_, unhex(`${'00'.repeat(31)}01`), 'x').C_.toHex(true), '02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2');
  assert.equal(createBlindSignature(B_, unhex('7f'.repeat(32)), 'x').C_.toHex(true), '0398bc70ce8184d27ba89834d19f5199c84443c31131e48d3c1214db24247d005d');
});

test('NUT-12: the deterministic DLEQ proof, and a valid one on a BlindSignature', () => {
  const B_ = pointFromHex('02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2');
  const d = createDLEQProof(B_, unhex(`${'00'.repeat(31)}02`));
  assert.equal(hex(d.e), '2a16ffee280aff3c429045607f9b8e0bf8b35910c44c1b20b9dfaf01b263d7b3');
  assert.equal(hex(d.s), '9df27731238334718d120d4f74611a7c668233f988e687ac3fb188f0a34a2dab');
  assert.ok(verifyDLEQProof(d, B_, pointFromHex('0244eccfc7a348274458bb38044c7f3c389b3c2086c7ec18b5812d2877ab937787'), pointFromHex('02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5')));
  const A = pointFromHex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  const ok = { e: unhex('9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73d9'), s: unhex('9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73da') };
  assert.ok(verifyDLEQProof(ok, B_, B_, A));
  assert.ok(!verifyDLEQProof({ ...ok, s: unhex('9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73db') }, B_, B_, A));
});

// The seed's three jobs: HKDF-SHA256 with info "refueler.nutpub.<purpose>.v1" ‖ 0x00, checked against Node's own HKDF.
const SEED = unhex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
test('the seed: one key per job, as Node’s HKDF makes them', async () => {
  for (const p of ['ticket-nonce', 'ticket-key', 'ticket-blind']) {
    const want = new Uint8Array(hkdfSync('sha256', SEED, new Uint8Array(0), Buffer.concat([Buffer.from(`refueler.nutpub.${p}.v1`), Buffer.from([0])]), 32));
    assert.deepEqual(await derive(SEED, p), want);
  }
  const all = await Promise.all(['ticket-nonce', 'ticket-key', 'ticket-blind'].map((p) => derive(SEED, p).then(hex)));
  assert.equal(new Set(all).size, 3);
});

test('the ticket from a seed: a frozen known answer, and the same every time', async () => {
  const t = await ticketFrom(SEED);
  assert.deepEqual({ nonce: t.nonce, pub: t.pub, B_: t.B_, y: t.y }, KNOWN);
  assert.equal(t.secret, `["P2PK",{"nonce":"${t.nonce}","data":"${t.pub}"}]`);
  assert.equal((await ticketFrom(SEED)).B_, t.B_);
  await assert.rejects(ticketFrom(new Uint8Array(31)), /bad_seed/);
});
const KNOWN = {
  nonce: '67087b2011630038dbce255da11e3af6a8538c749528fa34950574251f73be49',
  pub: '0377e599d43f55b597e26defda296abd50bba373f1dc98d52196c1418de77008a7',
  B_: '03cc018643c08592e616f1cb8ffdada01f7f63da8df7ca53bac66609282b337f87',
  y: '020fb3a49456fea67d011d66648a64ba1ab5cbb5795ebc23a9d6564642ef119fcd',
};

test('buy, unblind, and the door’s three checks', async () => {
  const gig = makeGigKey();
  const t = await ticketFrom(crypto.getRandomValues(new Uint8Array(32)));
  const sig = signBlind(t.B_, gig);
  const C = unblind(t, sig, gig.pub);
  assert.throws(() => unblind(t, sig, makeGigKey().pub), /bad_dleq/); // another key's proof doesn't pass
  const step = 59_000_000;
  const p = readProof(doorProof(t, C, step));
  assert.deepEqual(checkProof(p, gig, step), { signed: true, fresh: true, y: t.y });
  assert.equal(p.secret, t.secret);
  assert.equal(fingerprint(p.secret), t.y);
  assert.equal(shortY(t.y).length, 16);
  // A minute either side: still fresh; two steps old (a screenshot): signed, not fresh.
  assert.equal(checkProof(p, gig, step + 1).fresh, true);
  assert.equal(checkProof(p, gig, step - 1).fresh, true);
  assert.deepEqual(checkProof(p, gig, step + 2), { signed: true, fresh: false, y: t.y });
  // Another night's gig key: not signed.
  assert.deepEqual(checkProof(p, makeGigKey(), step), { signed: false, fresh: false, y: null });
  // A step signed by another key, swapped into a real ticket's QR: not fresh.
  const other = await ticketFrom(crypto.getRandomValues(new Uint8Array(32)));
  const forged = readProof(doorProof({ ...other, nonce: t.nonce, pub: t.pub }, C, step));
  assert.equal(checkProof(forged, gig, step).fresh, false);
  // The server never saw the fingerprint: B_ and Y differ, and the signature on B_ isn't C.
  assert.notEqual(t.B_, t.y);
  assert.notEqual(sig.C_, C);
  // Junk in the QR.
  assert.equal(readProof('nope'), null);
  assert.equal(readProof(''), null);
});
