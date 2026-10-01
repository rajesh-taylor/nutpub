// Fan page: the phone's wallet, the gift it arrived with, the door, and the paid stream.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';
import QRCode from 'qrcode';
import { Mint, hashToCurve, getDecodedToken } from '@cashu/cashu-ts';

const $ = (id) => document.getElementById(id);
const show = (id) => document.querySelectorAll('[data-screen]').forEach((el) => (el.hidden = el.id !== id));

const LINES = {
  wrong_mint: 'Not money this NutPub takes!',
  bad_dleq: 'Still not allowed past the doormen.',
  no_dleq: 'No hologram, no entry.',
  reused: 'That ecash has already been through this door.',
  too_little: 'Not enough sats for that tier.',
  mint_unreachable: 'Can’t reach the NutPub Mint. Try again.',
};

let wallet, config, pass, tier;
let showState = { t0: null };
let clockOffset = 0; // server time minus this phone's time
let streaming = false;
let resumed = false; // came back after a reload: wait for a tap (iOS needs one before it plays sound)
let run = 0; // each start gets a number, so a stopped loop that wakes up late just exits

const serverNow = () => Date.now() + clockOffset;
const say = (text) => ($('status').textContent = text);

async function refresh() {
  $('balance').textContent = `${await wallet.balance()} sats`;
}

async function claimGift() {
  const token = decodeURIComponent(location.hash.slice(1));
  if (!token.startsWith('cashuB') && !token.startsWith('cashuA')) return;
  history.replaceState(null, '', location.pathname); // the gift is live money: don't leave it in the address bar
  say('Opening your gift…');
  try {
    await wallet.receive(token);
    say('Gift received. Pick your tier.');
  } catch (e) {
    say(`That gift didn’t open: ${e.message}`);
  }
}

// NUT-24 round trip: ask, get a 402 with a creqA, pay it in-band, ask again with the cashuB.
async function paidFetch(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (res.status !== 402) return res;
  const token = await wallet.pay(res.headers.get('X-Cashu'));
  return fetch(url, { headers: { ...headers, 'X-Cashu': token } });
}

async function enter(t) {
  unlockAudio();
  say('Knocking…');
  try {
    const res = await paidFetch(`/api/door?tier=${t}`);
    const body = await res.json();
    if (res.ok) {
      ({ pass, tier } = body);
      try { localStorage.setItem('nutpub-pass', pass); } catch {}
      $('in-tier').textContent = body.name;
      say('');
      show('inside');
      keepAwake();
      if (showState.t0) startStream();
    } else {
      trombone();
      say(LINES[body.error] || body.detail || body.error);
    }
  } catch (e) {
    say(e.message.includes('Insufficient') ? 'Not enough sats on this phone.' : e.message);
  }
  refresh();
}

async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
}

// ---- The stream: buy each 10-second segment just before it plays, and schedule it on the shared clock.
async function startStream() {
  if (streaming || !pass) return;
  streaming = true;
  const me = ++run;
  const ac = unlockAudio();
  $('stream').hidden = false;
  $('stop').textContent = '⏸ Stop paying';
  const ms = showState.segmentMs;
  let n = Math.max(0, Math.floor((serverNow() - showState.t0) / ms));

  while (streaming && me === run) {
    const startsAt = showState.t0 + n * ms;
    const wait = startsAt - serverNow() - 3000; // buy 3 s ahead
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!streaming || me !== run) break;

    let res;
    try {
      res = await paidFetch(`/api/segment/${n}`, { 'X-Pass': pass });
    } catch (e) {
      stopStream(e.message.includes('Insufficient') ? 'Out of sats. The music stops here.' : e.message);
      break;
    }
    if (res.status === 409) { // fell behind: jump to the live segment
      n = (await res.json()).live ?? n + 1;
      continue;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      stopStream(LINES[body.error] || body.detail || `segment refused (${res.status})`);
      break;
    }
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    const late = (serverNow() - startsAt) / 1000;
    if (late > 0) src.start(0, Math.min(late, buf.duration - 0.05));
    else src.start(ac.currentTime - late);
    tick(n);
    refresh();
    n++;
  }
}

function tick(n) {
  const price = config.tiers[tier].segment;
  const from = n * 10;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('ticks').insertAdjacentHTML('afterbegin', `<li>${mmss(from)}–${mmss(from + 10)} · ${price} sat${price > 1 ? 's' : ''} ✓</li>`);
  while ($('ticks').children.length > 5) $('ticks').lastChild.remove();
}

function stopStream(why) {
  streaming = false;
  $('stop').textContent = '▶ Pay to listen';
  say(why ? `${why} If your sats ain’t signed, you ain’t coming in!` : 'Stopped paying. The music stops at the end of this segment.');
}

// ---- First pint's on the house. The QR only appears when you ask for it (it's a bearer voucher).
let pintToken = null;
async function freePint() {
  unlockAudio();
  if (!pintToken) {
    const res = await fetch('/api/pint', { method: 'POST', headers: { 'X-Pass': pass } });
    const body = await res.json();
    if (!res.ok) return say(body.detail || body.error);
    pintToken = body.token;
    watchPint(pintToken);
  }
  await QRCode.toCanvas($('pint-qr'), `${config.publicUrl || location.origin}/bar.html#${pintToken}`, { errorCorrectionLevel: 'L', margin: 1, width: 640 });
  $('pint-qr').hidden = false;
  $('pint').textContent = 'Show this at the bar';
}

// The Pint Signal: this phone asks the mint (NUT-07) whether its pint has been spent. Nobody tells it.
async function watchPint(token) {
  const ids = (await fetch('/kitty/v1/keysets').then((r) => r.json())).keysets.map((k) => k.id);
  const enc = new TextEncoder();
  const Ys = getDecodedToken(token, ids).proofs.map((p) => hashToCurve(enc.encode(p.secret)).toHex(true));
  const mint = new Mint(config.kitty);
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const { states } = await mint.check({ Ys });
      if (states.every((st) => st.state === 'SPENT')) return pintSignal();
    } catch {}
  }
}

function pintSignal() {
  $('pint-qr').hidden = true;
  $('pint').hidden = true;
  $('pint-signal').hidden = false;
  clink();
  setTimeout(clink, 900);
}

// ---- The finale: a round for the band. The 402 asks for a locked token; this phone adds its own refund key.
let finale = null;
let reclaiming = false;

async function roundForTheBand() {
  unlockAudio();
  say('Locking 21 sats to Longy…');
  try {
    const url = '/api/pledge';
    const ask = await fetch(url, { headers: { 'X-Pass': pass } });
    if (ask.status !== 402) {
      const b = await ask.json().catch(() => ({}));
      return say(b.error === 'round_paid' ? 'Longy’s already paid!' : b.detail || b.error);
    }
    const token = await wallet.pledge(ask.headers.get('X-Cashu'));
    const res = await fetch(url, { headers: { 'X-Pass': pass, 'X-Cashu': token } });
    const body = await res.json();
    if (!res.ok) { trombone(); return say(body.detail || body.error); }
    say('Pledged 21. If the room misses the goal, it comes home by itself at last orders.');
  } catch (e) {
    say(e.message.includes('Insufficient') ? 'Not enough sats on this phone.' : e.message);
  }
  refresh();
}

function showFinale(f) {
  if (!f || !pass) return;
  const was = finale?.state;
  finale = f;
  const mine = wallet.pledges().reduce((s, p) => s + p.amount, 0);
  $('finale').hidden = !showState.t0;
  $('goal').textContent = `Longy: ${f.total} / ${f.goal} sats`;
  $('goal-bar').style.width = `${Math.min(100, (100 * f.total) / f.goal)}%`;
  const left = Math.max(0, f.lastOrders - Math.floor(serverNow() / 1000));
  $('last-orders').textContent = f.state === 'open' ? `Last orders in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  $('band').disabled = f.state !== 'open';
  if (f.state === 'paid' && was !== 'paid') {
    if (mine) wallet.forgetPledges(); // they went to Longy
    $('paid-screen').hidden = false;
    rain();
    clink();
  }
  if (f.state === 'missed' && wallet.pledges().length && !reclaiming) comeHome();
}

// Missed: nobody presses refund. Retry every second until the mint's clock agrees it's past last orders.
async function comeHome() {
  reclaiming = true;
  let back = 0;
  for (let i = 0; i < 120 && wallet.pledges().length; i++) {
    back += await wallet.reclaim().catch(() => 0);
    if (wallet.pledges().length) await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
  reclaiming = false;
  if (back) {
    say(`+${back} sats home. Every sat you pledged comes home.`);
    clink();
  }
  refresh();
}

function rain() {
  const box = $('rain');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 ? '⚡' : '🟠';
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 2.5}s`;
    s.style.fontSize = `${18 + Math.random() * 22}px`;
    box.append(s);
  }
  setTimeout(() => box.replaceChildren(), 6000);
}

// ---- Curtains up: the server sends T0 over SSE (falls back to polling if the stream stalls).
function listen() {
  const apply = (s) => {
    clockOffset = s.now - Date.now();
    const opening = s.t0 && !showState.t0;
    showState = s;
    showFinale(s.finale);
    $('curtain').textContent = s.t0 ? 'NOW PLAYING: Longy' : 'Curtains up soon.';
    if (opening && pass && !resumed) startStream();
    if (s.t0 && pass) $('stream').hidden = false;
  };
  // SSE for speed, plus a 1-s poll: the Cloudflare tunnel holds SSE back, so the poll is what you get through it.
  const es = new EventSource('/api/events');
  es.onmessage = (e) => apply(JSON.parse(e.data));
  const poll = () => fetch('/api/show').then((r) => r.json()).then(apply).catch(() => {}).finally(() => setTimeout(poll, 1000));
  poll();
}

async function main() {
  config = await fetch('/api/config').then((r) => r.json());
  $('judge-price').textContent = `${config.tiers.judge.door} sats in, then ${config.tiers.judge.segment} sat / 10 s`;
  $('pleb-price').textContent = `${config.tiers.pleb.segment} sats / 10 s`;
  wallet = await openWallet(config.kitty);
  await claimGift();
  await refresh();
  $('pint').onclick = () => freePint().catch((e) => say(e.message));
  $('band').onclick = roundForTheBand;
  $('paid-screen').onclick = () => ($('paid-screen').hidden = true);
  $('pint-signal').onclick = () => ($('pint-signal').hidden = true);
  $('judge').onclick = () => enter('judge');
  $('pleb').onclick = () => enter('pleb');
  $('stop').onclick = () => {
    if (streaming) stopStream();
    else { say(''); startStream(); }
  };
  listen();
  // Already paid at the door on this phone (and the show hasn't been reset)? Straight back in.
  let saved = null;
  try { saved = localStorage.getItem('nutpub-pass'); } catch {}
  const back = saved && (await fetch('/api/pass', { headers: { 'X-Pass': saved } }));
  if (back?.ok) {
    const b = await back.json();
    pass = saved;
    resumed = true;
    tier = b.tier;
    $('in-tier').textContent = b.name;
    show('inside');
    $('stop').textContent = '▶ Pay to listen';
    $('stream').hidden = !showState.t0;
    say('Welcome back. Tap ▶ to keep listening.');
  } else {
    show('door');
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && pass) keepAwake(); });
window.addEventListener('hashchange', () => claimGift().then(refresh));
main().catch((e) => say(`Wallet failed to start: ${e.message}`));
