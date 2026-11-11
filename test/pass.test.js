// The wallet pass's signature (server/pass.js), checked three ways: pkijs (a CMS library) reads and verifies it,
// OpenSSL verifies it when it's on the machine, and a known answer pins the bytes. The key in test/fixtures is a
// stand-in made for these tests only: self-signed, not Apple's, worth nothing. The real one is a Worker secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as pkijs from 'pkijs';
import { unzipSync } from 'fflate';
import { detachedSignature, makePkpass, issuerAndSerial, pemToDer } from '../server/pass.js';

pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({ name: 'webcrypto', crypto }));
const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const keys = { keyPem: fx('pass-test-key.pem'), certPem: fx('pass-test-cert.pem') };
const at = new Date('2026-11-10T22:00:00Z');
const data = new TextEncoder().encode('{"pass.json":"0000"}');

test('pkijs reads the signature, finds our certificate and Apple\'s, and it verifies', async () => {
  const sig = await detachedSignature(data, { ...keys, at });
  const info = pkijs.ContentInfo.fromBER(sig);
  assert.equal(info.contentType, '1.2.840.113549.1.7.2');
  const signed = new pkijs.SignedData({ schema: info.content });
  assert.equal(signed.certificates.length, 2);
  assert.equal(signed.certificates[1].subject.typesAndValues.find((t) => t.type === '2.5.4.11').value.valueBlock.value, 'G4');
  const attrs = signed.signerInfos[0].signedAttrs.attributes.map((a) => a.type);
  assert.deepEqual(attrs.sort(), ['1.2.840.113549.1.9.3', '1.2.840.113549.1.9.4', '1.2.840.113549.1.9.5']);
  assert.equal(await signed.verify({ signer: 0, data, checkChain: false }), true);
  // A changed manifest fails.
  assert.equal(await signed.verify({ signer: 0, data: new TextEncoder().encode('{"pass.json":"0001"}'), checkChain: false }).catch(() => false), false);
});

test('issuer and serial match what pkijs reads from the certificate', () => {
  const der = pemToDer(keys.certPem);
  const cert = pkijs.Certificate.fromBER(der);
  const want = new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }).toSchema().toBER();
  assert.deepEqual(issuerAndSerial(der), new Uint8Array(want));
});

test('known answer: same key, time and manifest give the same signature bytes', async () => {
  const sig = await detachedSignature(data, { ...keys, at });
  assert.equal(createHash('sha256').update(sig).digest('hex'), KNOWN);
});

test('OpenSSL verifies a whole .pkpass (skipped without openssl)', async (t) => {
  try { execFileSync('openssl', ['version']); } catch { return t.skip('no openssl'); }
  const zip = await makePkpass({ 'pass.json': { formatVersion: 1 }, 'icon.png': new Uint8Array([137, 80, 78, 71]) }, keys);
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files).sort(), ['icon.png', 'manifest.json', 'pass.json', 'signature']);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  assert.equal(manifest['pass.json'], createHash('sha1').update(files['pass.json']).digest('hex'));
  const dir = mkdtempSync(join(tmpdir(), 'pass-'));
  for (const [n, b] of Object.entries(files)) writeFileSync(join(dir, n), b);
  // Our test certificate is its own root; Apple's G4 rides along unused.
  execFileSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', join(dir, 'signature'), '-binary', '-content', join(dir, 'manifest.json'),
    '-CAfile', new URL('./fixtures/pass-test-cert.pem', import.meta.url).pathname, '-purpose', 'any', '-out', '/dev/null'], { stdio: 'pipe' });
});

const KNOWN = '27115182080de79cc6721c8a055031134f424c54fd8e40cbfa7d029ecc0d0936';

test('the card: UK time with its offset, the door QR, nothing about the buyer', async () => {
  const { configure } = await import('../server/config.js');
  configure({ PASS_TYPE: 'pass.com.thenutpub.ticket', PASS_TEAM: 'TEAM' });
  const { passJson } = await import('../server/wallet.js');
  const code = 'a'.repeat(24);
  const summer = passJson({ artist: 'Longy', venue: 'The Bell', date: '2026-07-04', streams: '19:30', page: 'longy' }, code, 'https://x.test');
  assert.equal(summer.relevantDate, '2026-07-04T19:30:00+01:00');
  assert.equal(summer.expirationDate, '2026-07-05T06:00:00Z');
  const winter = passJson({ artist: 'Longy', date: '2026-11-20', streams: '19:30' }, code, 'https://x.test');
  assert.equal(winter.relevantDate, '2026-11-20T19:30:00+00:00');
  assert.equal(winter.barcodes[0].message, `https://x.test/door.html#t=${code}`);
  assert.equal(winter.barcodes[0].altText, undefined); // the name is in the card's top strip, not by the QR
  assert.equal(winter.logoText, 'The NutPub');
  assert.equal(winter.serialNumber, code);
  assert.equal(passJson({ artist: 'A' }, code, 'https://x.test').relevantDate, undefined); // no date: no reminder
});
