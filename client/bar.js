// The bar page: the bar's phone camera opens /bar.html#<pint token>. Tap to pour.
import { unlockAudio, trombone, clink } from './sound.js';
import { t, has, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const token = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, '', location.pathname); // the voucher stays out of the address bar

// What the bar says, kept as keys so the flags can say it again in the other language.
let said = ['', '', {}];
function verdict(line, sub = '', vars = {}) {
  said = [line, sub, vars];
  $('verdict').textContent = line ? t(line, vars) : '';
  $('sub').textContent = sub ? t(sub, vars) : '';
}
onLang(() => verdict(...said));
const LINES = {
  already_poured: ['already_poured', 'already_poured.sub'],
  not_a_pint: ['not_a_pint', ''],
  wrong_mint: ['bar.wrong_mint', ''],
};

if (!token.startsWith('cashu')) {
  $('pour').hidden = true;
  verdict('bar.scan');
}

$('pour').onclick = async () => {
  unlockAudio();
  $('pour').disabled = true;
  verdict('bar.pouring');
  try {
    const res = await fetch('/api/bar/pour', { method: 'POST', body: token });
    const body = await res.json();
    if (res.ok) {
      clink();
      document.body.classList.add('poured');
      verdict('bar.poured', 'bar.poured.sub', { n: body.poured });
    } else {
      trombone();
      const [line, sub] = LINES[body.error] || [has(body.error) ? body.error : body.detail || body.error, ''];
      verdict(line, sub);
    }
  } catch (e) {
    verdict(e.message);
  }
  $('pour').hidden = true;
};
