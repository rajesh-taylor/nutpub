// House float top-up over Lightning. Private link: /fund.html#k=<ADMIN_KEY>
import QRCode from 'qrcode';

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.hash.slice(1)).get('k') || (() => { try { return localStorage.getItem('nutpub-k'); } catch { return ''; } })() || '';
const post = (url) => fetch(url, { method: 'POST', headers: { 'X-Admin': key } }).then((r) => r.json());

async function showFloat() {
  const b = await fetch('/api/house', { headers: { 'X-Admin': key } }).then((r) => r.json());
  $('float').textContent = b.balance == null ? 'add #k=…' : `${b.balance} sats`;
}

$('go').onclick = async () => {
  const amount = Number($('amount').value);
  $('status').textContent = 'Asking the NutPub Mint for an invoice…';
  const q = await post(`/api/house/invoice?amount=${amount}`);
  if (!q.request) return ($('status').textContent = q.error);
  await QRCode.toCanvas($('qr'), q.request.toUpperCase(), { margin: 1, width: 760 });
  $('qr').hidden = false;
  $('inv').textContent = q.request;
  $('copy').hidden = false;
  $('copy').onclick = () => navigator.clipboard.writeText(q.request).then(() => ($('status').textContent = 'Copied.'));
  $('status').textContent = `Pay ${q.amount} sats from any Lightning wallet. Waiting…`;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const c = await post(`/api/house/claim?quote=${q.quote}&amount=${q.amount}`);
    if (c.state === 'ISSUED') {
      $('status').textContent = `Paid. ${c.minted} sats are in the house.`;
      $('qr').hidden = true;
      return showFloat();
    }
    if (c.error) return ($('status').textContent = c.error);
  }
};
showFloat();

// Ecash back into the house (e.g. a phone's "Take it home" note from a test run).
$('give-back').onclick = async () => {
  const token = $('token').value.trim();
  if (!token) return;
  $('status').textContent = 'Taking it into the house…';
  const r = await fetch('/api/house/fund', { method: 'POST', headers: { 'X-Admin': key, 'X-Cashu': token } }).then((x) => x.json());
  $('status').textContent = r.error ? r.error : `In the house. Float: ${r.balance} sats.`;
  if (!r.error) { $('token').value = ''; showFloat(); }
};
