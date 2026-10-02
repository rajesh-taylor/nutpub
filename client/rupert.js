// Suit mode: Rupert, the Man from the Ministry of Fiat, tries the door with SuitCoin.
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { unlockAudio, trombone } from './sound.js';
import { t, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// Suit mode is the costume: pinstripes that bulge outwards round a pot belly, braces, buttons down the middle.
function suit() {
  const W = 400, H = 800, cx = W / 2;
  const bulge = (x) => {
    const out = (x - cx) * 0.24; // how far this line is pushed out at the widest point of the belly
    return `M${x} 0 V${H * 0.5} C${x} ${H * 0.64} ${x + out} ${H * 0.68} ${x + out} ${H * 0.8} S${x} ${H * 0.96} ${x} ${H}`;
  };
  let stripes = '';
  for (let x = 4; x < W; x += 14) stripes += `<path d="${bulge(x)}"/>`;
  let buttons = '';
  for (let y = 190; y < H; y += 92) buttons += `<circle cx="${cx}" cy="${y}" r="4.5"/>`;
  document.body.insertAdjacentHTML('afterbegin', `<svg class="suit" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <g class="stripes">${stripes}</g>
    <path class="shirt" d="M${cx - 16} 150 L${cx} 128 L${cx + 16} 150 V${H} H${cx - 16} Z"/>
    <g class="buttons">${buttons}</g>
    <g class="braces"><path d="${bulge(cx - 74)}"/><path d="${bulge(cx + 74)}"/></g>
  </svg>`);
}
suit();

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
