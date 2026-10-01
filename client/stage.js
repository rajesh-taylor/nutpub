// Stage screen: gift QRs from the house float. Private link: /stage.html#k=<ADMIN_KEY>
import QRCode from 'qrcode';

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.hash.slice(1)).get('k') || '';

async function gift(amount, who) {
  $('status').textContent = 'Pouring a gift…';
  const res = await fetch(`/api/gift?amount=${amount}`, { method: 'POST', headers: { 'X-Admin': key } });
  const body = await res.json();
  $('float').textContent = `house: ${body.balance ?? '?'} sats`;
  if (!res.ok) return ($('status').textContent = body.error);
  // The token rides in the # fragment: it never reaches our server's logs.
  const url = `${location.origin}/#${body.token}`;
  await QRCode.toCanvas($('qr'), url, { errorCorrectionLevel: 'L', margin: 1, width: 840 });
  $('qr').hidden = false;
  $('gift-label').textContent = `${amount} sats for a ${who}. Scan me.`;
  $('status').textContent = '';
}

$('gift-judge').onclick = () => gift(105, 'judge');
$('gift-friend').onclick = () => gift(21, 'friend');
fetch('/api/house', { headers: { 'X-Admin': key } })
  .then((r) => r.json())
  .then((b) => ($('float').textContent = b.balance == null ? 'not signed in: add #k=…' : `house: ${b.balance} sats`));
