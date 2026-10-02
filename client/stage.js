// Stage screen: gift QRs from the house float. Private link: /stage.html#k=<ADMIN_KEY>
import QRCode from 'qrcode';

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.hash.slice(1)).get('k') || (() => { try { return localStorage.getItem('nutpub-k'); } catch { return ''; } })() || '';

async function gift(amount, who) {
  $('status').textContent = 'Pouring a gift…';
  const res = await fetch(`/api/gift?amount=${amount}`, { method: 'POST', headers: { 'X-Admin': key } });
  const body = await res.json();
  $('float').textContent = `house: ${body.balance ?? '?'} sats`;
  if (!res.ok) return ($('status').textContent = body.error);
  // The token rides in the # fragment: it never reaches our server's logs.
  const { publicUrl } = await fetch('/api/config').then((r) => r.json());
  const url = `${publicUrl || location.origin}/#${body.token}`;
  await QRCode.toCanvas($('qr'), url, { errorCorrectionLevel: 'L', margin: 1, width: 840 });
  $('qr').hidden = false;
  $('gift-label').textContent = `${amount} sats for a ${who}. Scan me.`;
  $('status').textContent = '';
}

$('gift-judge').onclick = () => gift(105, 'guest');
$('gift-friend').onclick = () => gift(21, 'friend');
fetch('/api/house', { headers: { 'X-Admin': key } })
  .then((r) => r.json())
  .then((b) => ($('float').textContent = b.balance == null ? 'not signed in: add #k=…' : `house: ${b.balance} sats`));

// Curtains up (manual) and the live count of phones in, over SSE.
const post = (url) => fetch(url, { method: 'POST', headers: { 'X-Admin': key } }).then((r) => r.json());
$('curtains').onclick = () => post('/api/curtains');
$('newshow').onclick = () => confirm('Start a new show? Everyone has to pay at the door again.') && post('/api/new-show');
const apply = (s) => {
  const f = s.finale;
  if (f) {
    $('finale').hidden = !s.t0;
    $('goal').textContent = f.state === 'paid' ? `⚡ Longy’s paid! ${f.total} sats` : `Longy: ${f.total} / ${f.goal} sats`;
    const lit = Math.min(7, Math.floor((7 * f.total) / f.goal));
    document.querySelectorAll('.lights i').forEach((el, i) => el.classList.toggle('on', i < lit));
    const left = Math.max(0, f.lastOrders - Math.floor(s.now / 1000));
    $('last-orders').textContent = f.state === 'open' ? `Last orders in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : f.state === 'missed' ? 'Missed. Every sat pledged is going home.' : '';
    document.body.classList.toggle('paid', f.state === 'paid');
  }
  $('phones').textContent = s.phones;
  $('headline').textContent = s.t0 ? 'NOW PLAYING: Longy' : 'Bring 2 more friends — let’s roll!';
  $('curtains').disabled = !!s.t0;
};
// SSE, plus a 1-s poll because the tunnel holds SSE back.
new EventSource('/api/events').onmessage = (e) => apply(JSON.parse(e.data));
const poll = () => fetch('/api/show').then((r) => r.json()).then(apply).catch(() => {}).finally(() => setTimeout(poll, 1000));
poll();
