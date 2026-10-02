// The KYC Kebab Shack: Rupert's walk home. Read-only, nothing is sent anywhere. Every "Accept all" costs him
// a topping off his Doner Credit Score™; "Reject all" runs away from your finger.
import { unlockAudio, trombone, clink } from './sound.js';
import { t, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const TOPPINGS = ['chilli', 'garlic', 'salad', 'onions', 'tomato', 'lamb', 'pitta'];
const STEPS = 7; // one topping per step
let step = -1;
let dodges = 0;

let gone = 0; // toppings lost so far
const score = () => Math.max(0, 850 - Math.round((850 * gone) / STEPS));

function render() {
  $('toppings').innerHTML = TOPPINGS.map((k, i) => `<li class="${i < gone ? 'gone' : ''}">${t(`kebab.top.${k}`)}</li>`).join('');
  if (step < 0 || step >= STEPS) return;
  $('step-n').textContent = t('kebab.step', { n: step + 1, of: STEPS });
  $('step-h').textContent = t(`kebab.s${step + 1}.h`);
  $('step-field').textContent = t(`kebab.s${step + 1}.field`);
  $('step-says').textContent = t(`kebab.s${step + 1}.says`);
  $('reject').textContent = t(dodges >= 3 ? 'kebab.reject.paid' : 'kebab.reject');
}
function next() {
  step++;
  dodges = 0;
  $('reject').style.transform = '';
  if (step >= STEPS) {
    $('step').hidden = true;
    $('end').hidden = false;
    trombone();
  }
  render();
}

// "Reject all" won't be pressed: it moves away as soon as a finger (or a mouse) comes near.
function dodge(e) {
  e.preventDefault();
  dodges++;
  const box = $('step').getBoundingClientRect();
  const b = $('reject').getBoundingClientRect();
  const jump = (room) => (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * Math.max(0, room - 50));
  const x = jump((box.width - b.width) / 2);
  const y = -Math.abs(jump(box.height - b.height - 30));
  $('reject').style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  if (dodges === 3) render();
}

$('start').onclick = () => {
  unlockAudio();
  $('voucher').hidden = true;
  $('step').hidden = false;
  next();
};
$('accept').onclick = () => {
  unlockAudio();
  gone++;
  $('score').textContent = score();
  $('score-box').classList.toggle('low', gone > 3);
  clink();
  next();
};
$('reject').addEventListener('pointerdown', dodge);
$('reject').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') dodge(e); });
$('reject').addEventListener('click', (e) => { e.preventDefault(); dodge(e); });
onLang(render);
render();
