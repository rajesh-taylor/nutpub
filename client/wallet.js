// The phone's own Coco wallet (IndexedDB), shared by the fan pages.
import { initializeCoco } from '@cashu/coco-core';
import { IndexedDbRepositories } from '@cashu/coco-indexeddb';
import { Wallet, getEncodedToken, decodePaymentRequest } from '@cashu/cashu-ts';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));

// A seed for tonight, kept on this phone only.
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

// Send the Kitty's HTTP calls through our server (/kitty). Tokens still name the real mint URL.
// The mint's WebSocket (NUT-17) is refused, so Coco falls back to polling.
function relayKitty(kitty) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(kitty + '/')) {
      const relayed = '/kitty' + url.slice(kitty.length);
      return realFetch(typeof input === 'string' || input instanceof URL ? relayed : new Request(relayed, input), init);
    }
    return realFetch(input, init);
  };
  const RealWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (String(url).includes(new URL(kitty).host)) throw new Error('mint websocket not relayed');
    return new RealWS(url, protocols);
  };
  Object.assign(window.WebSocket, RealWS);
  window.WebSocket.prototype = RealWS.prototype;
}

export async function openWallet(kitty) {
  relayKitty(kitty);
  const repo = new IndexedDbRepositories({ name: 'nutpub' });
  await repo.init();
  const coco = await initializeCoco({ repo, seedGetter: async () => seed() });
  await coco.mint.addMint(kitty, { trusted: true });

  return {
    coco,
    async balance() {
      const all = await coco.wallet.balances.byMint();
      const mine = Object.entries(all).find(([url]) => url.replace(/\/+$/, '') === kitty);
      return num(mine?.[1]?.spendable);
    },
    receive: (token) => coco.wallet.receive(token),
    // Top up over Lightning (NUT-04). Coco keeps the quote in IndexedDB and mints it once it's paid, even after
    // a reload, so the page never owns a paid invoice on its own. check() asks now instead of waiting.
    async topup(amount) {
      const quote = await coco.quotes.mint.create({ mintUrl: kitty, amount, method: 'bolt11' });
      const op = await coco.ops.mint.prepare({ quote, amount });
      return { id: op.id, request: op.request };
    },
    async topupDone(id) {
      await coco.ops.mint.checkPayment(id).catch(() => {});
      return (await coco.ops.mint.get(id))?.state === 'finalized';
    },
    on: (event, fn) => coco.on(event, fn),
    // Pay a NUT-18 request in-band (NUT-24): returns the cashuB string for the X-Cashu header.
    async pay(creq) {
      const req = await coco.paymentRequests.parse(creq);
      const prepared = await coco.paymentRequests.prepare(req, { mintUrl: kitty });
      const result = await coco.paymentRequests.execute(prepared);
      if (result.type !== 'inband') throw new Error(`unexpected transport ${result.type}`);
      return coco.wallet.encodeToken(result.token);
    },
    // A pledge (NUT-24 with nut10): lock to the request's key and locktime, adding a fresh refund key of our own.
    // The refund secret stays on this phone so it can take the pledge back after last orders.
    async pledge(creq) {
      const req = decodePaymentRequest(creq);
      const lock = req.nut10;
      const locktime = Number(lock.tags.find(([k]) => k === 'locktime')[1]);
      const refund = await coco.keyring.generateKeyPair(true);
      const prepared = await coco.ops.send.prepare({
        mintUrl: kitty, amount: Number(req.amount),
        target: { type: 'p2pk', options: { kind: 'P2PK', data: lock.data, locktime, refundKeys: [refund.publicKeyHex] } },
      });
      const { token } = await coco.ops.send.execute(prepared);
      const encoded = coco.wallet.encodeToken(token);
      const sk = [...refund.secretKey].map((x) => x.toString(16).padStart(2, '0')).join('');
      savePledges([...loadPledges(), { token: encoded, sk, locktime, amount: Number(req.amount) }]);
      return encoded;
    },
    pledges: () => loadPledges(),
    // After last orders: sign each pledge's refund path (cashu-ts; Coco only uses the main lock key),
    // then hand the fresh proofs back to Coco. Retries until the mint's clock has passed the locktime.
    async reclaim() {
      const w = new Wallet(kitty, { unit: 'sat' });
      await w.loadMint();
      let back = 0;
      for (const p of loadPledges()) {
        try {
          const proofs = await w.receive(p.token, { privkey: p.sk });
          await coco.wallet.receive(getEncodedToken({ mint: kitty, unit: 'sat', proofs }));
          back += p.amount;
          savePledges(loadPledges().filter((q) => q.token !== p.token));
        } catch (e) {
          if (/spent/i.test(e.message)) savePledges(loadPledges().filter((q) => q.token !== p.token)); // Longy took it
        }
      }
      return back;
    },
    forgetPledges: () => savePledges([]),
  };
}
