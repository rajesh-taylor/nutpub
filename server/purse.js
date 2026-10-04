// The takings: the account holder's ecash at the test mint. Every payment the gate accepts is swapped (NUT-03)
// into fresh proofs that land here. Kept in SQLite, so a restart loses nothing.
import { Wallet, sumProofs } from '@cashu/cashu-ts';
import { MINT_API } from './config.js';
import { kv } from './db.js';

// The server talks to the mint on its local port; tokens still carry the mint's public URL.
export const mint = new Wallet(MINT_API, { unit: 'sat' });
export let keysetIds = [];

export async function initPurse() {
  await mint.loadMint();
  const { keysets } = await fetch(`${MINT_API}/v1/keysets`).then((r) => r.json());
  keysetIds = keysets.map((k) => k.id);
}

const load = () => kv.get('takings', []);
export const balance = () => Number(sumProofs(load()));

// One mint call at a time, so two swaps never race on the stored proofs.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

// Swap incoming proofs for fresh ones. Throws the mint's error if any input is already spent.
export const take = (incoming) =>
  serial(async () => {
    const fresh = await mint.receive(incoming);
    kv.set('takings', [...load(), ...fresh]);
    return Number(sumProofs(fresh));
  });
