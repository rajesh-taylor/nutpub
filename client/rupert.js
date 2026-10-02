// Suit mode: Rupert, the Man from the Ministry of Fiat, tries the door with SuitCoin.
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { unlockAudio, trombone } from './sound.js';
import { t, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// Each attempt: what Rupert pays with, what he says (r1.says…), the door's answer (r1.no…) and one line
// for the room on what just happened (r1.why…). The words live in i18n.js.
const ATTEMPTS = [{ kind: 'suit', k: 'r1' }, { kind: 'relabel', k: 'r2' }, { kind: 'relabel', k: 'r3' }];
let n = 0;
let shown = null; // the attempt on screen, so the flags can say it again
let stamp = '';

function setButton() {
  const a = ATTEMPTS[Math.min(n, ATTEMPTS.length - 1)];
  $('try').textContent = t(`${a.k}.label`);
}
function render() {
  setButton();
  if (!shown) return;
  $('says').textContent = t(`${shown.k}.says`);
  $('verdict').textContent = shown.in ? t('rupert.in') : shown.done ? t(`${shown.k}.no`) : '';
  $('explain').textContent = shown.done && !shown.in ? t(`${shown.k}.why`) : '';
  $('why').textContent = stamp;
}
onLang(render);

async function attempt() {
  unlockAudio();
  const a = ATTEMPTS[Math.min(n, ATTEMPTS.length - 1)];
  $('try').disabled = true;
  shown = { k: a.k };
  stamp = '';
  render();
  try {
    // The door's 402: what it asks for.
    const ask = await fetch('/api/door?tier=ticket');
    decodePaymentRequest(ask.headers.get('X-Cashu')); // a real NUT-24 402, read like any wallet would

    // Rupert's printing press, then the retry with his "money" in X-Cashu.
    const { token, error } = await fetch(`/api/rupert/print?kind=${a.kind}`).then((r) => r.json());
    if (!token) throw new Error(error || 'the press jammed');
    const res = await fetch('/api/door?tier=ticket', { headers: { 'X-Cashu': token } });
    const body = await res.json();
    if (res.ok) {
      shown.in = true;
      render();
    } else {
      trombone();
      shown.done = true;
      stamp = `${res.status} ${body.error}: ${body.detail}`;
      render();
      document.body.classList.remove('refused');
      void document.body.offsetWidth;
      document.body.classList.add('refused');
    }
    n++;
  } catch (e) {
    stamp = e.message;
    render();
  }
  $('try').disabled = false;
  setButton();
}

$('try').onclick = attempt;
$('reset').onclick = () => {
  n = 0;
  shown = null;
  stamp = '';
  setButton();
  for (const id of ['says', 'verdict', 'explain', 'why']) $(id).textContent = '';
};
setButton();
