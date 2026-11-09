// The viewer's own Coco wallet, in this browser (IndexedDB), at this web address. Shared by the viewer pages.
// Where it lives, said plainly: closing the tab loses nothing; clearing site data, a private window, another
// browser or phone, or Safari's 7 days without a visit do. Hence Take it home.
import { initializeCoco } from '@cashu/coco-core';
import { IndexedDbRepositories } from '@cashu/coco-indexeddb';
import { Wallet, getEncodedToken, decodePaymentRequest } from '@cashu/cashu-ts';

const MAX_COINS = 500; // in one swap to the mint
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));

// The wallet's seed, kept in this browser only.
function seed(name) {
  let s = null;
  try { s = localStorage.getItem(`${name}-seed`); } catch {}
  if (!s) {
    s = hex(crypto.getRandomValues(new Uint8Array(64)));
    try { localStorage.setItem(`${name}-seed`, s); } catch {}
  }
  return unhex(s);
}

const loadPledges = () => { try { return JSON.parse(localStorage.getItem('nutpub-pledges') || '[]'); } catch { return []; } };
const savePledges = (list) => { try { localStorage.setItem('nutpub-pledges', JSON.stringify(list)); } catch {} };

export const num = (a) => (a == null ? 0 : typeof a === 'object' ? Number(a.toString()) : Number(a));
const same = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

// `name`: the viewer's wallet is 'nutpub'; the takings page keeps its own ('nutpub-takings'), so a Mac that opens
// both never mixes the artist's takings with a viewer's change.
// A payment locked to someone else's key (every NutPub payment) can never come back to this wallet, but Coco keeps
// it "pending" until it sees the coins spent, and at every start it asks the mint about each pending one in turn,
// behind its own limit of 20 requests and then one every 3 s. A long test history made opening take 10–30 s.
// So: mark such a send done as soon as it's made (local only; Coco itself refuses to roll one back).
const settle = (coco, id) => coco.ops.send.finalize(id).catch(() => {});

// Which step of opening we're on: a phone that hangs can say where.
export const walletStep = { now: 'starting' };
export async function openWallet(mintUrl, name = 'nutpub') {
  const started = performance.now();
  walletStep.now = 'storage';
  const repo = new IndexedDbRepositories({ name });
  await repo.init();
  walletStep.now = 'coco';
  const coco = await initializeCoco({ repo, seedGetter: async () => seed(name) });
  walletStep.now = 'mint';
  await coco.mint.addMint(mintUrl, { trusted: true });
  walletStep.now = 'tidying';
  // Tidy the ones left from before this fix, so the next opening is quick.
  const stale = (await coco.ops.send.listInFlight().catch(() => [])).filter((op) => op.method === 'p2pk');
  for (const op of stale) await settle(coco, op.id);
  console.info(`[wallet] ${name} opened in ${Math.round(performance.now() - started)} ms` + (stale.length ? `, ${stale.length} old payments tidied` : ''));

  return {
    coco,
    async balance() {
      const all = await coco.wallet.balances.byMint();
      const mine = Object.entries(all).find(([url]) => same(url, mintUrl));
      return num(mine?.[1]?.spendable);
    },
    receive: (token) => coco.wallet.receive(token),
    // Top up over Lightning (NUT-04). Coco keeps the quote in IndexedDB and mints it once it's paid, even after
    // a reload, so the page never owns a paid invoice on its own. topupDone() asks now instead of waiting.
    async topup(amount) {
      const quote = await coco.quotes.mint.create({ mintUrl, amount, method: 'bolt11' });
      const op = await coco.ops.mint.prepare({ quote, amount });
      return { id: op.id, request: op.request };
    },
    async topupDone(id) {
      await coco.ops.mint.checkPayment(id).catch(() => {});
      return (await coco.ops.mint.get(id))?.state === 'finalized';
    },
    on: (event, fn) => coco.on(event, fn),
    // Take it home: everything in this browser's wallet as one cashuB, for any Cashu wallet.
    async takeHome() {
      const amount = await this.balance();
      if (!amount) return null;
      const prepared = await coco.ops.send.prepare({ mintUrl, amount });
      const { token } = await coco.ops.send.execute(prepared);
      return { amount, token: coco.wallet.encodeToken(token) };
    },
    // Pay a NUT-18 request in-band (NUT-24): returns the cashuB string for the X-Cashu header.
    // Coco's tokens keep their DLEQ proofs, so they pass a gate that requires them.
    // A request with a P2PK lock (every NutPub payment) is locked to exactly that key: no locktime, no refund keys,
    // so once sent it's the artist's alone.
    async pay(creq) {
      const { nut10: lock, amount } = decodePaymentRequest(creq);
      if (lock?.kind === 'P2PK') {
        // A drink also carries a locktime and a refund key (the artist's): copied exactly, or the gate refuses it.
        const tag = (k) => (lock.tags || []).find(([name]) => name === k)?.slice(1);
        const locktime = tag('locktime') ? Number(tag('locktime')[0]) : undefined;
        const prepared = await coco.ops.send.prepare({
          mintUrl, amount: Number(amount),
          target: { type: 'p2pk', options: { kind: 'P2PK', data: lock.data, ...(locktime ? { locktime, refundKeys: tag('refund') } : {}) } },
        });
        this.lastFee = num(prepared.fee);
        const { token } = await coco.ops.send.execute(prepared);
        await settle(coco, prepared.id);
        return coco.wallet.encodeToken(token);
      }
      const req = await coco.paymentRequests.parse(creq);
      const prepared = await coco.paymentRequests.prepare(req, { mintUrl });
      const result = await coco.paymentRequests.execute(prepared);
      if (result.type !== 'inband') throw new Error(`unexpected transport ${result.type}`);
      return coco.wallet.encodeToken(result.token);
    },
    // A pledge (NUT-24 with nut10): lock to the request's key and locktime, adding a fresh refund key of our own.
    // The refund secret stays in this browser so it can take the pledge back after the goal closes.
    async pledge(creq) {
      const req = decodePaymentRequest(creq);
      const lock = req.nut10;
      const locktime = Number(lock.tags.find(([k]) => k === 'locktime')[1]);
      const refund = await coco.keyring.generateKeyPair(true);
      const prepared = await coco.ops.send.prepare({
        mintUrl, amount: Number(req.amount),
        target: { type: 'p2pk', options: { kind: 'P2PK', data: lock.data, locktime, refundKeys: [refund.publicKeyHex] } },
      });
      const { token } = await coco.ops.send.execute(prepared);
      await settle(coco, prepared.id);
      const encoded = coco.wallet.encodeToken(token);
      savePledges([...loadPledges(), { token: encoded, sk: hex(refund.secretKey), locktime, amount: Number(req.amount) }]);
      return encoded;
    },
    // The takings page: collect a payment locked to a key in this browser's keyring. Coco signs it with that key
    // itself; if it won't, cashu-ts signs with the same key (as reclaim() does) and the fresh proofs go to Coco.
    // `signer`: the key that signs when it isn't the lock's own (the artist taking an unpoured drink by its refund path).
    async collect(token, pubkey, signer = pubkey) {
      try {
        if (signer !== pubkey) throw new Error('refund path');
        return await coco.wallet.receive(token);
      } catch (e) {
        const pair = await coco.keyring.getKeyPair(signer);
        if (!pair || /spent/i.test(e.message)) throw e;
        const w = new Wallet(mintUrl, { unit: 'sat' });
        await w.loadMint();
        const proofs = await w.receive(token, { privkey: hex(pair.secretKey) });
        await coco.wallet.receive(getEncodedToken({ mint: mintUrl, unit: 'sat', proofs }));
      }
    },
    // Many payments locked to keys in this browser, in one swap: the mint's fee is per coin, rounded up per swap, so
    // a swap per payment would cost at least a sat each. One bad coin fails a whole swap, so a failed swap is halved
    // until the bad one stands alone. Coco's receive is safe if the reply is lost: it can recover the coins from the seed.
    async collectAll(tokens, progress = () => {}) {
      const parts = [];
      for (const t of tokens) parts.push((await coco.wallet.decodeToken(t, mintUrl)).proofs);
      let done = 0;
      const swap = async (list) => {
        try {
          await coco.wallet.receive({ mint: mintUrl, unit: 'sat', proofs: list.flat() });
          progress(done += list.length, parts.length);
        } catch {
          if (list.length === 1) return progress(done += 1, parts.length);
          await swap(list.slice(0, list.length >> 1));
          await swap(list.slice(list.length >> 1));
        }
      };
      let batch = [];
      let coins = 0;
      for (const proofs of parts) {
        if (batch.length && coins + proofs.length > MAX_COINS) { await swap(batch); batch = []; coins = 0; }
        batch.push(proofs);
        coins += proofs.length;
      }
      if (batch.length) await swap(batch);
    },
    pledges: () => loadPledges(),
    // After the goal closes unmet: sign each pledge's refund path with cashu-ts (Coco only tries the main lock key),
    // then hand the fresh proofs back to Coco. Call again until the mint's clock has passed the locktime.
    async reclaim() {
      const w = new Wallet(mintUrl, { unit: 'sat' });
      await w.loadMint();
      let back = 0;
      for (const p of loadPledges()) {
        try {
          const proofs = await w.receive(p.token, { privkey: p.sk });
          await coco.wallet.receive(getEncodedToken({ mint: mintUrl, unit: 'sat', proofs }));
          back += p.amount;
          savePledges(loadPledges().filter((q) => q.token !== p.token));
        } catch (e) {
          if (/spent/i.test(e.message)) savePledges(loadPledges().filter((q) => q.token !== p.token)); // the artist took it
        }
      }
      return back;
    },
  };
}
