// Gig 3 on a judge's stage (session 40, agreed with Rajesh 20 Nov): a fan who bought weeks ahead and never came, so
// Takings has an unpoured beer token going to Longy. Made at End night, after last orders is called (setlist.js), by a
// wallet of its own in this browser ('nutpub-noshow'): test sats from the test mint, then the same two 402s as the
// fan's phone, with a pass of its own. The venue ticket is locked to the artist's key (blind-signed, X-Blind), the
// token to the bar's key until last orders, then the artist's (NUT-11). The server only checks them, as for any fan,
// and never holds a sat. Nobody scans it in: a no-show.
import { openWallet } from './wallet.js';
import { blindFor } from './ticket.js';

const KEEP = '-noshow';
const PASS = `nutpub-pass${KEEP}`;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let ready = null;
// Opens the wallet and fills it with what the ticket costs (plus the mint's fees), ahead of End night where it can.
export function noShowReady(mintUrl, price) {
  ready ??= (async () => {
    const w = await openWallet(mintUrl, 'nutpub-noshow');
    const need = price + 64 - (await w.balance());
    if (need > 0) {
      const { id } = await w.topup(need);
      for (let i = 0; i < 30 && !(await w.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
    }
    return w;
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

// The no-show's pass: kept in this browser, so a second End night (or a retry) doesn't buy twice.
async function passOf() {
  let pass = get(PASS);
  if (pass && (await fetch('/api/door/me', { headers: { 'X-Pass': pass } })).ok) return pass;
  pass = (await fetch('/api/pass', { method: 'POST' }).then((r) => r.json())).pass;
  set(PASS, pass);
  return pass;
}

// Buys the ticket and its token, once. Returns true when both are paid.
export async function noShow(mintUrl, price) {
  const pass = await passOf();
  const me = await fetch('/api/door/me', { headers: { 'X-Pass': pass } }).then((r) => r.json());
  if (me.drink) return true;
  const w = await noShowReady(mintUrl, price);
  const paid = async (url, extra = {}) => {
    const headers = { 'X-Pass': pass, ...extra };
    const res = await fetch(url, { headers });
    if (res.status !== 402) return res;
    return fetch(url, { headers: { ...headers, 'X-Cashu': await w.pay(res.headers.get('X-Cashu')) } });
  };
  if (!me.ticket) {
    const t = await paid('/api/door/ticket', { 'X-Blind': await blindFor(pass, KEEP) });
    if (!t.ok) throw new Error(`no-show's ticket: ${t.status}`);
  }
  const d = await paid('/api/door/drink');
  if (!d.ok) throw new Error(`no-show's drink: ${d.status}`);
  return true;
}
