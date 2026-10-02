// Payout test on the fake mint: mint 63 test sats, then melt them to a fake-mint invoice instead of an LNURL one.
// Run: KITTY_URL=http://127.0.0.1:3338 node scripts/exp/payout-test.mjs
import { Wallet, sumProofs } from '@cashu/cashu-ts';
import { kitty } from '../../server/house.js';
import { payLongy, payout } from '../../server/payout.js';

const w = new Wallet(process.env.KITTY_URL, { unit: 'sat' });
await w.loadMint();
await kitty.loadMint();
const q = await w.createMintQuoteBolt11(63);
for (let i = 0; i < 30 && (await w.checkMintQuote('bolt11', q.quote)).state !== 'PAID'; i++) await new Promise((r) => setTimeout(r, 300));
const proofs = await w.mintProofsBolt11(63, q.quote);
console.log('takings', Number(sumProofs(proofs)));
const fakeInvoice = async (_address, sats) => (await w.createMintQuoteBolt11(sats)).request;
const left = await payLongy(proofs, 'longy@test', fakeInvoice);
console.log('payout', payout, 'left', Number(sumProofs(left)));
process.exit(0);
