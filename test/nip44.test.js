// NIP-44 (version 2), the encryption between the gig page and a fan's signer app (Nostr Connect, NIP-46). We don't write
// it ourselves: it's nostr-tools' copy of Paul Miller's implementation, the one audited with the spec (Cure53, 2023).
// These are the spec's own known answers (test/fixtures/nip44.vectors.json, from github.com/paulmillr/nip44; its
// SHA-256, 269ed0f6…25040, is the one the NIP gives), run against the exact library the page bundles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hexToBytes } from '@noble/curves/utils.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { v2 } from 'nostr-tools/nip44';

const FILE = new URL('./fixtures/nip44.vectors.json', import.meta.url);
const raw = readFileSync(FILE);
const V = JSON.parse(raw).v2;
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pub = (sec) => hex(schnorr.getPublicKey(hexToBytes(sec)));

test('the vectors file is the one the NIP names', () => {
  assert.equal(sha(raw), '269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040');
});

test('conversation keys (35 valid)', () => {
  for (const v of V.valid.get_conversation_key) assert.equal(hex(v2.utils.getConversationKey(hexToBytes(v.sec1), v.pub2)), v.conversation_key);
});

test('padded lengths (24)', () => {
  for (const [len, padded] of V.valid.calc_padded_len) assert.equal(v2.utils.calcPaddedLen(len), padded);
});

test('encrypt and decrypt with a fixed nonce, both ways (10)', () => {
  for (const v of V.valid.encrypt_decrypt) {
    const k1 = v2.utils.getConversationKey(hexToBytes(v.sec1), pub(v.sec2));
    const k2 = v2.utils.getConversationKey(hexToBytes(v.sec2), pub(v.sec1));
    assert.equal(hex(k1), v.conversation_key);
    assert.equal(hex(k2), v.conversation_key);
    assert.equal(v2.encrypt(v.plaintext, k1, hexToBytes(v.nonce)), v.payload);
    assert.equal(v2.decrypt(v.payload, k2), v.plaintext);
  }
});

test('long messages, up to 65,535 bytes (3)', () => {
  for (const v of V.valid.encrypt_decrypt_long_msg) {
    const text = v.pattern.repeat(v.repeat);
    assert.equal(sha(text), v.plaintext_sha256);
    const payload = v2.encrypt(text, hexToBytes(v.conversation_key), hexToBytes(v.nonce));
    assert.equal(sha(payload), v.payload_sha256);
    assert.equal(v2.decrypt(payload, hexToBytes(v.conversation_key)), text);
  }
});

test('refused: messages of the wrong length, bad keys, tampered payloads', () => {
  // An empty message is refused. The audited spec also refuses anything over 65,535 bytes; nostr-tools 2.25 takes the
  // newer, longer form (a 6-byte length) for those. Our messages to a signer are a few hundred bytes, so they're
  // encrypted exactly as the audited spec says (the vectors above), and we keep them that way (MAX in client/nostr.js).
  for (const len of V.invalid.encrypt_msg_lengths.filter((n) => n < 65536)) assert.throws(() => v2.encrypt('x'.repeat(len), new Uint8Array(32)), Error, `length ${len}`);
  for (const v of V.invalid.get_conversation_key) assert.throws(() => v2.utils.getConversationKey(hexToBytes(v.sec1), v.pub2), Error, v.note);
  for (const v of V.invalid.decrypt) assert.throws(() => v2.decrypt(v.payload, hexToBytes(v.conversation_key)), Error, v.note);
});

test('a fresh random nonce each time: the same words never encrypt the same way twice', () => {
  const k = hexToBytes(V.valid.encrypt_decrypt[0].conversation_key);
  const a = v2.encrypt('connect', k), b = v2.encrypt('connect', k);
  assert.notEqual(a, b);
  assert.equal(v2.decrypt(a, k), 'connect');
  assert.equal(v2.decrypt(b, k), 'connect');
});
