// Move to my phone (session 44): the fan's note as an animated QR in NUT-16 as phone wallets read it today (UR codes,
// bc-ur). Checks: the frames are built the way Cashu.me builds its own; a phone wallet's decoder gets the note back from
// them, whichever frames it catches first; two coins or fewer is one still QR of the note itself; and frozen answers, so a
// new bc-ur that changes a frame shows up here. esbuild bundles phone-qr.js as the browser gets it (bc-ur's ES build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { getEncodedToken } from '@cashu/cashu-ts';

const out = new URL('../node_modules/.cache/phone-qr/bundle.mjs', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
buildSync({
  stdin: { contents: "export { framesOf, PART } from './client/phone-qr.js'; export { UR, UREncoder, URDecoder } from '@gandlaf21/bc-ur'; export { Buffer } from 'buffer';",
    resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true, format: 'esm', platform: 'browser', outfile: out.pathname, logLevel: 'silent',
});
const { framesOf, PART, UR, UREncoder, URDecoder, Buffer } = await import(out.href);

// A note shaped like the wallet's: test mint, V4, fixed coins (no randomness, so the answers can be frozen).
const coin = (i) => ({ id: '00ad268c4d1f5826', amount: 2 ** (i % 12), secret: `${i}`.padStart(64, 'a'), C: `02${`${i}`.padStart(64, 'c')}` });
const noteOf = (n) => getEncodedToken({ mint: 'https://testnut.cashu.space', unit: 'sat', proofs: Array.from({ length: n }, (_, i) => coin(i)) });

test('Move to my phone: frames as Cashu.me makes them (UR bytes of the note text, 150-byte parts)', () => {
  const note = noteOf(12);
  assert.equal(PART, 150);
  const ours = framesOf(note, 12);
  const theirs = new UREncoder(UR.fromBuffer(Buffer.from(note)), 150, 0);
  assert.equal(ours.still, false);
  assert.equal(ours.count, theirs.fragmentsLength);
  for (let i = 0; i < ours.count + 5; i++) assert.equal(ours.next(), theirs.nextPart());
});

test('Move to my phone: a phone wallet decodes the note from any run of frames, even starting late', () => {
  for (const n of [3, 12, 40]) {
    const note = noteOf(n);
    const frames = framesOf(note, n);
    for (let skip = 0; skip < frames.count + 3; skip += 2) frames.next(); // the camera opens late
    const d = new URDecoder();
    let seen = 0;
    while (!d.isComplete() && seen < frames.count * 4) { d.receivePart(frames.next()); seen++; }
    assert.ok(d.isSuccess(), `${n} coins: not decoded after ${seen} frames`);
    assert.equal(Buffer.from(d.resultUR().decodeCBOR()).toString(), note);
    assert.match(frames.next(), /^ur:bytes\/\d+-\d+\/[a-z]+$/);
  }
});

test('Move to my phone: two coins or fewer is one still QR of the note itself', () => {
  for (const n of [1, 2]) {
    const note = noteOf(n);
    const f = framesOf(note, n);
    assert.equal(f.still, true);
    assert.equal(f.count, 1);
    assert.equal(f.next(), note);
    assert.equal(f.next(), note);
  }
});

test('Move to my phone: frozen answers for a fixed note', () => {
  const f = framesOf(noteOf(12), 12);
  assert.equal(f.count, FROZEN.count);
  assert.equal(f.next(), FROZEN.first);
  for (let i = 1; i < f.count; i++) f.next();
  assert.equal(f.next(), FROZEN.mixed); // the first frame past the plain parts: a mix of several
});

const FROZEN = {
  count: 13,
  first: 'ur:bytes/1-13/lpadbtcfateocycfrywstphdmnhkatdyiahsjkiskpfwjleyfgjyihfwjyjliefdgmktiaknjlkogseogmjziaeogmkpiehdgykphkeyfgknhsfdgokpiaeofwishkeyhfisiehgglknhkhdgmisiegaflinhkhgjzgafpgrdyjnimfedyiyhgfxhtisiagakkimhkhgfefwhkhdgleegyflfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkhgfgishkykiygmnb',
  mixed: 'ur:bytes/14-13/lpbabtcfateocycfrywstphdmnfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctfnchfhcthkfmfhatcwcncyfndaeecxfndidpbafhbaaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeasbzlbfndafhbkfnemctayetdaetfsctfhcebacldlctdpcndpcwfhctfhctfhctfhctfhctfhctfhctfhctfhctfhctwsrorfnl',
};
