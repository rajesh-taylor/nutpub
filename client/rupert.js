// Suit mode: Rupert, the Man from the Ministry of Fiat, tries the door with SuitCoin.
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { unlockAudio, trombone } from './sound.js';

const $ = (id) => document.getElementById(id);

// Each attempt: what Rupert pays with, what he says, the door's answer (with German below it),
// and one line for the room on what just happened.
const ATTEMPTS = [
  {
    kind: 'suit', label: 'Pay in SuitCoin',
    says: '“I’ll pay in SuitCoin. Printed in the City of London.”',
    no: 'Not money the NutPub takes, Sir.', de: 'Das nimmt der NutPub nicht, mein Herr.',
    why: 'He printed his own money. The door only takes NutPub Mint money.',
  },
  {
    kind: 'relabel', label: 'Pretend it’s NutPub money',
    says: '“Fine. It’s NutPub money now.”',
    no: 'Still not allowed past the doormen.', de: 'Damit kommen Sie trotzdem nicht am Türsteher vorbei.',
    why: 'New label, fake signature. The door checks the maths on the spot.',
  },
  {
    kind: 'relabel', label: 'Try again, with confidence',
    says: '“Same notes. Fresh confidence.”',
    no: 'Sir, this is NutPub.', de: 'Mein Herr, das ist der NutPub.',
    why: 'You can relabel money. You can’t fake the signature.',
  },
];
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
  for (const id of ['verdict', 'verdict-de', 'explain', 'why']) $(id).textContent = '';
  try {
    // The door's 402: what it asks for.
    const ask = await fetch('/api/door?tier=judge');
    decodePaymentRequest(ask.headers.get('X-Cashu')); // a real NUT-24 402, read like any wallet would

    // Rupert's printing press, then the retry with his "money" in X-Cashu.
    const { token, error } = await fetch(`/api/rupert/print?kind=${a.kind}`).then((r) => r.json());
    if (!token) throw new Error(error || 'the press jammed');
    const res = await fetch('/api/door?tier=judge', { headers: { 'X-Cashu': token } });
    const body = await res.json();
    if (res.ok) {
      $('verdict').textContent = 'He got in?! (That should never happen.)';
    } else {
      trombone();
      $('verdict').textContent = a.no;
      $('verdict-de').textContent = a.de;
      $('explain').textContent = a.why;
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
$('reset').onclick = () => {
  n = 0;
  setButton();
  for (const id of ['says', 'verdict', 'verdict-de', 'explain', 'why']) $(id).textContent = '';
};
setButton();
