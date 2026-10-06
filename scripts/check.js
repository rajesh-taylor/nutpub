// A phone's night, from the command line: top up over the test mint's fake Lightning, get a pass, pay the set
// 10 seconds at a time, retry safely, get refused for reuse, and tip. Needs `npm start` running.
//   npm run check
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { Wallet, getEncodedToken, decodePaymentRequest, sumProofs } from '@cashu/cashu-ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);
const SITE = `http://127.0.0.1:${process.env.PORT || 8787}`;
const MINT_API = `http://127.0.0.1:${process.env.MINT_PORT || 3340}`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✓' : '✕'} ${what}`); if (!ok) failed += 1; };

const { show, path } = await fetch(`${SITE}/api/show`).then((r) => r.json());
const health = await fetch(`${SITE}/api/health`).then((r) => r.json());
const MINT_URL = health.mint.url;
console.log(`Show: ${show.title || '(untitled)'} · ${show.stream.mode === 'free' ? 'free, with tips' : `${show.stream.price} sat / 10 s`} · tip ${show.tip.price} sats`);

const page = await fetch(`${SITE}${path}`);
check(page.status === 200 && (await page.text()).includes('viewer.js'), `the show page at ${path}`);
check((await fetch(`${SITE}/no-such-artist`)).status === 404, 'another artist\'s address: not found');

// The phone's wallet: 100 test sats over the fake Lightning (the invoice pays itself).
const wallet = new Wallet(MINT_API, { unit: 'sat' });
await wallet.loadMint();
const quote = await wallet.createMintQuoteBolt11(100);
for (let i = 0; i < 20 && (await wallet.checkMintQuote('bolt11', quote.quote)).state !== 'PAID'; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
}
let proofs = await wallet.mintProofsBolt11(100, quote.quote);
check(Number(sumProofs(proofs)) === 100, 'topped up 100 test sats over fake Lightning');

// Pay a 402: read the creqA, send exactly that amount, keep the change.
async function pay(res) {
  const req = decodePaymentRequest(res.headers.get('X-Cashu'));
  const { keep, send } = await wallet.ops.send(Number(req.amount), proofs).run();
  proofs = keep;
  return getEncodedToken({ mint: MINT_URL, unit: 'sat', proofs: send });
}

const { pass } = await fetch(`${SITE}/api/pass`, { method: 'POST' }).then((r) => r.json());
const get = (path, token) => fetch(`${SITE}${path}`, { headers: { 'X-Pass': pass, ...(token ? { 'X-Cashu': token } : {}) } });

if (show.stream.mode === 'pay') {
  const first = await get('/api/set/audio/0');
  check(first.status === 402 && first.headers.get('X-Cashu')?.startsWith('creqA'), 'piece 0: 402 with a creqA payment request');
  check((await get('/api/set/video/0')).status === 403, 'piece 0 picture refused before paying');
  const token = await pay(first);
  const paid = await get('/api/set/audio/0', token);
  check(paid.status === 200 && (await paid.arrayBuffer()).byteLength > 100_000, 'piece 0: paid in the same request, sound served');
  check((await get('/api/set/video/0')).status === 200, 'piece 0 picture served to the pass that paid');
  check((await get('/api/set/audio/0', token)).status === 200, 'same token, same piece: served again (safe retry)');
  const reuse = await get('/api/set/audio/1', token);
  check(reuse.status === 400 && (await reuse.json()).error === 'reused', 'same token, next piece: refused as reused');
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
const ask = await get('/api/tip/7');
check(ask.status === 402 && Number(decodePaymentRequest(ask.headers.get('X-Cashu')).amount) === 7, 'tip, your amount: 402 for 7 sats');
const own = await get('/api/tip/7', await pay(ask));
check(own.status === 200 && (await own.json()).tipped === 7, 'tip, your amount: 7 sats paid');

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
