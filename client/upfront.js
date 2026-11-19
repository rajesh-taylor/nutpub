// Plan gig's Free to watch card (session 35): the artist pays for the free stream up front, one 402 from their own
// wallet in this browser, locked to the NutPub's key (NUT-11). On the test mint the wallet fetches the test sats
// first, so a judge presses once. Its own wallet: nothing left over mixes with the takings.
import { openWallet } from './wallet.js';

const URL_PAY = '/api/admin/free-stream/pay';
export async function payUpfront(adminKey, say = () => {}) {
  const health = await fetch('/api/health').then((r) => r.json());
  say('Opening your wallet…');
  const w = await openWallet(health.mint.url, 'nutpub-artist');
  const headers = { 'X-Admin': adminKey };
  const ask = await fetch(URL_PAY, { headers });
  if (ask.status !== 402) {
    const body = await ask.json().catch(() => ({}));
    if (!ask.ok) throw new Error(body.detail || body.error || `Refused (${ask.status})`);
    return body; // nothing due
  }
  const { amount } = await ask.json();
  const have = await w.balance();
  const need = amount + 10; // the mint's fee on the payment, a sat or two
  if (have < need) {
    if (!health.mint.test) throw new Error(`Your wallet has ${have.toLocaleString('en-GB')} sats; this needs ${amount.toLocaleString('en-GB')}.`);
    say('Getting test sats from the mint…');
    const { id } = await w.topup(need - have);
    for (let i = 0; i < 30 && !(await w.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
  }
  say('Paying…');
  const token = await w.pay(ask.headers.get('X-Cashu'));
  const paid = await fetch(URL_PAY, { headers: { ...headers, 'X-Cashu': token } });
  const body = await paid.json().catch(() => ({}));
  if (!paid.ok) throw new Error(body.detail || body.error || `Refused (${paid.status})`);
  return body;
}
