// Suit mode: Rupert, the Man from the Ministry of Fiat, tries the door with SuitCoin.
import { decodePaymentRequest } from '@cashu/cashu-ts';
import { unlockAudio, trombone } from './sound.js';

const $ = (id) => document.getElementById(id);
const host = (url) => { try { return new URL(url).host; } catch { return url; } };

// Each attempt: what Rupert pays with, what he says, the door's answer (with German below it),
// and one line for the room on what just happened.
const ATTEMPTS = [
  {
    kind: 'suit', label: 'Pay in SuitCoin',
    says: '“I’ll pay in SuitCoin. Printed in the City of London.”',
    no: 'Not money the NutPub takes, Sir.', de: 'Das nimmt der NutPub nicht, mein Herr.',
    why: 'Rupert printed this himself, on his own mint. Easy: whoever runs the press prints as much as he likes. The door only takes notes signed by the Kitty.',
  },
  {
    kind: 'relabel', label: 'Relabel it as Minibits',
    says: '“Fine. It says Minibits now.”',
    no: 'Still not allowed past the doormen.', de: 'Damit kommen Sie trotzdem nicht am Türsteher vorbei.',
    why: 'Same notes, new label. But every real note carries a DLEQ proof: maths only the Kitty’s private key can make. The door checks it on the spot, without phoning the mint. Changing the label can’t forge the signature.',
  },
  {
    kind: 'relabel', label: 'Try again, with confidence',
    says: '“Same notes. Fresh confidence.”',
    no: 'Sir, this is NutPub.', de: 'Mein Herr, das ist der NutPub.',
    why: 'Copying fiat is an edit in someone else’s database. Copying ecash means forging a signature. And the sats behind the Kitty’s notes are bitcoin, whose supply anyone running a node can check.',
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
  for (const id of ['says', 'asks', 'verdict', 'verdict-de', 'explain', 'why']) $(id).textContent = '';
};
setButton();
