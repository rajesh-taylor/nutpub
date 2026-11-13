// Page 3, Takings (/takings), design C (13 Nov): what came in, by bitcoin and by card, and one Move button. Each card
// opens its own wallet in this browser ('nutpub-takings' for the artist, 'nutpub-bar' for the bar), the same wallets
// as the artist's and the bar's own pages, so Collect and Pour sign with the key that lives here. The server only
// lists the locked payments and marks one collected when the mint says it's spent.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';
import { money } from '../server/money.js';

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

// ---- The artist's key: made here, without a word, the first time (the server has none). Only when the server's key
// is in another browser does the page say so, in plain words, with a way to start again here.
async function holds(wallet, pubkey) { return !!pubkey && !!(await wallet.coco.keyring.getKeyPair(pubkey)); }
async function artistKeyHere(pubkey) {
  if (!pubkey) {
    const { publicKeyHex } = await artist.coco.keyring.generateKeyPair();
    await api('PUT', '/api/admin/artist-key', { pubkey: publicKeyHex });
    return publicKeyHex;
  }
  const here = await holds(artist, pubkey);
  $('key-warn').hidden = here;
  if (!here) {
    $('key-warn').replaceChildren('Your bitcoin is locked to another web browser: open Takings there to move it. ');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn quiet';
    b.textContent = 'Use this browser from now on';
    b.onclick = async () => {
      if (!confirm('Money already locked to the other browser can only be moved from there. Use this browser for new payments?')) return;
      const { publicKeyHex } = await artist.coco.keyring.generateKeyPair();
      await api('PUT', '/api/admin/artist-key', { pubkey: publicKeyHex });
      await refresh();
    };
    $('key-warn').append(b);
  }
  return pubkey;
}
async function keyLine(id, wallet, pubkey, who, path) { // the bar's card (hidden until the first drink returns)
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

// ---- Money on the page: sats first, or £ / $ / € at today's rate (the same switch and memory as the gig page's).
const SYMBOL = { gbp: '£', usd: '$', eur: '€' };
let unit = 'btc';
try { unit = localStorage.getItem('nutpub-unit') || 'btc'; } catch {}
let rate = null;
const fiatOn = () => !!rate?.[unit] && !!SYMBOL[unit];
const fig = (v) => (fiatOn() ? money(v, rate[unit], SYMBOL[unit]) : n(v));
function drawUnit() {
  for (const b of $('unit').querySelectorAll('button')) {
    b.disabled = b.dataset.unit !== 'btc' && !rate?.[b.dataset.unit];
    b.setAttribute('aria-pressed', String(b.dataset.unit === (fiatOn() ? unit : 'btc')));
  }
  $('stale').hidden = !(fiatOn() && rate?.stale);
  $('stale').textContent = 'Rough: today’s rate couldn’t be fetched.';
}
$('unit').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  unit = b.dataset.unit;
  try { localStorage.setItem('nutpub-unit', unit); } catch {}
  drawUnit();
  paint();
};
fetch('/api/rate').then((r) => r.json()).then((r) => { rate = r; drawUnit(); paint(); }).catch(() => drawUnit());

// ---- The numbers. Everything locked to the artist since the gig began, by kind; Move takes all that's waiting.
let state = { waiting: [], drinks: [], lastOrdersAt: null, pubkey: null };
let sums = null; // what paint() draws
const afterLastOrders = () => state.lastOrdersAt && Date.now() / 1000 > state.lastOrdersAt + 5;
const shortDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '');
async function refresh() {
  const [takings, locked, drinks] = await Promise.all([
    api('GET', '/api/admin/takings'), api('GET', '/api/admin/locked'), api('GET', '/api/admin/drinks'),
  ]);
  info = await fetch('/api/show').then((r) => r.json());
  const pubkey = await artistKeyHere(locked.pubkey);
  state = { waiting: locked.waiting, drinks, lastOrdersAt: locked.lastOrdersAt, pubkey };
  const { show } = info;
  const all = (k) => (takings.locked[k]?.waiting || 0) + (takings.locked[k]?.collected || 0);
  const count = (k) => takings.locked[k]?.count || 0;
  const name = show.artist || 'The artist';
  $('gig-line').textContent = [name, shortDay(show.date), (show.venue || '').split(',')[0].trim()].filter(Boolean).join(' · ');

  // Drinks: poured (the bar's), or after last orders the artist's (collected, or still waiting).
  const toArtist = drinks.filter((d) => d.collected_by === 'artist');
  const unpouredLate = afterLastOrders() ? drinks.filter((d) => !d.poured) : [];
  const poured = drinks.filter((d) => d.poured && d.collected_by !== 'artist');
  const drinkSum = [...toArtist, ...unpouredLate].reduce((s, d) => s + d.sats, 0);
  const drinkOn = show.drink?.mode === 'artist' || drinks.length > 0;
  const zaps = takings.nutzaps?.count || 0;
  const came = all('ticket') + all('tip') + all('piece') + drinkSum;
  sums = {
    tickets: all('ticket'), ticketsN: count('ticket'), tips: all('tip'), tipsN: count('tip'), zaps, home: all('piece'),
    drinks: drinkSum, drinksN: toArtist.length + unpouredLate.length, drinkOn, came,
    fee: Math.round((came * (takings.feePercent ?? 5)) / 100), feePercent: takings.feePercent ?? 5,
    waiting: locked.totals.here.sats, held: await artist.balance(), stream: show.stream?.mode,
  };
  paint();

  // The bar's card (hidden): its drinks, Pour and its key, as before.
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
  $('bar-held').textContent = `Collected into this browser: ${sats(await bar.balance())}`;
  import('./artist-nostr.js').then(({ nutzapsOn }) => nutzapsOn(api, pubkey)).catch(() => {}); // Nutzaps always on
  await keyLine('bar-key', bar, info.barKey, 'The bar', '/api/admin/bar-key');
}

// The figures, in sats or the chosen money. The big number is what's the artist's: the 5% isn't taken yet (it needs
// each payment split as it's paid), so it's shown as its own line and not taken off.
function paint() {
  if (!sums) return;
  const s = sums;
  $('big').replaceChildren(fig(s.came), ...(fiatOn() ? [] : [' ', Object.assign(document.createElement('small'), { textContent: 'sats' })]));
  $('came').textContent = `Came in · ${fig(s.came)} · The NutPub's ${s.feePercent}% · (${fig(s.fee)}), not taken on the test mint`;
  $('v-tickets').textContent = fig(s.tickets);
  $('s-tickets').textContent = `${n(s.ticketsN)} sold`;
  $('v-tips').textContent = fig(s.tips);
  $('s-tips').textContent = `${n(s.tipsN)} tip${s.tipsN === 1 ? '' : 's'}${s.zaps ? ` · ${n(s.zaps)} Nutzap${s.zaps === 1 ? '' : 's'}` : ''}`;
  $('v-home').textContent = fig(s.home);
  $('s-home').textContent = s.stream === 'ticket' ? 'Online tickets' : s.stream === 'free' ? 'Free to watch' : 'Pay as you watch';
  $('t-drinks').classList.toggle('later', !s.drinkOn);
  $('v-drinks').textContent = s.drinkOn ? fig(s.drinks) : '—';
  $('s-drinks').textContent = s.drinkOn ? `${n(s.drinksN)} not poured by last orders` : 'With the first drink';
  const toMove = s.waiting + s.held;
  $('move').disabled = !toMove;
  if (!toMove && !$('artist-status').dataset.busy) $('artist-status').textContent = s.came ? 'Nothing waiting to move.' : '';
  else if (!$('artist-status').dataset.busy) $('artist-status').textContent = toMove !== s.came ? `${n(toMove)} sats to move, from this gig and earlier ones.` : '';
}

function pourButton(d, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn quiet pour-btn';
  b.textContent = label;
  b.onclick = () => pour(d.id);
  return b;
}

// ---- Move to my own wallet: collect everything locked to the artist's key here (and, after last orders, drinks
// nobody poured), then the whole of this browser's wallet as one code to paste into any Cashu wallet.
async function collectAllHere(say) {
  const mine = [];
  for (const p of state.waiting) if (await artist.coco.keyring.getKeyPair(p.pubkey)) mine.push(p);
  // Marked on the server as each swap lands (ten per request, three requests at a time), so nothing is collected twice.
  const collected = [];
  const notYet = [];
  const mark = async (ids) => {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    for (let i = 0; i < chunks.length; i += 3) {
      for (const part of await Promise.all(chunks.slice(i, i + 3).map((c) => api('POST', '/api/admin/locked/collected', { ids: c, by: 'artist' })))) {
        collected.push(...part.collected);
        notYet.push(...part.notYet);
      }
    }
  };
  if (mine.length) await artist.collectAll(mine, { saved: mark, progress: (done, of) => say(`Collecting… ${done} of ${of}`) });
  if (afterLastOrders()) {
    const late = [];
    for (const p of state.waiting.filter((x) => x.kind === 'drink' && x.pubkey !== state.pubkey)) {
      try { await artist.collect(p.token, p.pubkey, state.pubkey); late.push(p.id); } catch {}
    }
    if (late.length) await mark(late);
  }
  return notYet.length;
}
$('move').onclick = async () => {
  const say = (t) => { $('artist-status').textContent = t; };
  $('move').disabled = true;
  $('artist-status').dataset.busy = '1';
  try {
    const before = await artist.balance();
    const expected = before + state.waiting.filter((p) => p.pubkey === state.pubkey).reduce((t, p) => t + p.sats, 0);
    say('Collecting…');
    const missed = await collectAllHere(say);
    say('Making your code…');
    const out = await artist.takeHome();
    if (!out) { say('Nothing waiting to move.'); return; }
    keepToken(out.token, out.amount, Math.max(0, expected - out.amount));
    if (missed) say(`${missed} payment${missed === 1 ? '' : 's'} didn’t go through: Move again after this one.`);
    else say('');
  } catch (e) { say(e.message); }
  finally { delete $('artist-status').dataset.busy; $('move').disabled = false; refresh().catch(() => {}); }
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

// ---- The code: kept in this browser (it's the money once it has left the wallet) until the mint says another wallet
// took it. The page asks every few seconds while it's open, then says so and lets it go: nothing to press.
const KEPT = 'nutpub-sent-artist-token';
function keepToken(token, amount, fee) {
  try { localStorage.setItem(KEPT, JSON.stringify({ token, amount, fee })); } catch {}
  showKept();
}
function kept() {
  let v = null;
  try { v = localStorage.getItem(KEPT); } catch {}
  if (!v) return null;
  try { const o = JSON.parse(v); return o?.token ? o : null; } catch { return v.startsWith('cashu') ? { token: v, amount: null, fee: null } : null; } // a code kept before 13 Nov
}
let watching = null;
function showKept() {
  const k = kept();
  $('moved').hidden = !k;
  $('btc').hidden = !!k;
  clearInterval(watching);
  if (!k) return;
  $('moved-amount').replaceChildren(k.amount == null ? 'Your code' : n(k.amount), ...(k.amount == null ? [] : [' ', Object.assign(document.createElement('small'), { textContent: 'sats' })]));
  $('moved-fee').textContent = k.fee ? `Mint’s fee · ${n(k.fee)} sats` : '';
  $('moved-fee').hidden = !k.fee;
  $('artist-token').textContent = k.token;
  $('open-wallet').href = `cashu:${k.token}`;
  $('moved-wait').lastElementChild.textContent = 'Waiting for your wallet.';
  const check = async () => {
    if (document.hidden) return;
    try {
      if (!(await artist.landed(k.token))) return;
      clearInterval(watching);
      try { localStorage.removeItem(KEPT); } catch {}
      $('moved-wait').lastElementChild.textContent = 'In your wallet.';
      setTimeout(() => { showKept(); refresh().catch(() => {}); }, 2500);
    } catch {}
  };
  watching = setInterval(check, 5000);
  check();
}
$('copy').onclick = async () => {
  const k = kept();
  if (!k) return;
  try { await navigator.clipboard.writeText(k.token); $('copy-word').textContent = 'Copied'; }
  catch { getSelection().selectAllChildren($('artist-token')); $('copy-word').textContent = 'Select and copy'; }
  setTimeout(() => { $('copy-word').textContent = 'Copy'; }, 2500);
};
$('bar-home').onclick = async () => {
  try {
    const out = await bar.takeHome();
    if (!out) { $('bar-status').textContent = 'Nothing collected here yet.'; return; }
    $('bar-token').value = out.token;
    $('bar-token').hidden = false;
    await navigator.clipboard?.writeText(out.token).catch(() => {});
    $('bar-status').textContent = `${sats(out.amount)} as one token: copied.`;
  } catch (e) { $('bar-status').textContent = e.message; }
};
showKept();

await refresh();
setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60_000); // each refresh is 4 requests
