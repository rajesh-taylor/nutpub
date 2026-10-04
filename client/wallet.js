// The viewer's own Coco wallet, in this browser (IndexedDB), at this web address. Shared by the viewer pages.
// Where it lives, said plainly: closing the tab loses nothing; clearing site data, a private window, another
// browser or phone, or Safari's 7 days without a visit do. Hence Take it home.
import { initializeCoco } from '@cashu/coco-core';
import { IndexedDbRepositories } from '@cashu/coco-indexeddb';
import { Wallet, getEncodedToken, decodePaymentRequest } from '@cashu/cashu-ts';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));

// The wallet's seed, kept in this browser only.
function seed() {
  let s = null;
  try { s = localStorage.getItem('nutpub-seed'); } catch {}
  if (!s) {
    s = hex(crypto.getRandomValues(new Uint8Array(64)));
    try { localStorage.setItem('nutpub-seed', s); } catch {}
  }
  return unhex(s);
}

const loadPledges = () => { try { return JSON.parse(localStorage.getItem('nutpub-pledges') || '[]'); } catch { return []; } };
const savePledges = (list) => { try { localStorage.setItem('nutpub-pledges', JSON.stringify(list)); } catch {} };

export const num = (a) => (a == null ? 0 : typeof a === 'object' ? Number(a.toString()) : Number(a));
const same = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

export async function openWallet(mintUrl) {
  const repo = new IndexedDbRepositories({ name: 'nutpub' });
  await repo.init();
  const coco = await initializeCoco({ repo, seedGetter: async () => seed() });
  await coco.mint.addMint(mintUrl, { trusted: true });

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
    // Take it home: everything in this browser's pocket as one cashuB, for any Cashu wallet.
    async takeHome() {
      const amount = await this.balance();
      if (!amount) return null;
      const prepared = await coco.ops.send.prepare({ mintUrl, amount });
      const { token } = await coco.ops.send.execute(prepared);
      return { amount, token: coco.wallet.encodeToken(token) };
    },
    // Pay a NUT-18 request in-band (NUT-24): returns the cashuB string for the X-Cashu header.
    // Coco's tokens keep their DLEQ proofs, so they pass a gate that requires them.
    async pay(creq) {
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
      const encoded = coco.wallet.encodeToken(token);
      savePledges([...loadPledges(), { token: encoded, sk: hex(refund.secretKey), locktime, amount: Number(req.amount) }]);
      return encoded;
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
