// A phone's night, from the command line: top up over the test mint's fake Lightning, get a pass, pay the set
// 10 seconds at a time, retry safely, get refused for reuse, and tip. Every payment is locked to the artist's key;
// payments not locked to it alone are refused, and the server can't spend what it accepted. Needs `npm start`
// running and the takings page opened once (it makes the artist's key; this check never touches it).
//   npm run check
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { Wallet, getEncodedToken, decodePaymentRequest, getPubKeyFromPrivKey, sumProofs } from '@cashu/cashu-ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);
const SITE = `http://127.0.0.1:${process.env.PORT || 8787}`;
const MINT_API = `http://127.0.0.1:${process.env.MINT_PORT || 3340}`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✕'} ${what}`); if (!ok) failed += 1; };

const { show, path, artistKey } = await fetch(`${SITE}/api/show`).then((r) => r.json());
if (!artistKey) {
  console.log(`✕ no artist key: open the takings page first (setup page → ${show.artist || 'the artist'}’s takings)`);
  process.exit(1);
}
const health = await fetch(`${SITE}/api/health`).then((r) => r.json());
const MINT_URL = health.mint.url;
console.log(`Show: ${show.title || '(untitled)'} · ${show.stream.mode === 'free' ? 'free, with tips' : `${show.stream.price} sat / 10 s`} · tip ${show.tip.price} sats`);

const page = await fetch(`${SITE}${path}`);
check(page.status === 200 && (await page.text()).includes('viewer.js'), `the show page at ${path}`);
check((await fetch(`${SITE}/no-such-artist`)).status === 404, 'another artist\'s address: not found');

// The phone's wallet: 200 test sats over the fake Lightning (the invoice pays itself). The refused locks below
// cost a few: sats locked to a stranger's key, or with a refund an hour away, are gone for this wallet.
const TOP_UP = 200;
const wallet = new Wallet(MINT_API, { unit: 'sat' });
await wallet.loadMint();
const quote = await wallet.createMintQuoteBolt11(TOP_UP);
for (let i = 0; i < 20 && (await wallet.checkMintQuote('bolt11', quote.quote)).state !== 'PAID'; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
}
let proofs = await wallet.mintProofsBolt11(TOP_UP, quote.quote);
check(Number(sumProofs(proofs)) === TOP_UP, `topped up ${TOP_UP} test sats over fake Lightning`);

// Pay a 402: read the creqA, send exactly that amount locked as it asks (or as `lock` says: null for none, to test
// the refusals), keep the change.
async function pay(res, lock) {
  const req = decodePaymentRequest(res.headers.get('X-Cashu'));
  const p2pk = lock === undefined ? req.toP2PKOptions() : lock;
  const send = wallet.ops.send(Number(req.amount), proofs);
  const { keep, send: out } = await (p2pk ? send.asP2PK(p2pk) : send).run();
  proofs = keep;
  return getEncodedToken({ mint: MINT_URL, unit: 'sat', proofs: out });
}
const randomKey = () => Buffer.from(getPubKeyFromPrivKey(crypto.getRandomValues(new Uint8Array(32)))).toString('hex');
const refusal = async (res) => (res.status === 400 ? (await res.json()).error : res.status);

const { pass } = await fetch(`${SITE}/api/pass`, { method: 'POST' }).then((r) => r.json());
const get = (path, token) => fetch(`${SITE}${path}`, { headers: { 'X-Pass': pass, ...(token ? { 'X-Cashu': token } : {}) } });

// Locked to the artist, or refused. A tip of 21 is always behind a 402 (free shows too), so it's the test bench.
{
  const ask = await get('/api/tip/21');
  const lock = ask.status === 402 && decodePaymentRequest(ask.headers.get('X-Cashu')).nut10;
  check(lock?.kind === 'P2PK' && lock.data === artistKey && !lock.tags.some(([k]) => k === 'locktime' || k === 'refund'),
    'the 402 asks for P2PK to the artist’s key, no locktime, no refund');
  const plain = await pay(ask, null);
  check(await refusal(await get('/api/tip/21', plain)) === 'not_locked', 'an unlocked token: refused (not_locked)');
  proofs = [...proofs, ...(await wallet.receive(plain))]; // never accepted, so it's still ours
  const stranger = await pay(ask, { kind: 'P2PK', data: randomKey() });
  check(await refusal(await get('/api/tip/21', stranger)) === 'wrong_lock', 'locked to another key: refused (wrong_lock)');
  const refundable = await pay(ask, { kind: 'P2PK', data: artistKey, locktime: Math.floor(Date.now() / 1000) + 3600, refundKeys: [randomKey()] });
  check(await refusal(await get('/api/tip/21', refundable)) === 'has_refund', 'locked with a locktime and refund: refused (has_refund)');
}

if (show.stream.mode === 'pay') {
  const first = await get('/api/set/audio/0');
  check(first.status === 402 && first.headers.get('X-Cashu')?.startsWith('creqA'), 'piece 0: 402 with a creqA payment request');
  check((await get('/api/set/video/0')).status === 403, 'piece 0 picture refused before paying');
  const token = await pay(first);
  const paid = await get('/api/set/audio/0', token);
  check(paid.status === 200 && (await paid.arrayBuffer()).byteLength > 100_000, 'piece 0: paid in the same request, locked to the artist, sound served');
  check((await get('/api/set/video/0')).status === 200, 'piece 0 picture served to the pass that paid');
  check((await get('/api/set/audio/0', token)).status === 200, 'same token, same piece: served again (safe retry)');
  const reuse = await get('/api/set/audio/1', token);
  check(reuse.status === 400 && (await reuse.json()).error === 'reused', 'same token, next piece: refused as reused');
  // The mint itself must refuse it for want of the artist's signature (any other error proves nothing).
  let why = 'spent it';
  try { proofs = [...proofs, ...(await wallet.receive(token))]; } catch (e) { why = String(e.message); }
  check(/witness|signature/i.test(why), `the server can’t spend it: without the artist’s key the mint says “${why.slice(0, 60)}”`);
  const me = await get('/api/pass/me').then((r) => r.json());
  check(me.spent === show.stream.price, `charged once: ${me.spent} sat(s) for piece 0`);
  check(me.next === 1, 'a reload carries on at piece 1, not 0 (no free replay)');
} else {
  check((await get('/api/set/audio/0')).status === 200, 'free show: piece 0 sound served without a 402');
  check((await get('/api/set/video/0')).status === 200, 'free show: piece 0 picture served');
}

if (show.tip.price) {
  const ask = await get('/api/tip');
  check(ask.status === 402, `tip: 402 for ${show.tip.price} sats`);
  const tip = await get('/api/tip', await pay(ask));
  check(tip.status === 200, `tip paid: “${show.tip.label}”`);
}

check((await get('/api/tip/0')).status === 400, 'tip, your amount: 0 sats refused');
check(await refusal(await get('/api/tip/20')) === 'too_small', 'tip, your amount: 20 sats refused (too_small, 21 or more)');
const ask = await get('/api/tip/21');
check(ask.status === 402 && Number(decodePaymentRequest(ask.headers.get('X-Cashu')).amount) === 21, 'tip, your amount: 402 for 21 sats');
const own = await get('/api/tip/21', await pay(ask));
check(own.status === 200 && (await own.json()).tipped === 21, 'tip, your amount: 21 sats paid, locked to the artist');

// The background photo: refused without the setup key; only a real photo is taken. Skipped if one is already up
// (the check never replaces the account holder's own).
const key = process.env.ADMIN_KEY || JSON.parse(new DatabaseSync(`${ROOT}data/nutpub.db`, { readOnly: true })
  .prepare("SELECT value FROM kv WHERE key = 'adminKey'").get().value);
const put = (body, k) => fetch(`${SITE}/api/admin/photo`, { method: 'PUT', headers: { 'X-Admin': k, 'Content-Type': 'image/jpeg' }, body });
check((await put('x', 'wrong')).status === 403, 'photo: refused without the setup key');
if ((await fetch(`${SITE}/api/show`).then((r) => r.json())).photo || !existsSync(`${ROOT}public/img/fp-32.jpg`)) {
  console.log('· photo: one is already up (or no test photo in public/img), upload not tried');
} else {
  check((await put('not a photo', key)).status === 400, 'photo: a file that isn\'t a photo is refused');
  const up = await put(readFileSync(`${ROOT}public/img/fp-32.jpg`), key).then((r) => r.json()).catch(() => ({}));
  check(up.photo && (await fetch(`${SITE}${up.photo}`)).status === 200, 'photo: a JPEG is taken and served');
  await fetch(`${SITE}/api/admin/photo`, { method: 'DELETE', headers: { 'X-Admin': key } });
  check(!(await fetch(`${SITE}/api/show`).then((r) => r.json())).photo, 'photo: removed again (back to the Berlin photos)');
}

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
