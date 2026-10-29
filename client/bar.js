// The bar's page (/bar.html#k=<admin key>, or #d=<drink> from a phone's QR): the bar's key and its drinks. The key
// is made here, in this browser's own wallet ('nutpub-bar'); only its public half goes to the server. Pour collects a
// drink with that key. The server marks it poured only when the mint says it's spent, so a second pour of the
// same QR finds it spent: "Already poured, mate".
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';

const $ = (id) => document.getElementById(id);
const sats = (n) => `${Number(n).toLocaleString('en-GB')} sats`;
const say = (text) => { $('status').textContent = text || ''; };

const hash = new URLSearchParams(location.hash.slice(1));
let key = hash.get('k');
try {
  if (key) localStorage.setItem('nutpub-admin', key);
  else key = localStorage.getItem('nutpub-admin');
} catch {}
let drinkId = Number(hash.get('d')) || null;
if (location.hash) history.replaceState(null, '', location.pathname);

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'X-Admin': key || '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.detail || data.error || r.statusText), { status: r.status });
  return data;
}

let health;
try {
  await api('GET', '/api/admin/drinks');
  health = await fetch('/api/health').then((r) => r.json());
} catch (err) {
  $('locked').hidden = false;
  if (err.status !== 403) $('locked').textContent = `Couldn't reach the server: ${err.message}`;
  throw err;
}
const wallet = await openWallet(health.mint.url, 'nutpub-bar');
const { coco } = wallet;

// ---- The bar's key: made here on first open, its public half sent. A key made elsewhere stays there.
let { barKey } = await fetch('/api/show').then((r) => r.json());
if (!barKey || !(await coco.keyring.getKeyPair(barKey))) {
  if (!barKey || confirm('The bar’s key is on another browser. Make a new one here? Drinks locked to the old one can only be poured there.')) {
    const { publicKeyHex } = await coco.keyring.generateKeyPair();
    barKey = (await api('PUT', '/api/admin/bar-key', { pubkey: publicKeyHex })).pubkey;
  }
}
const holds = !!(await coco.keyring.getKeyPair(barKey));
$('key-note').textContent = holds ? 'This browser holds the bar’s key.' : 'The bar’s key is on another browser.';

// ---- The night's drinks, and one Pour button each (in a real bar the camera scans the phone's QR instead).
async function refresh() {
  const drinks = await api('GET', '/api/admin/drinks');
  const poured = drinks.filter((d) => d.poured);
  $('poured').textContent = `${poured.length} · ${sats(poured.reduce((s, d) => s + d.sats, 0))}`;
  $('held').textContent = sats(await wallet.balance());
  $('drinks').replaceChildren(...drinks.map((d) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn quiet';
    b.textContent = d.poured ? 'Pour again' : 'Pour';
    b.onclick = () => pour(d.id);
    li.append(`Drink ${d.id} · ${d.poured ? 'poured' : 'waiting'} `, b);
    return li;
  }));
}

// ---- Pour: collect it with the bar's key. Spent already: someone poured it (or copied the QR).
function pint(line, sub, ok) {
  $('pint-line').textContent = line;
  $('pint-sub').textContent = sub;
  $('pint-screen').classList.toggle('again', !ok);
  $('pint-screen').hidden = false;
}
async function pour(id) {
  unlockAudio();
  say('Pouring…');
  try {
    const d = await api('GET', `/api/admin/drinks/${id}`);
    if (!(await coco.keyring.getKeyPair(d.pubkey))) throw new Error('This drink is locked to a bar key held on another browser.');
    let spent = d.poured;
    if (!spent) {
      try { await wallet.collect(d.token, d.pubkey); } catch (e) { if (!/spent/i.test(e.message)) throw e; spent = true; }
      await api('POST', '/api/admin/locked/collected', { ids: [d.locked] });
    }
    if (spent) { trombone(); pint('Already poured, mate.', 'Copy it all you like. It only pours once.', false); }
    else { clink(); pint('Poured. Cheers!', `${sats(d.sats)} to the bar.`, true); }
    say('');
  } catch (e) { say(e.message); }
  await refresh().catch(() => {});
}
$('pint-back').onclick = () => { $('pint-screen').hidden = true; };
$('pour').onclick = () => pour(drinkId);

// ---- Send to another wallet: the bar's sats as one Cashu token, for any wallet.
$('home').onclick = async () => {
  try {
    const out = await wallet.takeHome();
    if (!out) return say('Nothing here to send yet.');
    $('home-token').value = out.token;
    $('home-token').hidden = false;
    await navigator.clipboard?.writeText(out.token).catch(() => {});
    say(`${sats(out.amount)} as one token: copied. Paste it into any Cashu wallet.`);
  } catch (e) { say(e.message); }
  refresh().catch(() => {});
};

if (drinkId) {
  $('one').hidden = false;
  $('one-what').textContent = `Drink ${drinkId}, from a ticket's QR.`;
}
await refresh();
$('page').hidden = false;
setInterval(() => refresh().catch(() => {}), 5000);
