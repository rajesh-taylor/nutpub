// Stage screen: gift QRs from the house float. Private link: /stage.html#k=<ADMIN_KEY>
import QRCode from 'qrcode';
import { t, sats, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.hash.slice(1)).get('k') || (() => { try { return localStorage.getItem('nutpub-k'); } catch { return ''; } })() || '';

async function gift(amount, who) {
  $('status').textContent = t('stage.pouring');
  const res = await fetch(`/api/gift?amount=${amount}`, { method: 'POST', headers: { 'X-Admin': key } });
  const body = await res.json();
  $('float').textContent = t('stage.house', { n: body.balance ?? '?' });
  if (!res.ok) return ($('status').textContent = body.error);
  // The token rides in the # fragment: it never reaches our server's logs.
  const { publicUrl } = await fetch('/api/config').then((r) => r.json());
  const url = `${publicUrl || location.origin}/#${body.token}`;
  await QRCode.toCanvas($('qr'), url, { errorCorrectionLevel: 'L', margin: 1, width: 840 });
  $('qr').hidden = false;
  $('gift-label').removeAttribute('data-t');
  $('gift-label').textContent = t(`gift.${who}`, { n: amount });
  $('status').textContent = '';
}

$('gift-judge').onclick = () => gift(105, 'guest');
$('gift-friend').onclick = () => gift(21, 'friend');
fetch('/api/house', { headers: { 'X-Admin': key } })
  .then((r) => r.json())
  .then((b) => ($('float').textContent = b.balance == null ? t('stage.signin') : t('stage.house', { n: b.balance })));

// Curtains up (manual) and the live count of phones in, over SSE.
const post = (url) => fetch(url, { method: 'POST', headers: { 'X-Admin': key } }).then((r) => r.json());
$('curtains').onclick = () => post('/api/curtains');
$('newshow').onclick = () => confirm(t('stage.confirm')) && post('/api/new-show');
let last = null;
const apply = (s) => {
  last = s;
  const f = s.finale;
  if (f) {
    $('finale').hidden = !s.t0;
    $('goal').textContent = f.state === 'paid' ? `⚡ ${t('stage.paid', { n: f.total })}` : t('goal', { total: f.total, goal: f.goal });
    const lit = Math.min(7, Math.floor((7 * f.total) / f.goal));
    document.querySelectorAll('.lights i').forEach((el, i) => el.classList.toggle('on', i < lit));
    const left = Math.max(0, f.lastOrders - Math.floor(s.now / 1000));
    const p = f.payout || {};
    $('last-orders').textContent = f.state === 'open' ? t('last.in', { t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })
      : f.state === 'missed' ? t('stage.missed')
      : f.state === 'paid' && p.state === 'sent' ? t('paid.ln', { sats: sats(p.sats) })
      : f.state === 'paid' && p.state === 'sending' ? t('paid.sending')
      : f.state === 'paid' && p.state === 'failed' ? t('paid.failed') : '';
    document.body.classList.toggle('paid', f.state === 'paid');
  }
  $('phones').textContent = t(s.phones === 1 ? 'room.phone' : 'stage.phones', { n: s.phones });
  $('headline').textContent = t(s.t0 ? 'curtain.now' : 'stage.bring');
  $('curtains').disabled = !!s.t0;
};
onLang(() => last && apply(last));
// SSE, plus a 1-s poll because the tunnel holds SSE back.
new EventSource('/api/events').onmessage = (e) => apply(JSON.parse(e.data));
const poll = () => fetch('/api/show').then((r) => r.json()).then(apply).catch(() => {}).finally(() => setTimeout(poll, 1000));
poll();
