// Cellar's 12 words (session 46): the artist's key, made here the first time (as Your takings does, night.js), and
// session 42's padlock and two sheets, so an artist backs the key up while setting up, before any gig. The same browser
// storage as Takings (the nutpub-takings wallet, nutpub-takings-checked), so both pages agree. Bringing the key back
// from typed words stays on Your takings, beside the money. No new encryption: wallet.js and words.js as they are.
// Session 54: the words' recovery key goes on record with the gig (client/recover.js), and once two words are checked
// this browser forgets the words: the paper is then the only copy, so a stolen browser can't win the gig back with them.
import { openWallet, wordsFor, forgetWords } from './wallet.js';

const CHECKED = 'nutpub-takings-checked';
const $ = (id) => document.getElementById(id);
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// The padlock, as on Your takings: open (an arm lifted, no fill) until the words are checked, then shut and filled.
function padlock(shut) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '26'); svg.setAttribute('height', '26'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: 4, y: 11, width: 16, height: 10, rx: 2, fill: shut ? '#d9953a' : 'none', stroke: '#d9953a', 'stroke-width': 2 })) body.setAttribute(k, v);
  const arm = document.createElementNS(ns, 'path');
  for (const [k, v] of Object.entries({ d: shut ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.6-1.7', fill: 'none', stroke: '#d9953a', 'stroke-width': 2 })) arm.setAttribute(k, v);
  svg.append(body, arm);
  return svg;
}
const button = (text, cls, onclick) => Object.assign(document.createElement('button'), { type: 'button', className: `btn ${cls}`, textContent: text, onclick });

export async function cellarWords(adminKey) {
  const [health, show] = await Promise.all([fetch('/api/health').then((r) => r.json()), fetch('/api/show').then((r) => r.json())]);
  const artist = await openWallet(health.mint.url, 'nutpub-takings');
  let pubkey = show.artistKey;
  if (!pubkey) { // a new stage: the key every payment locks to, made now, so tickets can sell before Takings is opened
    const { publicKeyHex } = await artist.coco.keyring.generateKeyPair();
    const r = await fetch('/api/admin/artist-key', { method: 'PUT', headers: { 'X-Admin': adminKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ pubkey: publicKeyHex }) });
    if (r.ok) pubkey = publicKeyHex;
  }

  const wordsNow = async () => wordsFor(pubkey && await artist.coco.keyring.getKeyPair(pubkey), pubkey);
  async function backup() {
    const pair = pubkey && await artist.coco.keyring.getKeyPair(pubkey);
    if (!pubkey) return 'none';
    if (!pair) return 'away';
    if (wordsFor(pair, pubkey)) return recall(CHECKED) ? 'shut' : 'open';
    if (recall(CHECKED)) return 'kept'; // checked, then forgotten
    if (pair.derivationIndex == null) return 'brought';
    return 'old';
  }
  // The words' key on record with the gig (once), then, if they're checked, forgotten here. Kept if the gig didn't answer.
  async function settle() {
    const w = await wordsNow();
    if (!w) return;
    const { recordWords } = await import('./recover.js');
    if ((await recordWords(w, adminKey)) && recall(CHECKED)) forgetWords();
  }
  let recovered = false;
  try { recovered = sessionStorage.getItem('nutpub-recovered') === '1'; } catch {}
  async function draw(note = '') {
    const kind = await backup();
    const line = $('words-line');
    const words = (...parts) => { const s = document.createElement('span'); s.append(...parts); return s; };
    const b = (t) => Object.assign(document.createElement('b'), { textContent: t });
    if (kind === 'open' && recovered) line.replaceChildren(padlock(false), words(b('Your old words open nothing now.'), ' Write these down: the next payments lock to them.'), button('Write down your 12 words', 'primary', showWords));
    else if (kind === 'open') line.replaceChildren(padlock(false), words(b('Not backed up yet.'), ' Only this browser can open your bitcoin.'), button('Write down your 12 words', 'primary', showWords));
    else if (kind === 'shut') line.replaceChildren(padlock(true), words(b('Backed up with your 12 words.'), note ? ` ${note}` : ''), button('Show my words', 'quiet', showWords));
    else if (kind === 'kept') line.replaceChildren(padlock(true), words(b('Backed up with your 12 words.'), ' This browser has forgotten them: your paper is the only copy.'));
    else if (kind === 'brought') line.replaceChildren(padlock(true), words(b('Backed up with your 12 words.')));
    else if (kind === 'old') line.replaceChildren(padlock(false), words('This stage was made before the 12 words: only this browser can open your bitcoin. Move it after each gig.'));
    else if (kind === 'away') {
      const a = Object.assign(document.createElement('a'), { className: 'btn quiet', href: '/takings', textContent: 'Your takings →' });
      line.replaceChildren(padlock(false), words('Your key is in another browser. Bring it here with your 12 words on Your takings.'), a);
    } else line.replaceChildren(words('Couldn’t make your key just now. Open Your takings once, or reload this page.'));
  }

  // Sheet 1, the words; sheet 2, two of them checked (picked at random each time), as on Your takings.
  let toCheck = [];
  async function showWords() {
    const list = ((await wordsNow()) || '').split(' ');
    if (list.length !== 12) return;
    $('words-list').replaceChildren(...list.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
    $('words-sheet').showModal();
  }
  $('words-sheet').addEventListener('close', () => $('words-list').replaceChildren()); // the words leave the page once the sheet is shut
  $('words-later').onclick = () => $('words-sheet').close();
  $('words-done').onclick = async () => {
    $('words-sheet').close();
    toCheck = (await import('./words.js')).twoToCheck();
    $('check-a-l').textContent = `Word ${toCheck[0]}`;
    $('check-b-l').textContent = `Word ${toCheck[1]}`;
    $('check-a').value = $('check-b').value = '';
    $('check-err').textContent = '';
    $('check-sheet').showModal();
  };
  $('check-again').onclick = () => { $('check-sheet').close(); showWords(); };
  $('check-form').onsubmit = async (e) => {
    e.preventDefault();
    const list = ((await wordsNow()) || '').split(' ');
    const wrong = toCheck.filter((at, i) => ($(i ? 'check-b' : 'check-a').value.trim().toLowerCase() !== list[at - 1]));
    if (wrong.length === 2) { $('check-err').textContent = `Words ${wrong[0]} and ${wrong[1]} aren't right. Look at your paper again.`; return; }
    if (wrong.length) { $('check-err').textContent = `Word ${wrong[0]} isn't right. Look at your paper again.`; return; }
    remember(CHECKED, '1');
    $('check-sheet').close();
    try { sessionStorage.removeItem('nutpub-recovered'); } catch {}
    recovered = false;
    await settle();
    await draw('Keep the paper somewhere safe.');
  };
  await settle();
  await draw();
}
