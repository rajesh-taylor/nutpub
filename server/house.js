// The house wallet: the NutPub's own ecash at the Kitty. Door takings land here; gifts come out of here.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Wallet, getEncodedToken, sumProofs } from '@cashu/cashu-ts';
import { KITTY_URL } from './config.js';

const FILE = fileURLToPath(new URL(`../data/house-${KITTY_URL.replace(/\W+/g, '_')}.json`, import.meta.url));

export const kitty = new Wallet(KITTY_URL, { unit: 'sat' });
export let kittyKeysetIds = [];

let proofs = [];
try { proofs = JSON.parse(readFileSync(FILE, 'utf8')); } catch {}

function save() {
  writeFileSync(FILE + '.tmp', JSON.stringify(proofs));
  renameSync(FILE + '.tmp', FILE);
}

// One mint call at a time, so two swaps never spend the same house proofs.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

export async function initHouse() {
  await kitty.loadMint();
  const { keysets } = await fetch(`${KITTY_URL}/v1/keysets`).then((r) => r.json());
  kittyKeysetIds = keysets.map((k) => k.id);
}

export const balance = () => Number(sumProofs(proofs));

// Swap incoming proofs for fresh ones (NUT-03). Throws the mint's error if any input is spent.
export const take = (incoming, privkey) =>
  serial(async () => {
    const fresh = await kitty.receive(incoming, privkey ? { privkey } : undefined);
    proofs.push(...fresh);
    save();
    return fresh;
  });

// Fund the house over Lightning (NUT-04): a bolt11 from the Kitty, minted into the house once paid.
// Open quotes are saved to disk and the server claims them itself, so a closed page never strands a payment.
const QUOTES = FILE.replace('house-', 'quotes-');
let quotes = {};
try { quotes = JSON.parse(readFileSync(QUOTES, 'utf8')); } catch {}
const saveQuotes = () => writeFileSync(QUOTES, JSON.stringify(quotes));

export async function fundQuote(amount) {
  const q = await kitty.createMintQuoteBolt11(amount);
  quotes[q.quote] = { amount, at: Date.now() };
  saveQuotes();
  return { quote: q.quote, request: q.request, amount };
}

export const fundClaim = (quote, amount) =>
  serial(async () => {
    const q = await kitty.checkMintQuote('bolt11', quote);
    if (q.state === 'ISSUED') { delete quotes[quote]; saveQuotes(); return { state: 'ISSUED', minted: 0 }; }
    if (q.state !== 'PAID') return { state: q.state };
    const fresh = await kitty.mintProofsBolt11(amount, quote);
    proofs.push(...fresh);
    save();
    delete quotes[quote];
    saveQuotes();
    console.log(`house: +${amount} sats from Lightning (quote ${quote})`);
    return { state: 'ISSUED', minted: amount };
  });

// Every 5 s, claim any paid quotes; forget unpaid ones after a day.
setInterval(() => {
  for (const [id, { amount, at }] of Object.entries(quotes)) {
    if (Date.now() - at > 86_400_000) { delete quotes[id]; saveQuotes(); continue; }
    fundClaim(id, amount).catch(() => {});
  }
}, 5000).unref();

// A cashuB token for `amount` sats, with DLEQ proofs kept so the receiver can check them offline.
// With `p2pk`, the sent proofs are locked (NUT-11), e.g. the free pint to the bar's key.
export const give = (amount, p2pk) =>
  serial(async () => {
    if (balance() < amount) throw new Error(`house float too low (${balance()} sats)`);
    const op = kitty.ops.send(amount, proofs);
    const { keep, send } = await (p2pk ? op.asP2PK(p2pk) : op).run();
    proofs = keep;
    save();
    return getEncodedToken({ mint: KITTY_URL, unit: 'sat', proofs: send });
  });
