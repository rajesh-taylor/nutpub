// Page 3, Takings (/takings): the artist's and the bar's takings side by side, as on the design board. Each card
// opens its own wallet in this browser ('nutpub-takings' for the artist, 'nutpub-bar' for the bar), the same wallets
// as the artist's and the bar's own pages, so Collect and Pour sign with the key that lives here. The server only
// lists the locked payments and marks one collected when the mint says it's spent.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';

const $ = (id) => document.getElementById(id);
const n = (v) => Number(v || 0).toLocaleString('en-GB');
const sats = (v) => `${n(v)} sats`;

let key = null;
try { key = localStorage.getItem('nutpub-admin'); } catch {}
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

try { await api('GET', '/api/admin/drinks'); } catch { $('locked').hidden = false; throw new Error('signed out'); }
$('page').hidden = false;
const health = await fetch('/api/health').then((r) => r.json());
let info = await fetch('/api/show').then((r) => r.json());
const artist = await openWallet(health.mint.url, 'nutpub-takings');
const bar = await openWallet(health.mint.url, 'nutpub-bar');

// ---- The keys: each card says whether its key is in this browser, and can make one here (like its own page).
async function holds(wallet, pubkey) { return !!pubkey && !!(await wallet.coco.keyring.getKeyPair(pubkey)); }
async function keyLine(id, wallet, pubkey, who, path) {
  const here = await holds(wallet, pubkey);
  $(id).replaceChildren(here ? `This browser holds ${who}'s key.` : `${who}'s key is on another browser.`);
  if (here) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn quiet pour-btn';
  b.textContent = 'Make a new key here';
  b.onclick = async () => {
    if (!confirm(`Payments locked to the old key can only be collected where that key is. Make ${who}'s key here?`)) return;
    const { publicKeyHex } = await wallet.coco.keyring.generateKeyPair();
    await api('PUT', path, { pubkey: publicKeyHex });
    await refresh();
  };
  $(id).append(' ', b);
}

// ---- The numbers. The artist's lines add up everything locked to the artist; the bar's, the drinks it poured.
let state = { waiting: [], drinks: [], lastOrdersAt: null, pubkey: null };
const afterLastOrders = () => state.lastOrdersAt && Date.now() / 1000 > state.lastOrdersAt + 5;
async function refresh() {
  const [takings, locked, drinks] = await Promise.all([
    api('GET', '/api/admin/takings'), api('GET', '/api/admin/locked'), api('GET', '/api/admin/drinks'),
  ]);
  info = await fetch('/api/show').then((r) => r.json());
  state = { waiting: locked.waiting, drinks, lastOrdersAt: locked.lastOrdersAt, pubkey: locked.pubkey };
  const { show } = info;
  const all = (k) => (takings.locked[k]?.waiting || 0) + (takings.locked[k]?.collected || 0);
  const count = (k) => takings.locked[k]?.count || 0;
  const name = show.artist || 'The artist';
  $('artist-name').textContent = name;

  // Drinks: poured (the bar collected it), went to the artist (collected after last orders), or still waiting.
  const toArtist = drinks.filter((d) => d.collected_by === 'artist');
  const unpouredLate = afterLastOrders() ? drinks.filter((d) => !d.poured) : [];
  const poured = drinks.filter((d) => d.poured && d.collected_by !== 'artist');
  const drinkSum = [...toArtist, ...unpouredLate].reduce((s, d) => s + d.sats, 0);

  // Sold so far: what's sold since the last New night, however far ahead of the gig.
  const soldLine = (id, on, s = {}, cap) => {
    $(`r-${id}`).hidden = !on && !s.count;
    $(`v-${id}`).textContent = `${n(s.count)}${cap ? ` of ${n(cap)}` : ''} · ${sats(s.sats)}`;
  };
  soldLine('room', show.ticket.on, takings.sold.room, show.capacity);
  soldLine('online', show.stream.mode === 'ticket', takings.sold.home);

  $('l-tickets').textContent = `Tickets · ${n(count('ticket'))}`;
  $('v-tickets').textContent = n(all('ticket'));
  $('l-tips').textContent = `Tips and messages · ${n(count('tip'))}`;
  $('v-tips').textContent = n(all('tip'));
  $('l-home').textContent = `Watching at home · ${n(count('piece'))} payments`;
  $('v-home').textContent = n(all('piece'));
  $('l-drinks').textContent = `Drinks not poured by ${show.lastOrders || 'last orders'} · ${n(toArtist.length + unpouredLate.length)}`;
  $('v-drinks').textContent = n(drinkSum);
  $('v-artist-total').textContent = sats(all('ticket') + all('tip') + all('piece') + drinkSum);

  $('drinks').replaceChildren(...drinks.map((d) => {
    const row = document.createElement('div');
    row.className = 'line';
    const what = document.createElement('span');
    what.textContent = `Drink ${d.id}`;
    const right = document.createElement('span');
    if (d.collected_by === 'artist') { right.className = 'muted'; right.textContent = `Not poured · went to ${name}`; }
    else if (d.poured) {
      right.append(`Poured · ${n(d.sats)} `);
      right.append(pourButton(d, 'Pour again'));
    } else right.append(pourButton(d, 'Pour'));
    row.append(what, right);
    return row;
  }));
  if (!drinks.length) $('drinks').replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: 'No drinks yet: each ticket with the free drink adds one here.' }));
  $('v-bar-total').textContent = sats(poured.reduce((s, d) => s + d.sats, 0));

  const ticket = show.ticket.price || 0;
  const drink = show.drink.mode === 'artist' ? show.drink.price || 0 : 0;
  $('w-ticket').textContent = `A ticket · ${n(ticket + drink)}`;
  $('w-ticket-text').textContent = drink
    ? `${n(ticket)} locked to ${name}'s key, ${n(drink)} locked to the bar's key for the first drink.`
    : `${n(ticket)} locked to ${name}'s key. The free drink is off.`;

  // Tonight's lines start at New night; Collect takes everything still waiting, from any night.
  $('artist-waiting').textContent = `Waiting to collect, all nights: ${sats(locked.totals.here.sats)}`;
  $('artist-held').textContent = `Collected into this browser: ${sats(await artist.balance())}`;
  $('bar-held').textContent = `Collected into this browser: ${sats(await bar.balance())}`;
  await keyLine('artist-key', artist, locked.pubkey, name, '/api/admin/artist-key');
  await keyLine('bar-key', bar, info.barKey, 'The bar', '/api/admin/bar-key');
}

function pourButton(d, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn quiet pour-btn';
  b.textContent = label;
  b.onclick = () => pour(d.id);
  return b;
}

// ---- Collect: everything locked to the artist's key here, plus (after last orders) drinks nobody poured.
$('artist-collect').onclick = async () => {
  $('artist-collect').disabled = true;
  $('artist-status').textContent = 'Collecting…';
  try {
    const mine = [];
    for (const p of state.waiting) if (await artist.coco.keyring.getKeyPair(p.pubkey)) mine.push(p);
    const before = await artist.balance();
    await artist.collectAll(mine.map((p) => p.token), (done, of) => { $('artist-status').textContent = `Collecting… ${done} of ${of}`; }); // the mint's word below counts
    if (afterLastOrders()) {
      for (const p of state.waiting.filter((x) => x.kind === 'drink' && x.pubkey !== state.pubkey)) {
        try { await artist.collect(p.token, p.pubkey, state.pubkey); mine.push(p); } catch {}
      }
    }
    // Ten at a time: each one is a D1 read and a call to the mint, and one Worker request on the free plan allows 50.
    const collected = [];
    const notYet = [];
    for (let i = 0; i < mine.length; i += 10) {
      const part = await api('POST', '/api/admin/locked/collected', { ids: mine.slice(i, i + 10).map((p) => p.id), by: 'artist' });
      collected.push(...part.collected);
      notYet.push(...part.notYet);
    }
    const got = mine.filter((p) => collected.includes(p.id)).reduce((s, p) => s + p.sats, 0);
    const fee = Math.max(0, got - ((await artist.balance()) - before));
    const kept = fee ? ` The mint kept ${sats(fee)} as its fee.` : '';
    $('artist-status').textContent = notYet.length ? `Collected ${sats(got)}.${kept} ${notYet.length} didn't go through: try again.` : `Collected ${sats(got)}.${kept}`;
  } catch (e) { $('artist-status').textContent = e.message; }
  $('artist-collect').disabled = false;
  refresh().catch(() => {});
};

// ---- Pour: the bar collects the drink with its key. A second pour finds it spent at the mint.
async function pour(id) {
  unlockAudio();
  $('bar-status').textContent = 'Pouring…';
  try {
    const d = await api('GET', `/api/admin/drinks/${id}`);
    if (!(await bar.coco.keyring.getKeyPair(d.pubkey))) throw new Error('This drink is locked to a bar key held on another browser.');
    let spent = d.poured;
    if (!spent) {
      try { await bar.collect(d.token, d.pubkey); } catch (e) { if (!/spent/i.test(e.message)) throw e; spent = true; }
      await api('POST', '/api/admin/locked/collected', { ids: [d.locked], by: 'bar' });
    }
    if (spent) {
      trombone();
      $('poured-line').textContent = 'Already poured, mate';
      $('poured-note').textContent = `Drink ${id} again. The mint says it's spent (NUT-07): one drink per ticket.`;
      $('bar-status').textContent = '';
    } else {
      clink();
      $('bar-status').textContent = `Drink ${id} poured: ${sats(d.sats)} to the bar.`;
    }
  } catch (e) { $('bar-status').textContent = e.message; }
  refresh().catch(() => {});
}

// ---- Send to another wallet: everything collected in this browser, as one token for any Cashu wallet.
// The token is the money once it has left the wallet: it stays here, through a reload, until the artist says it landed.
const kept = (id) => `nutpub-sent-${id}`;
function keepToken(id, token) {
  try { localStorage.setItem(kept(id), token); } catch {}
  if ($(`${id}-done`)) $(`${id}-done`).hidden = false;
}
function showKept(id) {
  let token = null;
  try { token = localStorage.getItem(kept(id)); } catch {}
  if (!token || !$(`${id}-done`)) return;
  $(id).value = token;
  $(id).hidden = false;
  $(`${id}-done`).hidden = false;
}
$('artist-token-clear').onclick = () => {
  if (!confirm('Is it safely in your other wallet? Once removed it can\'t be shown again.')) return;
  try { localStorage.removeItem(kept('artist-token')); } catch {}
  $('artist-token').hidden = true;
  $('artist-token').value = '';
  $('artist-token-done').hidden = true;
};
showKept('artist-token');
function sendHome(wallet, tokenId, statusId) {
  return async () => {
    try {
      const out = await wallet.takeHome();
      if (!out) { $(statusId).textContent = 'Nothing collected here yet.'; return; }
      $(tokenId).value = out.token;
      $(tokenId).hidden = false;
      keepToken(tokenId, out.token);
      await navigator.clipboard?.writeText(out.token).catch(() => {});
      $(statusId).textContent = `${sats(out.amount)} as one token: copied. Paste it into any Cashu wallet.`;
    } catch (e) { $(statusId).textContent = e.message; }
    refresh().catch(() => {});
  };
}
$('artist-home').onclick = sendHome(artist, 'artist-token', 'artist-status');
$('bar-home').onclick = sendHome(bar, 'bar-token', 'bar-status');

await refresh();
setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60_000); // each refresh is 4 requests
