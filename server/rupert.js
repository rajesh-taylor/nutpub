// Rupert, the Man from the Ministry of Fiat, prints SuitCoin on his own mint (a fake cdk-mintd whose invoices pay themselves).
import { Wallet, getEncodedToken } from '@cashu/cashu-ts';
import { SUIT_URL, KITTY_URL } from './config.js';
import { kitty } from './house.js';

const suit = new Wallet(SUIT_URL, { unit: 'sat' });
let loaded = null;

export async function printSuitCoin(amount) {
  loaded ??= suit.loadMint();
  await loaded;
  const quote = await suit.createMintQuoteBolt11(amount);
  for (let i = 0; i < 20; i++) {
    const q = await suit.checkMintQuote('bolt11', quote.quote);
    if (q.state === 'PAID') break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const proofs = await suit.mintProofsBolt11(amount, quote.quote);
  return { mint: SUIT_URL, unit: 'sat', proofs };
}

export const suitToken = (t) => getEncodedToken(t);

// The relabel: same notes, the Kitty's name and keyset id written on top. The DLEQ "hologram" can't follow.
export function relabel(t) {
  const id = kitty.keysetId;
  return getEncodedToken({ ...t, mint: KITTY_URL, proofs: t.proofs.map((p) => ({ ...p, id })) });
}
