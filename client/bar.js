// The bar page: the bar's phone camera opens /bar.html#<pint token>. Tap to pour.
import { unlockAudio, trombone, clink } from './sound.js';

const $ = (id) => document.getElementById(id);
const token = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, '', location.pathname); // the voucher stays out of the address bar

const LINES = {
  already_poured: ['Already poured, mate.', 'Copy it all you like. It only pours once.'],
  not_a_pint: ['That’s not a pint for this bar.', ''],
  wrong_mint: ['Not NutPub Mint ecash.', ''],
};

if (!token.startsWith('cashu')) {
  $('pour').hidden = true;
  $('verdict').textContent = 'Scan a pint QR from a fan’s phone.';
}

$('pour').onclick = async () => {
  unlockAudio();
  $('pour').disabled = true;
  $('verdict').textContent = 'Pouring…';
  try {
    const res = await fetch('/api/bar/pour', { method: 'POST', body: token });
    const body = await res.json();
    if (res.ok) {
      clink();
      document.body.classList.add('poured');
      $('verdict').textContent = '🍺 Poured!';
      $('sub').textContent = `${body.poured} sats, signed by the bar’s key. The fan’s phone is lighting up.`;
    } else {
      trombone();
      const [line, sub] = LINES[body.error] || [body.detail || body.error, ''];
      $('verdict').textContent = line;
      $('sub').textContent = sub;
    }
  } catch (e) {
    $('verdict').textContent = e.message;
  }
  $('pour').hidden = true;
};
