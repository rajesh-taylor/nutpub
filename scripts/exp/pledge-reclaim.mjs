// Experiment: Coco P2PK send to an "artist" key with locktime + our refund key, then reclaim after locktime.
import { initializeCoco, MemoryRepositories } from '@cashu/coco-core';
import { getPubKeyFromPrivKey, createRandomSecretKey } from '@cashu/cashu-ts';
const MINT = 'http://127.0.0.1:3338';
const token = process.argv[2];
const coco = await initializeCoco({ repo: new MemoryRepositories(), seedGetter: async () => crypto.getRandomValues(new Uint8Array(64)) });
await coco.mint.addMint(MINT, { trusted: true });
await coco.wallet.receive(token);
const bal = async () => (await coco.wallet.balances.byMint())[MINT]?.spendable?.toString();
console.log('balance', await bal());
const artist = Buffer.from(getPubKeyFromPrivKey(createRandomSecretKey())).toString('hex');
const refund = await coco.keyring.generateKeyPair(true);
const locktime = Math.floor(Date.now() / 1000) + 15;
const prepared = await coco.ops.send.prepare({
  mintUrl: MINT, amount: 21,
  target: { type: 'p2pk', options: { kind: 'P2PK', data: artist, locktime, refundKeys: [refund.publicKeyHex] } },
});
const { operation, token: sent } = await coco.ops.send.execute(prepared);
console.log('sent', operation.id, operation.state, 'proofs', sent.proofs.length, sent.proofs[0].secret.slice(0, 160));
console.log('balance after pledge', await bal());
try { await coco.wallet.receive(sent); console.log('early receive: worked?!'); } catch (e) { console.log('early receive refused:', e.message.slice(0, 160)); }
await new Promise((r) => setTimeout(r, 20000));
try { await coco.wallet.receive(sent); console.log('coco receive after locktime OK'); } catch (e) {
  console.log('coco receive after locktime failed:', e.message.slice(0, 200));
  const { Wallet } = await import('@cashu/cashu-ts');
  const w = new Wallet(MINT, { unit: 'sat' }); await w.loadMint();
  const sk = Buffer.from(refund.secretKey).toString('hex');
  try { const p = await w.receive(sent, { privkey: sk }); console.log('cashu-ts receive with refund key OK', p.length); } catch (e2) { console.log('cashu-ts failed too:', e2.message.slice(0, 200)); }
}
console.log('balance end', await bal());
process.exit(0);
