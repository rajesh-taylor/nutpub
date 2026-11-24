// Sealed tickets (client/seal.js): known answers worked out with node:crypto (not WebCrypto, so the two check each
// other), then the rule's checks: a fresh nonce per seal, and a copy that only opens with its own passkey's answer and id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync, createCipheriv } from 'node:crypto';
import { seal, unseal, isSealed, SEAL_INPUT } from '../client/seal.js';

const bytes = (n, f) => Uint8Array.from({ length: n }, (_, i) => f(i));
const PRF = bytes(32, (i) => i); // 00 01 … 1f
const SEED = bytes(32, (i) => 0xa0 + i);
const NONCE = bytes(12, (i) => 0xc0 + i);
const AAD = new TextEncoder().encode('test-credential-id');
const hex = (b) => Buffer.from(b).toString('hex');
const unb64u = (t) => new Uint8Array(Buffer.from(t, 'base64url'));

test('the seal key: HKDF-SHA256, info "refueler.nutpub.ticket-seal.v1" ‖ 0x00', () => {
  const info = Buffer.concat([Buffer.from('refueler.nutpub.ticket-seal.v1'), Buffer.from([0])]);
  const key = Buffer.from(hkdfSync('sha256', PRF, Buffer.alloc(0), info, 32));
  assert.equal(key.toString('hex'), KEY_HEX);
});

test('known answer: the sealed copy, byte for byte', async () => {
  const text = await seal(PRF, SEED, AAD, NONCE);
  assert.equal(hex(unb64u(text)), SEALED_HEX);
  // The same with node:crypto's AES-GCM.
  const c = createCipheriv('aes-256-gcm', Buffer.from(KEY_HEX, 'hex'), NONCE);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(SEED), c.final(), c.getAuthTag()]);
  assert.equal(`01${hex(NONCE)}${ct.toString('hex')}`, SEALED_HEX);
  assert.ok(isSealed(text));
  assert.deepEqual(await unseal(PRF, text, AAD), SEED);
});

test('every seal takes a new nonce', async () => {
  const a = unb64u(await seal(PRF, SEED, AAD));
  const b = unb64u(await seal(PRF, SEED, AAD));
  assert.notEqual(hex(a.slice(1, 13)), hex(b.slice(1, 13)));
  assert.notEqual(hex(a), hex(b));
});

test('only its own passkey opens it', async () => {
  const text = await seal(PRF, SEED, AAD);
  await assert.rejects(unseal(bytes(32, () => 7), text, AAD), /bad_seal/); // another passkey's answer
  await assert.rejects(unseal(PRF, text, new TextEncoder().encode('another-id')), /bad_seal/); // another passkey's id
  const b = unb64u(text); b[20] ^= 1; // a changed copy
  await assert.rejects(unseal(PRF, Buffer.from(b).toString('base64url'), AAD), /bad_seal/);
  await assert.rejects(unseal(PRF, 'short', AAD), /bad_seal/);
});

test('refuses what isn’t a ticket or a PRF answer', async () => {
  await assert.rejects(seal(PRF, bytes(31, () => 1), AAD), /bad_seed/);
  await assert.rejects(seal(bytes(16, () => 1), SEED, AAD), /bad_prf/);
  await assert.rejects(seal(PRF, SEED, AAD, bytes(8, () => 1)), /bad_nonce/);
  assert.equal(new TextDecoder().decode(SEAL_INPUT), 'refueler.nutpub.ticket-seal.v1');
});

const KEY_HEX = '7058a9a28ef9faa61597d306b3b51ec40b21ae5f8d0f6ed5acc1457e3574457f';
const SEALED_HEX = '01c0c1c2c3c4c5c6c7c8c9cacbccc26cbe9318f35bbb7a02a69440ebc6577cde06d424960eea30f821a38aed1ef06c3d511ae93a34a76b12ab37409f35';
