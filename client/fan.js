// Fan page: the phone's wallet, the gift it arrived with, the door, and the paid stream.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone } from './sound.js';

const $ = (id) => document.getElementById(id);
const show = (id) => document.querySelectorAll('[data-screen]').forEach((el) => (el.hidden = el.id !== id));

const LINES = {
  wrong_mint: 'Not money this NutPub takes!',
  bad_dleq: 'Still not allowed past the doormen.',
  no_dleq: 'No hologram, no entry.',
  reused: 'That ecash has already been through this door.',
  too_little: 'Not enough sats for that tier.',
  mint_unreachable: 'Can’t reach the Kitty. Try again.',
};

let wallet, config, pass, tier;
let showState = { t0: null };
let clockOffset = 0; // server time minus this phone's time
let streaming = false;
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

// ---- Curtains up: the server sends T0 over SSE (falls back to polling if the stream stalls).
function listen() {
  const apply = (s) => {
    clockOffset = s.now - Date.now();
    const opening = s.t0 && !showState.t0;
    showState = s;
    $('curtain').textContent = s.t0 ? 'NOW PLAYING: Longy' : 'Curtains up soon.';
    if (opening && pass) startStream();
  };
  const es = new EventSource('/api/events');
  es.onmessage = (e) => apply(JSON.parse(e.data));
  es.onerror = () => {
    es.close();
    const poll = () => fetch('/api/show').then((r) => r.json()).then(apply).catch(() => {}).finally(() => setTimeout(poll, 1000));
    poll();
  };
}

async function main() {
  config = await fetch('/api/config').then((r) => r.json());
  $('judge-price').textContent = `${config.tiers.judge.door} sats in, then ${config.tiers.judge.segment} sat / 10 s`;
  $('pleb-price').textContent = `${config.tiers.pleb.segment} sats / 10 s`;
  wallet = await openWallet(config.kitty);
  await claimGift();
  await refresh();
  $('judge').onclick = () => enter('judge');
  $('pleb').onclick = () => enter('pleb');
  $('stop').onclick = () => {
    if (streaming) stopStream();
    else { say(''); startStream(); }
  };
  listen();
  show('door');
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && pass) keepAwake(); });
window.addEventListener('hashchange', () => claimGift().then(refresh));
main().catch((e) => say(`Wallet failed to start: ${e.message}`));
