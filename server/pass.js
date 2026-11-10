// The ticket as an Apple Wallet pass (.pkpass): a zip of pass.json, its pictures, manifest.json (each file's SHA-1)
// and `signature`, a detached CMS SignedData over manifest.json by our Pass Type ID certificate, with Apple's WWDR G4
// certificate beside it. The key and certificate are Worker secrets (PASS_KEY, PASS_CERT), never in the repo.
//
// The signing is WebCrypto (RSA PKCS#1 v1.5 with SHA-256); this file only writes the DER envelope around it. A CMS
// library (pkijs) cost 5 to 30 ms of CPU a pass on Cloudflare, over the free plan's 10 ms, almost all of it reading
// the certificates; this costs about 2. test/pass.test.js checks the envelope against pkijs and OpenSSL.
import { zipSync } from 'fflate';
import { WWDR_G4 } from './apple-wwdr.js';

const utf8 = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const pemToDer = (pem) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (ch) => ch.charCodeAt(0));

// ---- DER, as little as this needs: write a tag-length-value, and find the parts of a certificate.
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const lengthOf = (n) => {
  if (n < 0x80) return [n];
  const b = [];
  for (; n; n >>>= 8) b.unshift(n & 0xff);
  return [0x80 | b.length, ...b];
};
const tlv = (tag, ...parts) => { const body = cat(...parts); return cat(Uint8Array.of(tag, ...lengthOf(body.length)), body); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const int = (n) => tlv(0x02, Uint8Array.of(n));
const NULL = Uint8Array.of(0x05, 0x00);
const oid = (dotted) => {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const out = [40 * a + b];
  for (let n of rest) { const b7 = [n & 0x7f]; while ((n >>>= 7)) b7.unshift(0x80 | (n & 0x7f)); out.push(...b7); }
  return tlv(0x06, Uint8Array.from(out));
};
const utcTime = (d) => tlv(0x17, utf8.encode(d.toISOString().replace(/^\d\d|[-:T]|\.\d+/g, '')));
// One element at `at`: its tag, where its contents start, and where it ends.
const read = (b, at) => {
  let len = b[at + 1], start = at + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[start + i]; start += n; }
  return { tag: b[at], at, start, end: start + len };
};
const whole = (b, el) => b.subarray(el.at, el.end);
// The issuer's name and the serial number, as they stand in the certificate: they say which key signed.
// Certificate = SEQUENCE { tbsCertificate = SEQUENCE { [0] version, serialNumber, signature, issuer, ... }, ... }
export function issuerAndSerial(cert) {
  const tbs = read(cert, read(cert, 0).start);
  let serial = read(cert, tbs.start);
  if (serial.tag === 0xa0) serial = read(cert, serial.end);
  const issuer = read(cert, read(cert, serial.end).end);
  if (serial.tag !== 0x02 || issuer.tag !== 0x30) throw new Error('not a certificate');
  return seq(whole(cert, issuer), whole(cert, serial));
}

const OID = { data: oid('1.2.840.113549.1.7.1'), signedData: oid('1.2.840.113549.1.7.2'), sha256: oid('2.16.840.1.101.3.4.2.1'),
  rsa: oid('1.2.840.113549.1.1.1'), contentType: oid('1.2.840.113549.1.9.3'), messageDigest: oid('1.2.840.113549.1.9.4'),
  signingTime: oid('1.2.840.113549.1.9.5') };
// DER sorts a SET OF by its members' bytes.
const byBytes = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// The key and both certificates, read once per Worker instance (and again if a secret changes).
let signer = null;
async function signerFor(keyPem, certPem, chainPem) {
  const id = keyPem + certPem + chainPem;
  if (signer?.id === id) return signer;
  const cert = pemToDer(certPem);
  signer = { id, cert, chain: pemToDer(chainPem), sid: issuerAndSerial(cert),
    key: await crypto.subtle.importKey('pkcs8', pemToDer(keyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']) };
  return signer;
}

// A detached CMS SignedData (RFC 5652) over `data`, as DER: signed attributes (content type, signing time, message
// digest), our certificate and Apple's intermediate, no content.
export async function detachedSignature(data, { keyPem, certPem, chainPem = WWDR_G4, at = new Date() }) {
  const s = await signerFor(keyPem, certPem, chainPem);
  const attrs = [
    seq(OID.contentType, set(OID.data)),
    seq(OID.signingTime, set(utcTime(at))),
    seq(OID.messageDigest, set(tlv(0x04, new Uint8Array(await crypto.subtle.digest('SHA-256', data))))),
  ].sort(byBytes);
  const signedAttrs = set(...attrs); // signed as a SET, carried as [0]
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', s.key, signedAttrs));
  const signerInfo = seq(int(1), s.sid, seq(OID.sha256), Uint8Array.of(0xa0, ...signedAttrs.subarray(1)),
    seq(OID.rsa, NULL), tlv(0x04, sig));
  const signedData = seq(int(1), set(seq(OID.sha256)), seq(OID.data), tlv(0xa0, s.cert, s.chain), set(signerInfo));
  return seq(OID.signedData, tlv(0xa0, signedData));
}

// files: { 'pass.json': object, 'icon.png': Uint8Array, ... } → the .pkpass bytes.
export async function makePkpass(files, keys) {
  const bytes = Object.fromEntries(Object.entries(files).map(([name, v]) =>
    [name, v instanceof Uint8Array ? v : utf8.encode(JSON.stringify(v))]));
  const manifest = {};
  for (const [name, b] of Object.entries(bytes)) manifest[name] = hex(await crypto.subtle.digest('SHA-1', b));
  bytes['manifest.json'] = utf8.encode(JSON.stringify(manifest));
  bytes.signature = await detachedSignature(bytes['manifest.json'], keys);
  return zipSync(bytes, { level: 0 }); // stored: the pictures are compressed already, and it costs no CPU
}
