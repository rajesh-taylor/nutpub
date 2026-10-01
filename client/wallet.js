// The phone's own Coco wallet (IndexedDB), shared by the fan pages.
import { initializeCoco } from '@cashu/coco-core';
import { IndexedDbRepositories } from '@cashu/coco-indexeddb';

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
    // Pay a NUT-18 request in-band (NUT-24): returns the cashuB string for the X-Cashu header.
    async pay(creq) {
      const req = await coco.paymentRequests.parse(creq);
      const prepared = await coco.paymentRequests.prepare(req, { mintUrl: kitty });
      const result = await coco.paymentRequests.execute(prepared);
      if (result.type !== 'inband') throw new Error(`unexpected transport ${result.type}`);
      return coco.wallet.encodeToken(result.token);
    },
  };
}
