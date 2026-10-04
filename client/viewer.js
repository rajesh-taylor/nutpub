// The viewer page: the set, 10 seconds at a time. Each piece's sound is bought just before it plays (NUT-24:
// a 402, paid in the same request from this browser's own wallet); its picture comes with it. Stop paying and it
// stops at once. "Free, with tips" shows play without a 402. The tip button is a 402 of its own.
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
const BUY_AHEAD = 3; // seconds before a piece starts that it's bought
const PIECE = 10;

// Every line this page says, in one place (the EN/DE table comes on the languages evening).
const T = {
  play: 'Play', stop: 'Stop',
  perPiece: (n) => `${n} sat${n === 1 ? '' : 's'} / 10 s`,
  free: 'Free to watch',
  spent: (n) => ` · This set: ${n} sat${n === 1 ? '' : 's'}`,
  pocket: (n) => `In your pocket · ${n} sats`,
  stopped: 'Stopped. Nothing more is charged.',
  empty: 'Your pocket’s empty. Top it up to keep playing.',
  tipAsk: (n) => `Tap again to pay ${n} sats`,
  tipDone: (label) => `${label}: paid. Thank you!`,
  retrying: 'Lost the reply. Asking again with the same payment…',
  retried: 'Same payment, same 10 seconds. Charged once.',
  notReady: 'The show isn’t ready yet: no price set.',
  tapVideo: 'Tap the picture to start it.',
  refused: {
    reused: 'That payment was already used.', wrong_mint: 'Wrong mint.', too_little: 'Not enough.',
    no_dleq: 'The payment carried no signature proof.', bad_dleq: 'The payment’s signature didn’t check out.',
    mint_unreachable: 'The mint isn’t answering.', mint_refused: 'The mint refused the payment.',
  },
};

const say = (text) => { $('status').textContent = text || ''; };
const sats = (n) => `${n} sat${n === 1 ? '' : 's'}`;

const [health, { show }] = await Promise.all([
  fetch('/api/health').then((r) => r.json()),
  fetch('/api/show').then((r) => r.json()),
]);
document.title = show.title ? `${show.title} · The NutPub` : 'The NutPub';
$('billing').textContent = [show.title, show.artist].filter(Boolean).join(' · ');
document.body.dataset.orientation = show.orientation;
const free = show.stream.mode === 'free';
$('price').textContent = free ? T.free : T.perPiece(show.stream.price);
const tipText = `${show.tip.label || 'Tip'} · ${sats(show.tip.price || 0)}`;
$('tip').textContent = $('ov-tip').textContent = tipText;

// ---- This phone's pass: what paid pieces are recorded against. Kept in this browser.
async function getPass(fresh = false) {
  let id = null;
  try { id = fresh ? null : localStorage.getItem('nutpub-pass'); } catch {}
  if (!id) {
    id = (await fetch('/api/pass', { method: 'POST' }).then((r) => r.json())).pass;
    try { localStorage.setItem('nutpub-pass', id); } catch {}
  }
  return id;
}
let pass = await getPass();
let spentHere = 0;
const me = await fetch('/api/pass/me', { headers: { 'X-Pass': pass } });
if (me.status === 403) pass = await getPass(true);
else spentHere = (await me.json()).spent;
const meter = () => { $('spent').textContent = free ? '' : T.spent(spentHere); };
meter();

// ---- The wallet (Coco, in this browser).
const wallet = await openWallet(health.mint.url);
const pocket = async () => { $('pocket').textContent = T.pocket(await wallet.balance()); };
await pocket();
wallet.on('proofs:saved', pocket);
$('pocket-link').hidden = !show.pocket.on;
$('topup').hidden = !health.mint.test;
$('play').disabled = false;
$('tip').disabled = !show.tip.price;

$('topup').onclick = async () => {
  $('topup').disabled = true;
  try {
    const { id } = await wallet.topup(100);
    for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
    await pocket();
    say('+100 test sats.');
  } catch (e) { say(e.message); }
  $('topup').disabled = false;
};

// ---- NUT-24: ask; on a 402, pay the creqA from this wallet and ask again with the cashuB.
// Safe retry (if on): a lost reply is asked for again with the same token, which the server answers without
// charging twice.
async function paidFetch(url) {
  const headers = { 'X-Pass': pass };
  const res = await fetch(url, { headers });
  if (res.status !== 402) return res;
  const token = await wallet.pay(res.headers.get('X-Cashu'));
  const tries = show.retry.on ? 10 : 1;
  for (let i = 0; i < tries; i += 1) {
    try {
      const paid = await fetch(url, { headers: { ...headers, 'X-Cashu': token } });
      if (i > 0) say(T.retried);
      paid.paidWith = token;
      return paid;
    } catch (e) {
      if (i === tries - 1) throw e;
      say(T.retrying);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
const refusal = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (body.error === 'not_ready') return T.notReady;
  return T.refused[body.error] || body.detail || body.error || `Refused (${res.status})`;
};

// ---- The player. Sound: Web Audio, each piece scheduled back to back on the audio clock, so the joins are seamless.
// Picture: two video elements taking turns, each loaded before its piece starts.
let ctx = null;
let master = null;
let sources = [];
let playing = false;
let run = 0;
let next = 0; // the next piece to buy (the set loops on the server: piece n is file n % pieces)
const vids = [$('vid-a'), $('vid-b')];

function unlockAudio() {
  // At the very start of a tap, before any await, or iOS stays silent.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function controls(on) {
  playing = on;
  $('play').textContent = on ? T.stop : T.play;
  $('play').classList.toggle('primary', !on);
  document.body.classList.toggle('playing', on);
}

async function play() {
  const ac = unlockAudio();
  const mine = ++run;
  controls(true);
  say('');
  master = ac.createGain();
  master.connect(ac.destination);
  const out = master;
  let startAt = ac.currentTime + 0.4;

  while (playing && mine === run) {
    const wait = (startAt - ac.currentTime - BUY_AHEAD) * 1000;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!playing || mine !== run) break;

    let res;
    try {
      res = await paidFetch(`/api/set/audio/${next}`);
    } catch (e) {
      stop(/insufficient|not enough|balance/i.test(e.message) ? T.empty : e.message);
      break;
    }
    if (!res.ok) { stop(await refusal(res)); break; }
    if (res.paidWith) { spentHere += show.stream.price; meter(); }
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    if (!playing || mine !== run) break; // stopped while it was on its way: don't start it
    if (startAt < ac.currentTime) startAt = ac.currentTime + 0.05; // fell behind (slow network): start now
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.start(startAt);
    sources.push(src);
    src.onended = () => (sources = sources.filter((s) => s !== src));
    picture(next, startAt, mine);
    next += 1;
    startAt += PIECE;
  }
}

// The picture for a paid piece, started when its sound starts.
async function picture(n, startAt, mine) {
  try {
    const r = await fetch(`/api/set/video/${n}`, { headers: { 'X-Pass': pass } });
    if (!r.ok) return;
    const v = vids[n % 2];
    const old = v.src;
    v.src = URL.createObjectURL(await r.blob());
    if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    v.load();
    const go = () => {
      if (!playing || mine !== run) return;
      v.currentTime = 0;
      v.play().then(() => {
        v.classList.add('on');
        vids[(n + 1) % 2].classList.remove('on');
      }).catch(() => say(T.tapVideo));
    };
    const ms = (startAt - ctx.currentTime) * 1000;
    if (ms > 0) setTimeout(go, ms); else go();
  } catch {}
}

// Stop paying: the sound fades out now, not at the end of what was already bought.
function stop(why) {
  run += 1;
  if (master) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    for (const s of sources) { try { s.stop(ctx.currentTime + 0.7); } catch {} }
    sources = [];
    master = null;
  }
  for (const v of vids) { v.pause(); v.classList.remove('on'); }
  controls(false);
  say(why || (free ? '' : T.stopped));
}

const toggle = () => (playing ? stop() : play());
$('play').onclick = toggle;
$('big-play').onclick = toggle;
$('ov-stop').onclick = () => stop();
// iPhone (Low Power Mode) may refuse to start a video without a tap: any tap on the picture starts it.
$('player').addEventListener('click', (e) => {
  if (e.target.tagName === 'VIDEO') vids.find((v) => v.classList.contains('on') || v.src)?.play().catch(() => {});
});

// ---- The tip: tap once to see the price, again to pay.
let tipArmed = null;
async function tip(button) {
  unlockAudio();
  if (tipArmed !== button) {
    tipArmed = button;
    button.textContent = T.tipAsk(show.tip.price);
    setTimeout(() => { if (tipArmed === button) { tipArmed = null; button.textContent = tipText; } }, 4000);
    return;
  }
  tipArmed = null;
  button.textContent = tipText;
  try {
    const res = await paidFetch('/api/tip');
    say(res.ok ? T.tipDone(show.tip.label || 'Tip') : await refusal(res));
  } catch (e) {
    say(/insufficient|not enough|balance/i.test(e.message) ? T.empty : e.message);
  }
  pocket();
}
$('tip').onclick = () => tip($('tip'));
$('ov-tip').onclick = () => tip($('ov-tip'));
