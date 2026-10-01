// A fan pledges like the page will: read the 402's nut10, lock to it with our own fresh refund key, retry.
import { initializeCoco, MemoryRepositories } from '@cashu/coco-core';
import { decodePaymentRequest } from '@cashu/cashu-ts';
const [, , token, pass] = process.argv;
const S = 'http://localhost:8787';
const MINT = (await fetch(`${S}/api/config`).then((r) => r.json())).kitty;
const coco = await initializeCoco({ repo: new MemoryRepositories(), seedGetter: async () => crypto.getRandomValues(new Uint8Array(64)) });
await coco.mint.addMint(MINT, { trusted: true });
await coco.wallet.receive(token);

async function pledge(withRefund = true) {
  const ask = await fetch(`${S}/api/pledge`, { headers: { 'X-Pass': pass } });
  if (ask.status !== 402) return console.log('ask', ask.status, await ask.text());
  const req = decodePaymentRequest(ask.headers.get('X-Cashu'));
  const lock = req.nut10;
  const locktime = Number(lock.tags.find(([k]) => k === 'locktime')[1]);
  const refund = await coco.keyring.generateKeyPair(true);
  const options = { kind: 'P2PK', data: lock.data, locktime, ...(withRefund ? { refundKeys: [refund.publicKeyHex] } : {}) };
  const prepared = await coco.ops.send.prepare({ mintUrl: MINT, amount: Number(req.amount), target: { type: 'p2pk', options } });
  const { token: t } = await coco.ops.send.execute(prepared);
  const res = await fetch(`${S}/api/pledge`, { headers: { 'X-Pass': pass, 'X-Cashu': coco.wallet.encodeToken(t) } });
  console.log(withRefund ? 'pledge' : 'pledge without refund', res.status, await res.text());
}
await pledge(false);
await pledge(true);
const plain = await coco.ops.send.execute(await coco.ops.send.prepare({ mintUrl: MINT, amount: 21 }));
const r = await fetch(`${S}/api/pledge`, { headers: { 'X-Pass': pass, 'X-Cashu': coco.wallet.encodeToken(plain.token) } });
console.log('plain token', r.status, await r.text());
process.exit(0);
