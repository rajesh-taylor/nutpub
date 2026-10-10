// The server's own wallet at the test mint. Until Sat 10 Oct every payment the gate accepted was swapped (NUT-03)
// into fresh proofs here; now payments are locked to the artist and never land here (server/takings.js). Kept for
// what's already in it (shown as "Before Sat 10") and for later (the pint, a house float). Kept in SQLite.
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
