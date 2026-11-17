// The first drink as the coin itself (gig 3, 17 Nov): an animated QR in NUT-16's proposed fountain format. The encoder
// is cashu-ts's own, copied unchanged from its pull request #1309 (vendor/cashu-ts-nut16); this checks the copy against
// the spec's vectors, the same file the pull request tests with. esbuild turns the TypeScript into one module first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { getDecodedToken, getDecodedTokenBinary, getEncodedTokenBinary } from '@cashu/cashu-ts';

const vectors = JSON.parse(readFileSync(new URL('../vendor/cashu-ts-nut16/test/vectors/nut16.json', import.meta.url)));
const out = new URL('../node_modules/.cache/nut16/fountain.mjs', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
buildSync({ entryPoints: [new URL('../vendor/cashu-ts-nut16/src/utils/fountain.ts', import.meta.url).pathname], bundle: true,
  format: 'esm', platform: 'node', external: ['@cashu/cashu-ts'], outfile: out.pathname, logLevel: 'silent' });
const { crc32, decodeBase45, encodeBase45, FountainDecoder, FountainEncoder, parseFrame, selectFragments } = await import(out.href);

const hex = (b) => Buffer.from(b).toString('hex');
const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));
const indexes = (bits, count) => { const o = []; for (let i = 0; i < count; i++) if (bits[i >>> 5] & (1 << (i & 31))) o.push(i); return o; };
const decode = (frames) => { const d = new FountainDecoder(); for (const f of frames) d.receive(f); return d; };
const jumpTo = (encoder, sequence) => { encoder.sequence = sequence - 1; }; // as the pull request's own tests do

test('NUT-16: crc32, fragment selection and base45 match the spec', () => {
  assert.equal(crc32(new TextEncoder().encode(vectors.checksum_check.input_ascii)).toString(16).padStart(8, '0'), vectors.checksum_check.crc32);
  for (const v of vectors.selection_vectors) assert.deepEqual(indexes(selectFragments(v.sequence, v.fragment_count), v.fragment_count), v.indexes);
  for (const v of vectors.base45_vectors) {
    assert.equal(encodeBase45(bytes(v.bytes_hex)), v.text);
    assert.equal(hex(decodeBase45(v.text)), v.bytes_hex);
  }
});

test('NUT-16: every transfer encodes to the exact QR text and decodes back, from any sufficient set of frames', () => {
  for (const t of vectors.transfers) {
    const encoder = new FountainEncoder(bytes(t.message_hex), { fragmentSize: t.fragment_size });
    assert.equal(encoder.fragmentCount, t.fragment_count, t.name);
    for (const f of t.frames) {
      jumpTo(encoder, f.sequence);
      assert.equal(encoder.nextFrame(), f.qr_text, `${t.name} frame ${f.sequence}`);
      const frame = parseFrame(decodeBase45(f.qr_text));
      assert.equal(hex(decodeBase45(f.qr_text)), f.frame_hex);
      assert.equal(frame.sequence, f.sequence);
      assert.equal(hex(frame.payload), f.data_hex);
    }
    const text = (q) => t.frames.find((f) => f.sequence === q).qr_text;
    assert.equal(hex(decode(t.frames.filter((f) => f.sequence <= t.fragment_count).map((f) => f.qr_text)).result), t.message_hex, `${t.name} systematic`);
    assert.equal(hex(decode(t.mixed_only_recovery_sequences.map(text)).result), t.message_hex, `${t.name} repair frames alone`);
    const all = t.frames.map((f) => f.qr_text);
    assert.equal(hex(decode([...all].reverse().concat(all)).result), t.message_hex, `${t.name} reversed, with duplicates`);
  }
});

test('NUT-16: valid frames are taken, invalid frames and QR text are refused', () => {
  for (const f of vectors.valid_frames) {
    assert.equal(encodeBase45(bytes(f.frame_hex)), f.qr_text, f.name);
    assert.equal(new FountainDecoder().receive(f.qr_text), true, f.name);
  }
  for (const f of vectors.invalid_frames) {
    const d = new FountainDecoder();
    if (f.reject_at === 'token') { d.receive(f.qr_text); assert.throws(() => getDecodedTokenBinary(d.result, []), f.name); continue; }
    assert.throws(() => d.receive(f.qr_text), f.name);
    assert.equal(d.progress, 0, f.name);
  }
  for (const f of vectors.invalid_qr_text) assert.throws(() => new FountainDecoder().receive(f.text), f.name);
});

test('NUT-16: a V4 token sent as frames comes back as the same token (the drink, end to end)', () => {
  const token = getDecodedToken(vectors.transfers.find((t) => t.scope === 'token').token_text, []);
  const encoder = FountainEncoder.forToken(token, { fragmentSize: 64 });
  const d = new FountainDecoder();
  let n = 0;
  while (!d.isComplete && n++ < 50) d.receive(encoder.nextFrame());
  assert.ok(d.isComplete);
  assert.equal(hex(d.result), hex(getEncodedTokenBinary(token)));
  assert.deepEqual(getDecodedTokenBinary(d.result, []), token);
});
