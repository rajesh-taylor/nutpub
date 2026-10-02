// Longy's paid over Lightning: when the room hits the goal, his takings melt (NUT-05) to his Lightning address
// (LNURL-pay). Off until LONGY_LN is set; the takings then stay as ecash under his key.
import { sumProofs } from '@cashu/cashu-ts';
import { LONGY_LN } from './config.js';
import { kitty } from './house.js';

export const payout = { state: LONGY_LN ? 'ready' : 'off', sats: 0, fee: 0, error: null };

// A bolt11 for `sats` from a Lightning address (user@domain → /.well-known/lnurlp/user → callback?amount=msat).
export async function invoiceFor(address, sats) {
  const [user, domain] = address.split('@');
  const meta = await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`).then((r) => r.json());
  if (meta.status === 'ERROR' || !meta.callback) throw new Error(meta.reason || 'not a Lightning address');
  if (sats * 1000 < meta.minSendable || sats * 1000 > meta.maxSendable) {
    throw new Error(`${sats} sats is outside ${meta.minSendable / 1000}–${meta.maxSendable / 1000}`);
  }
  const url = new URL(meta.callback);
  url.searchParams.set('amount', String(sats * 1000));
  if (meta.commentAllowed) url.searchParams.set('comment', 'The NutPub, btc++ Berlin'.slice(0, meta.commentAllowed));
  const r = await fetch(url).then((res) => res.json());
  if (!r.pr) throw new Error(r.reason || 'no invoice from the Lightning address');
  return r.pr;
}

// Melt `proofs` (all of Longy's takings) to his address. Returns the proofs left over (change, or all of them if
// it failed), so nothing is lost either way. `getInvoice` is swappable for tests.
export async function payLongy(proofs, address = LONGY_LN, getInvoice = invoiceFor) {
  if (!address) return proofs;
  const total = Number(sumProofs(proofs));
  payout.state = 'sending';
  payout.error = null;
  try {
    // The routing fee reserve comes off the top: quote, see the reserve, ask for less, until it fits.
    let amount = total - Math.max(2, Math.ceil(total * 0.02));
    for (let i = 0; i < 5 && amount > 0; i++) {
      const q = await kitty.createMeltQuoteBolt11(await getInvoice(address, amount));
      const need = Number(q.amount) + Number(q.fee_reserve);
      if (need > total) { amount = total - Number(q.fee_reserve) - 1; continue; }
      const { keep, send } = await kitty.ops.send(need, proofs).run(); // exact inputs, so change is only the unused reserve
      const res = await kitty.meltProofsBolt11(q, send);
      const change = res.change || [];
      if (res.quote.state !== 'PAID') {
        payout.state = 'failed';
        payout.error = `melt ${res.quote.state}`;
        return [...keep, ...send, ...change];
      }
      payout.state = 'sent';
      payout.sats = Number(q.amount);
      payout.fee = need - Number(q.amount) - Number(sumProofs(change));
      console.log(`payout: ${payout.sats} sats to Longy over Lightning (fee ${payout.fee})`);
      return [...keep, ...change];
    }
    throw new Error(`${total} sats doesn't cover the routing fee`);
  } catch (e) {
    payout.state = 'failed';
    payout.error = String(e.message || e);
    console.error('payout failed:', payout.error);
    return proofs;
  }
}

export function resetPayout() {
  Object.assign(payout, { state: LONGY_LN ? 'ready' : 'off', sats: 0, fee: 0, error: null });
}
