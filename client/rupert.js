// Suit mode: Rupert, the Man from the Ministry of Fiat, tries the door with SuitCoin.
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { unlockAudio, trombone } from './sound.js';

const $ = (id) => document.getElementById(id);
const host = (url) => { try { return new URL(url).host; } catch { return url; } };

// Each attempt: what Rupert pays with, and what he says first.
const ATTEMPTS = [
  { kind: 'suit', label: 'Pay in SuitCoin', says: '“I’ll pay in SuitCoin. Printed it this morning.”' },
  { kind: 'relabel', label: 'Relabel it as Minibits', says: '“Fine. It says Minibits now.”' },
  { kind: 'relabel', label: 'Try again, with confidence', says: '“Same notes. Fresh confidence.”' },
];
const REFUSALS = ['Not money this NutPub takes!', 'Still not allowed past the doormen.', 'Sir, this is NutPub.'];
let n = 0;

function setButton() {
  const a = ATTEMPTS[Math.min(n, ATTEMPTS.length - 1)];
  $('try').textContent = a.label;
}

async function attempt() {
  unlockAudio();
  const a = ATTEMPTS[Math.min(n, ATTEMPTS.length - 1)];
  $('try').disabled = true;
  $('says').textContent = a.says;
  $('verdict').textContent = '';
  $('why').textContent = '';
  try {
    // The door's 402: what it asks for.
    const ask = await fetch('/api/door?tier=judge');
    const req = decodePaymentRequest(ask.headers.get('X-Cashu'));
    $('asks').textContent = `Door asks: ${req.amount} ${req.unit} from ${req.mints.map(host).join(', ')}`;

    // Rupert's printing press, then the retry with his "money" in X-Cashu.
    const { token, error } = await fetch(`/api/rupert/print?kind=${a.kind}`).then((r) => r.json());
    if (!token) throw new Error(error || 'the press jammed');
    const res = await fetch('/api/door?tier=judge', { headers: { 'X-Cashu': token } });
    const body = await res.json();
    if (res.ok) {
      $('verdict').textContent = 'He got in?! (That should never happen.)';
    } else {
      trombone();
      $('verdict').textContent = REFUSALS[Math.min(n, REFUSALS.length - 1)];
      $('why').textContent = `${res.status} ${body.error}: ${body.detail}`;
      document.body.classList.remove('refused');
      void document.body.offsetWidth;
      document.body.classList.add('refused');
    }
    n++;
  } catch (e) {
    $('why').textContent = e.message;
  }
  $('try').disabled = false;
  setButton();
}

$('try').onclick = attempt;
$('reset').onclick = () => { n = 0; setButton(); $('verdict').textContent = ''; $('why').textContent = ''; $('says').textContent = ''; };
setButton();
