// An agent buys a ticket (session 43, 21 Nov): gig 1's Watch online ticket, bought by a script with test ecash, no
// browser and no account. It does what the fan's browser does, over plain HTTP:
//   1. a pass (POST /api/pass): a random id, the stage's only record of who's asking;
//   2. the ticket (GET /api/door/ticket?as=home): 402 Payment Required, with a NUT-18 payment request in X-Cashu
//      (the amount, the mint, and the artist's key the payment must be locked to);
//   3. test sats from that mint (NUT-04): the public test mint pays its own quotes;
//   4. a swap at the mint (NUT-03) into coins locked to the artist's key (NUT-11 P2PK), exactly as the request asks;
//   5. the same GET again with the coins in X-Cashu (NUT-24): 200, and the ticket is the pass's.
// Nothing is kept on this computer. Usage: npm run agent -- https://<your stage>.thenutpub.com
import { request } from 'node:http';
import { Wallet, decodePaymentRequest, getEncodedToken, sumProofs, p2pkToLockOptions } from 'cashu-ts-next';

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const [amber, green, grey, bold, red] = [paint('33'), paint('32'), paint('90'), paint('1'), paint('31')];
const sats = (n) => `${Number(String(n)).toLocaleString('en-GB')} sat${String(n) === '1' ? '' : 's'}`; // an Amount refuses Number()
const short = (s) => `${String(s).slice(0, 4)}…${String(s).slice(-2)}`;
const step = (n, what, detail) => console.log(`${amber(n)}  ${what.padEnd(24)} ${detail}`);
const more = (line) => console.log(`   ${line}`);
const stop = (why) => { console.log(`\n${red('✕')} ${why}`); process.exit(1); };

// The stage's address: https://<id>.thenutpub.com, or http://<id>.localhost:<port> when running it yourself.
// Node can't look up <id>.localhost, so those go to 127.0.0.1 with the stage's name in the Host header.
function stageOf(arg) {
  let url;
  try { url = new URL(/^https?:\/\//.test(arg || '') ? arg : `https://${arg}`); } catch { url = null; }
  if (!arg || !url) {
    console.log(`Usage: npm run agent -- https://<your stage>.thenutpub.com

Start gig 1 (Longy, online) at https://thenutpub.com first: your stage's address is in the browser's address bar.`);
    process.exit(1);
  }
  const local = url.hostname.endsWith('.localhost');
  return {
    name: url.host,
    url: (path) => (local ? `${url.protocol}//127.0.0.1:${url.port || 80}${path}` : new URL(path, url.origin).href),
    headers: local ? { Host: url.host } : {},
  };
}

// fetch() won't send a Host header of our own, so a local stage goes through node:http, which will.
const viaHttp = (url, method, headers) => new Promise((done, fail) => {
  const req = request(url, { method, headers }, (res) => {
    let text = '';
    res.setEncoding('utf8').on('data', (d) => { text += d; }).on('end', () => done({
      ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode,
      headers: { get: (k) => res.headers[k.toLowerCase()] ?? null }, json: async () => JSON.parse(text),
    }));
  });
  req.on('error', fail).end();
});

async function call(stage, method, path, headers = {}) {
  const all = { ...stage.headers, ...headers };
  const res = await (all.Host ? viaHttp(stage.url(path), method, all) : fetch(stage.url(path), { method, headers: all }))
    .catch((e) => stop(`Couldn't reach ${stage.name}: ${e.cause?.code || e.code || e.message}`));
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  const started = Date.now();
  const stage = stageOf(process.argv[2]);
  console.log(`\n${bold('The NutPub · an agent buys a ticket')} ${grey('· test sats, no account')}\n`);

  // 1. A pass: the stage's only record of who's asking.
  const { res: r1, body: made } = await call(stage, 'POST', '/api/pass');
  if (!r1.ok || !made.pass) stop(`${stage.name} didn't give a pass (${r1.status}). Is it a NutPub stage?`);
  step(1, 'A place in the show', `POST /api/pass                → pass ${short(made.pass)}`);
  const pass = { 'X-Pass': made.pass };

  // 2. The ticket: a 402 carrying the bill. The gig's own page says whose it is.
  const { body: now } = await call(stage, 'GET', '/api/show');
  const gig = now?.show?.artist ? `${now.show.artist}, Watch online${now.show.online?.fiat ? ` (£${now.show.online.fiat})` : ''}` : null;
  const ticket = '/api/door/ticket?as=home';
  const { res: r2, body: asked } = await call(stage, 'GET', ticket, pass);
  if (r2.status === 409) stop(`${asked.detail || 'Not ready.'}\n  This script buys gig 1's Watch online ticket: open gig 1's stage in your browser first.`);
  if (r2.status !== 402) stop(`Expected 402 Payment Required, got ${r2.status}: ${JSON.stringify(asked)}`);
  const creq = r2.headers.get('X-Cashu');
  const bill = decodePaymentRequest(creq);
  const amount = bill.amount.toNumber();
  const mintUrl = bill.mints?.[0];
  const lock = bill.nut10;
  step(2, 'Ask for the ticket', `GET  ${ticket}  → ${bold('402 Payment Required')}`);
  more(`${gig || bill.description || 'The ticket'}: ${sats(amount)} · mint ${new URL(mintUrl).host}`);
  more(`X-Cashu carries the bill (NUT-18), to be locked to the artist's key ${short(lock?.data)} (NUT-11)`);
  if (lock?.kind !== 'P2PK') stop('The bill has no lock: the NutPub always asks for one.');

  // 3. Test sats from that mint (NUT-04). The test mint pays its own quotes; a real mint would want a Lightning
  // invoice paid, which this script never does.
  const wallet = new Wallet(mintUrl, { unit: 'sat' });
  await wallet.loadMint();
  const want = amount + 32; // room for the mint's fee on the swap; the rest is change
  const lockKey = await wallet.createQuoteLockKey(); // every mint quote is locked (NUT-20); minting signs with it
  let quote = await wallet.createMintQuoteBolt11(want, lockKey.pubkey);
  for (let i = 0; quote.state !== 'PAID' && i < 20; i++) {
    await new Promise((ok) => setTimeout(ok, 500));
    quote = await wallet.checkMintQuoteBolt11(quote.quote);
  }
  if (quote.state !== 'PAID') stop(`${new URL(mintUrl).host} wants a Lightning invoice paid: this script only uses a test mint.`);
  const minted = await wallet.mintProofsBolt11(want, quote.quote, { privkey: lockKey.privkey });
  step(3, 'Test sats from the mint', `NUT-04: a quote, paid by the test mint → ${sats(sumProofs(minted))}`);

  // 4. Swap them (NUT-03) into coins locked to the artist's key, with exactly the conditions the bill asks for.
  const { send, keep } = await wallet.ops.send(amount, minted).asLocked(p2pkToLockOptions(bill.toP2PKOptions())).run();
  const fee = sumProofs(minted).toNumber() - sumProofs(send).toNumber() - sumProofs(keep).toNumber();
  step(4, "Lock them to the artist", `NUT-03 swap into P2PK coins · mint fee ${sats(fee)}`);

  // 5. Pay: the same request again, the coins in X-Cashu (NUT-24).
  const token = getEncodedToken({ mint: mintUrl, unit: 'sat', proofs: send });
  const { res: r5, body: paid } = await call(stage, 'GET', ticket, { ...pass, 'X-Cashu': token });
  step(5, 'Pay', `GET  again, X-Cashu: ${token.slice(0, 6)}…   → ${r5.ok ? green(`${r5.status} ${JSON.stringify(paid)}`) : red(`${r5.status} ${JSON.stringify(paid)}`)}`);
  if (!r5.ok || !paid.in) stop('The stage refused the payment.');

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${green('✓ Bought:')} ${gig || bill.description || 'the ticket'}, in ${secs} s. Nothing kept on this computer.`);
  console.log(`  On your stage, after End night: Your takings counts it under Tickets. ${grey(`(${sats(sumProofs(keep))} of test change left behind.)`)}\n`);
}

main().catch((e) => stop(e.message || String(e)));
