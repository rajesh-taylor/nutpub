// The takings page (/takings.html#k=<admin key>): the artist's key and the artist's payments.
// Every payment is locked to a key made here, in this browser's own Coco wallet (IndexedDB 'nutpub-takings'), whose
// public half alone goes to the server. Collect opens the locked payments into this wallet; the server marks one
// collected only when the mint says it's spent.
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
const sats = (n) => `${Number(n).toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;
const payments = (n) => `${n} payment${n === 1 ? '' : 's'}`;
const say = (text) => { $('status').textContent = text || ''; };

// The admin key comes after the # (never in a server log), then is kept on this computer only, as on the setup page.
let key = new URLSearchParams(location.hash.slice(1)).get('k');
try {
  if (key) localStorage.setItem('nutpub-admin', key);
  else key = localStorage.getItem('nutpub-admin');
} catch {}
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

let health, show;
try {
  await api('GET', '/api/admin/locked'); // the key must work, or the page stays locked
  [health, { show }] = await Promise.all([fetch('/api/health').then((r) => r.json()), api('GET', '/api/show')]);
} catch (err) {
  $('locked').hidden = false;
  if (err.status !== 403) $('locked').textContent = `Couldn't reach the server: ${err.message}`;
  throw err;
}
const name = show.artist || 'The artist';
$('who').textContent = document.title = `${name}’s takings`;
const wallet = await openWallet(health.mint.url, 'nutpub-takings');
const { coco } = wallet;

// ---- The key. First open: made here (Coco's keyring, so Coco can sign what's locked to it) and its public half sent.
let holds = false;
async function keyState() {
  let { pubkey } = await api('GET', '/api/admin/locked');
  if (!pubkey) pubkey = await newKey();
  holds = !!(await coco.keyring.getKeyPair(pubkey));
  $('key-note').textContent = holds
    ? `This browser holds ${name}’s key. Clearing its data loses anything not collected. Collect often.`
    : `${name}’s key is on another browser.`;
  $('new-key').hidden = holds;
}
async function newKey() {
  const { publicKeyHex } = await coco.keyring.generateKeyPair();
  return (await api('PUT', '/api/admin/artist-key', { pubkey: publicKeyHex })).pubkey;
}
$('new-key').onclick = async () => {
  if (!confirm('Payments locked to the old key can only be collected where that key is. Make a new key here?')) return;
  try { await newKey(); await keyState(); await refresh(); say('New key made. Payments are locked to it from now on.'); }
  catch (e) { say(e.message); }
};

// Last orders, Unix seconds (from the server): the mint's clock decides, this is only when to try.
let lastOrders = null;
const afterLastOrders = () => lastOrders && Date.now() / 1000 > lastOrders + 5;

// ---- What's waiting (locked to the key here), what this browser has collected, and the night by kind.
async function refresh() {
  const [{ totals, lastOrdersAt: lo }, takings] = await Promise.all([api('GET', '/api/admin/locked'), api('GET', '/api/admin/takings')]);
  lastOrders = lo;
  $('waiting').textContent = `${sats(totals.here.sats)} (${payments(totals.here.count)})`;
  $('collected').textContent = sats(await wallet.balance());
  $('collect').disabled = !holds;
  const old = totals.all.count - totals.here.count;
  $('elsewhere').hidden = !old;
  $('elsewhere').textContent = `Also ${sats(totals.all.sats - totals.here.sats)} (${payments(old)}) locked to an old key: they collect only where that key is.`;
  const { piece, tip, ticket } = takings.locked;
  const all = (k) => sats(k.waiting + k.collected);
  $('kinds').textContent = `Tonight: tickets ${all(ticket)}, tips ${all(tip)}, watching at home ${all(piece)}.`;
  const unpoured = (await api('GET', '/api/admin/locked')).waiting.filter((p) => p.kind === 'drink');
  $('drinks-note').textContent = unpoured.length
    ? `Drinks not poured yet: ${sats(unpoured.reduce((s, p) => s + p.sats, 0))}. ${afterLastOrders() ? 'Last orders has passed: Collect takes them.' : `Yours if still unpoured at ${show.lastOrders || 'last orders'}.`}`
    : '';
  $('before').hidden = !takings.before;
  $('before').textContent = `Before Sat 10 (swapped): ${sats(takings.before)}, in the server’s own wallet.`;
}

// ---- Collect: open each payment into this wallet, then let the server check with the mint which ones are spent.
$('collect').onclick = async () => {
  $('collect').disabled = true;
  say('Collecting…');
  try {
    const { waiting, pubkey } = await api('GET', '/api/admin/locked');
    lastOrders = (await api('GET', '/api/admin/locked')).lastOrdersAt;
    const mine = [];
    for (const p of waiting) if (await coco.keyring.getKeyPair(p.pubkey)) mine.push(p);
    // After last orders, a drink nobody poured opens for the artist's key (its NUT-11 refund path).
    const drinks = afterLastOrders() ? waiting.filter((p) => p.kind === 'drink' && p.pubkey !== pubkey) : [];
    for (const p of mine) {
      try { await wallet.collect(p.token, p.pubkey); } catch {} // the mint's answer below is what counts
    }
    for (const p of drinks) {
      try { await wallet.collect(p.token, p.pubkey, pubkey); mine.push(p); } catch {}
    }
    const { collected, notYet } = await api('POST', '/api/admin/locked/collected', { ids: mine.map((p) => p.id), by: 'artist' });
    const got = mine.filter((p) => collected.includes(p.id)).reduce((s, p) => s + p.sats, 0);
    say(notYet.length ? `Collected ${sats(got)}. ${payments(notYet.length)} didn't go through: try again.` : `Collected ${sats(got)}.`);
  } catch (e) { say(e.message); }
  await refresh().catch(() => {});
};

// ---- Send to my Lightning wallet (NUT-05 melt to the artist's Lightning address). The test mint's Lightning is
// pretend, so here it stays off. Paying out from a real mint isn't built yet (BACKLOG).
if (health.mint.test) $('send-note').textContent = 'Test mint: its Lightning is pretend, so it can’t pay a real wallet.';
else $('send').parentElement.parentElement.hidden = true;

await keyState();
await refresh();
$('page').hidden = false;
wallet.on('proofs:saved', () => refresh().catch(() => {}));
setInterval(() => refresh().catch(() => {}), 10_000); // Waiting goes up as the show plays

// ---- Send to another wallet: everything collected here, as one Cashu token for any wallet.
$('home').onclick = async () => {
  try {
    const out = await wallet.takeHome();
    if (!out) return say('Nothing collected here yet.');
    $('home-token').value = out.token;
    $('home-token').hidden = false;
    await navigator.clipboard?.writeText(out.token).catch(() => {});
    say(`${sats(out.amount)} as one token: copied. Paste it into any Cashu wallet.`);
  } catch (e) { say(e.message); }
  refresh().catch(() => {});
};

// Inside page 3 (Takings): compact, without its own title and links.
if (top !== self) document.body.classList.add('framed');
