// The viewer page: the set, 10 seconds at a time. Each piece's sound is bought just before it plays (NUT-24:
// a 402, paid in the same request from this browser's own wallet); its picture comes with it. Stop paying and it
// stops at once. "Free, with tips" shows play without a 402. The tip button is a 402 of its own.
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
// ?as=home: someone watching at home (the desktop view), with a pass and wallet of their own, apart from the
// phone in the room, even when both are open in one browser (the demo page).
const AS = new URLSearchParams(location.search).get('as') === 'home' ? 'home' : 'room';
// ?view=ticket: the setup page's picture of the ticket page, whatever this browser already holds and whatever the night.
const TICKET_VIEW = new URLSearchParams(location.search).get('view') === 'ticket';
const KEEP = AS === 'home' ? '-home' : '';
const BUY_AHEAD = 3; // seconds before a piece starts that it's bought
const PIECE = 10;
const TOP_UP = 150_000; // test sats in every wallet: a ticket, a drink and plenty of tips

// Every line this page says, in one place (the EN/DE table comes on the languages evening).
const T = {
  play: 'Play', stop: 'Stop',
  perMinute: (n) => `${n} sat${n === 1 ? '' : 's'} a minute`,
  full: 'Full screen', exitFull: 'Leave full screen',
  spent: (n) => `${Number(n).toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`,
  stopped: 'Stopped. Nothing more is charged.',
  paused: 'Paused. Nothing more is charged. Press play to rejoin the show, live.',
  budget: (n) => `You’ve reached your limit: ${n} sats tonight. Raise it to keep watching.`,
  liveEnded: 'The stream has stopped.', liveLost: 'The picture stopped. Press play to rejoin.',
  empty: 'Your wallet’s empty. Top it up to keep playing.',
  tipDone: (label) => `${label}: paid. Thank you!`,
  ownTip: 'Tip', ownPay: (n) => `Tip ${n} sat${n === 1 ? '' : 's'}`, ownDone: (n) => `${n} sat${n === 1 ? '' : 's'} tipped. Thank you!`,
  retrying: 'Lost the reply. Asking again with the same payment…',
  retried: 'Same payment, same 10 seconds. Charged once.',
  notReady: 'The show isn’t ready yet.',
  tapVideo: 'Tap the picture to start it.',
  noLive: 'Live video needs a newer browser (on iPhone, iOS 17.1 or later).',
  refused: {
    reused: 'That payment was already used.', wrong_mint: 'Wrong mint.', too_little: 'Not enough.',
    no_dleq: 'The payment carried no signature proof.', bad_dleq: 'The payment’s signature didn’t check out.',
    mint_unreachable: 'The mint isn’t answering.', mint_refused: 'The mint refused the payment.',
    not_locked: 'The payment wasn’t locked to the artist.', wrong_lock: 'The payment was locked to the wrong key.',
    has_refund: 'The payment could come back to you, so it isn’t a payment.', too_small: 'Tips are 21 sats or more.',
  },
};

const say = (text) => { $('status').textContent = text || ''; };
const sats = (n) => `${Number(n).toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;

const [health, { show, photo: showPhoto, photos: showPhotos = {} }] = await Promise.all([
  fetch('/api/health').then((r) => r.json()),
  fetch('/api/show').then((r) => r.json()),
]);
document.title = `${show.artist || show.title || 'The show'} · The NutPub`;
$('billing').textContent = show.title;
$('about').textContent = show.description;
$('about').hidden = !show.description;
const free = show.stream.mode === 'free';
// Free shows: no price and no "This set" (there's nothing to count).
$('price').textContent = free ? '' : T.perMinute(show.stream.perMinute);
$('meter').hidden = free;
const tipText = `Tip ${show.artist || ''} · ${sats(show.tip.price || 0)}`.replace('  ', ' ');
$('tip').textContent = $('ov-tip').textContent = tipText;

// ---- This phone's pass: what paid pieces are recorded against. Kept in this browser.
async function getPass(fresh = false) {
  let id = null;
  try { id = fresh ? null : localStorage.getItem(`nutpub-pass${KEEP}`); } catch {}
  if (!id) {
    id = (await fetch('/api/pass', { method: 'POST' }).then((r) => r.json())).pass;
    try { localStorage.setItem(`nutpub-pass${KEEP}`, id); } catch {}
  }
  return id;
}
let pass = await getPass();
let spentHere = 0;
let resumeAt = 0; // this pass's first unpaid piece
let liveSpentSoFar = 0;
const me = await fetch('/api/pass/me', { headers: { 'X-Pass': pass } });
if (me.status === 403) pass = await getPass(true);
else ({ spent: spentHere, next: resumeAt, live: liveSpentSoFar } = await me.json());
spentHere += liveSpentSoFar;
// The mint's fee on live minutes: it leaves the wallet too, so it counts towards the limit. Only this browser knows it.
let liveFees = 0;
try { liveFees = liveSpentSoFar ? Number(localStorage.getItem(`nutpub-fees${KEEP}`)) || 0 : 0; } catch {}
const meter = () => { $('spent').textContent = free ? '' : T.spent(spentHere + liveFees); };
meter();

// ---- The wallet (Coco, in this browser).
const wallet = await openWallet(health.mint.url, `nutpub${KEEP}`);
const balance = async () => {
  const n = (await wallet.balance()).toLocaleString('en-GB');
  $('balance').textContent = n;
  const d = document.getElementById('door-balance'); // on the door's ticket box too: you see what you have before you pay
  if (d) d.textContent = n;
};
await balance();
wallet.on('proofs:saved', balance);
// On the test mint every wallet fills itself to 150,000 test sats when the page opens: nobody fiddles before the show.
async function fill() {
  const have = await wallet.balance();
  if (!health.mint.test || have >= TOP_UP / 2) return;
  const { id } = await wallet.topup(TOP_UP - have);
  for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
  await balance();
}
fill().catch(() => {});
if (!show.wallet.on) { $('wallet-link').removeAttribute('href'); $('wallet-page').hidden = true; } // balance only
$('topup').hidden = !health.mint.test;
$('wallet-page').parentElement.classList.toggle('solo', !health.mint.test);
$('play').disabled = $('big-play').disabled = false;
$('tip').disabled = $('ov-tip').disabled = !show.tip.price;
$('own').disabled = false;

$('door-topup').onclick = () => $('topup').onclick();
$('topup').onclick = async () => {
  $('topup').disabled = true;
  try {
    const { id } = await wallet.topup(TOP_UP);
    for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
    await balance();
    say(`+${TOP_UP.toLocaleString('en-GB')} test sats.`);
  } catch (e) { say(e.message); }
  $('topup').disabled = false;
};

// ---- NUT-24: ask; on a 402, pay the creqA from this wallet and ask again with the cashuB.
// Safe retry (if on): a lost reply is asked for again with the same token, which the server answers without
// charging twice.
async function paidFetch(url, extra = {}) {
  const headers = { 'X-Pass': pass, ...extra };
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
  if (body.error === 'not_ready') return `${T.notReady} ${body.detail || ''}`.trim();
  return T.refused[body.error] || body.detail || body.error || `Refused (${res.status})`;
};

// ---- The player. Sound: Web Audio, each piece scheduled back to back on the audio clock, so the joins are seamless.
// Picture: two video elements taking turns, each loaded before its piece starts.
let ctx = null;
let master = null;
let sources = [];
let playing = false;
let run = 0;
let next = resumeAt; // the next piece to buy (the set loops on the server: piece n is file n % pieces)
const vids = [$('vid-a'), $('vid-b')];
// The picture's shape comes from the video itself: however the artist holds the phone, nothing is cropped.
const fit = ({ target: { videoWidth: w, videoHeight: h } }) => {
  if (!w || !h) return;
  document.body.style.setProperty('--ratio', w / h);
  document.body.dataset.shape = h > w ? 'tall' : 'wide';
};
for (const v of vids) { v.addEventListener('loadedmetadata', fit); v.addEventListener('resize', fit); }

function unlockAudio() {
  // At the very start of a tap, before any await, or iOS stays silent.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---- The background photo: the account holder's own; or the Berlin picks, one before Play and three taking
// turns while the set plays.
const BERLIN = { before: ['/img/peggy-5-1372.jpg'], playing: ['/img/fp-32.jpg', '/img/fp-37.jpg', '/img/peggy-17-8266.jpg'] };
const layers = [$('bd-a'), $('bd-b')];
let shown = 0;
let turn = null;
const backdropTo = (url) => {
  const img = new Image();
  img.onload = () => {
    shown = 1 - shown;
    layers[shown].style.backgroundImage = `url("${url}")`;
    layers[shown].classList.add('on');
    layers[1 - shown].classList.remove('on');
  };
  img.src = url; // a missing file (a fresh clone has no Berlin picks) just leaves midnight
};
function backdrop(on) {
  clearInterval(turn);
  // The home page has no backdrop: photos only on the ticket, the poster and the player before Play.
  if (AS === 'home' && top === self) return;
  // Two tall photos for phones, two wide for screens: the first until it plays, then they take turns.
  const mine = (matchMedia('(orientation: landscape)').matches ? [showPhotos.wide1, showPhotos.wide2] : [showPhotos.tall1, showPhotos.tall2]).filter(Boolean);
  const list = mine.length ? (on ? mine : mine.slice(0, 1)) : showPhoto ? [showPhoto] : on ? BERLIN.playing : BERLIN.before;
  let i = 0;
  backdropTo(list[0]);
  if (list.length > 1) turn = setInterval(() => backdropTo(list[(i += 1) % list.length]), 20_000);
}
backdrop(false);

function controls(on) {
  playing = on;
  backdrop(on);
  // The cover photo is for before Play: once playing, plain black behind the picture.
  $('player').style.backgroundImage = on ? 'none' : `url("${cover}")`;
  $('play').setAttribute('aria-label', on ? (document.body.classList.contains('live-video') ? 'Pause' : T.stop) : T.play);
  document.body.classList.toggle('playing', on);
}

// ---- Live: when the artist's stream is coming in (the live light), Play plays it instead of the recorded set.
// HLS through hls.js (iPhone Safari 17.1+ too), loaded only once a stream is on. Stream plays nothing without a token,
// and each 402 paid buys a token that outlasts the next payment: stop paying and the picture stops. hls.js puts the
// newest token in every playlist request; the segments' links come with their own signature.
let liveOn = false;
let Hls = null;
let hls = null;
let liveToken = '';
let liveSpent = liveSpentSoFar;
const readyLive = () => { if (liveOn && !Hls) import('hls.js').then((m) => { Hls = m.default; }).catch(() => {}); };
const withToken = (url) => url.replace(/^(https:\/\/[^/]+\/)[^/]+(\/manifest\/)/, `$1${liveToken}$2`);

// The viewer's limit for the night, kept in this browser. Tickets and free shows pay nothing, so have none.
const pays = () => !free && !door.ticket;
const budget = () => Number($('budget').value) || 0;
try { $('budget').value = localStorage.getItem(`nutpub-budget${KEEP}`) || ''; } catch {}
$('budget').value ||= Math.max(500, (show.stream.perMinute || 0) * 6);
$('budget').oninput = () => { try { localStorage.setItem(`nutpub-budget${KEEP}`, $('budget').value); } catch {} };

// One token: free for a ticket or a free show, otherwise a 402. Returns its reply, or null with the picture stopped.
async function renew(mine) {
  if (pays() && liveSpent + liveFees + show.stream.perMinute > budget()) { stop(T.budget(liveSpent + liveFees)); return null; }
  const res = await paidFetch('/api/live/token');
  if (res.paidWith) {
    liveFees += wallet.lastFee;
    try { localStorage.setItem(`nutpub-fees${KEEP}`, liveFees); } catch {}
  }
  if (mine !== run) return null; // paused while it was on its way
  if (res.status === 409 && (await res.clone().json()).error === 'not_live') return { off: true };
  if (!res.ok) { stop(await refusal(res)); return null; }
  const reply = await res.json();
  if (reply.spent != null) { spentHere += reply.spent - liveSpent; liveSpent = reply.spent; meter(); balance(); }
  liveToken = new URL(reply.url).pathname.split('/')[1];
  return reply;
}

async function playLive() {
  const v = vids[0];
  v.muted = muted;
  v.volume = volume;
  if (!Hls?.isSupported()) return say(T.noLive);
  const mine = ++run;
  v.play().catch(() => {}); // in the tap itself, or the sound stays off; the picture comes once it's paid for
  document.body.classList.add('live-video');
  controls(true);
  say('');
  let started = false;
  let off = 0;
  while (playing && mine === run) {
    const at = Date.now();
    let reply = null;
    try {
      reply = await renew(mine);
      if (!reply) break;
      off = reply.off ? off + 1 : 0;
      if (off >= 3) { stop(T.liveEnded); break; } // the artist has stopped
      if (reply.url && !started) {
        started = true;
        hls = new Hls({ lowLatencyMode: false, xhrSetup: (xhr, url) => xhr.open('GET', withToken(url)) });
        hls.on(Hls.Events.ERROR, (_, e) => { if (e.fatal && mine === run) stop(T.liveLost); });
        hls.loadSource(reply.url);
        hls.attachMedia(v);
        v.play().then(() => v.classList.add('on')).catch(() => say(T.tapVideo));
      }
    } catch (e) {
      if (/insufficient|not enough|balance/i.test(e.message)) { stop(T.empty); break; }
      if (mine === run) say(T.retrying); // the network: the token has 20 s of slack, so try again soon
    }
    await new Promise((r) => setTimeout(r, Math.max(0, (reply?.every || 5) * 1000 - (Date.now() - at))));
  }
}

async function play() {
  if (liveOn) return playLive();
  const ac = unlockAudio();
  const mine = ++run;
  controls(true);
  say('');
  master = ac.createGain();
  master.gain.value = muted ? 0 : volume;
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
    if (res.paidWith) { spentHere += Math.ceil(show.stream.perMinute / 6); meter(); balance(); }
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
// ---- Volume and mute: the sound is Web Audio, so the page sets its level (phones also have their own buttons).
let volume = 1;
let muted = false;
function level() {
  if (hls) { vids[0].muted = muted; vids[0].volume = volume; }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  $('mute').setAttribute('aria-label', muted ? 'Sound on' : 'Mute');
  document.body.classList.toggle('muted', muted);
}
$('mute').onclick = () => { muted = !muted; level(); };
$('vol').oninput = () => { volume = Number($('vol').value); muted = volume === 0; level(); };

function stop(why) {
  run += 1;
  const wasLive = document.body.classList.contains('live-video');
  if (master) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    for (const s of sources) { try { s.stop(ctx.currentTime + 0.7); } catch {} }
    sources = [];
    master = null;
  }
  for (const v of vids) { v.pause(); v.classList.remove('on'); }
  if (hls) { hls.destroy(); hls = null; }
  vids[0].muted = true;
  controls(false);
  document.body.classList.remove('live-video');
  say(why || (free ? '' : wasLive && pays() ? T.paused : T.stopped));
}

const toggle = () => (playing ? stop() : play());
$('play').onclick = toggle;
$('big-play').onclick = toggle;

// ---- Full screen: the picture fills the screen, with the controls and the tip on it. Phone turned sideways does
// it by itself. The button also asks the browser for real full screen where it can (not on iPhone: there the
// page alone fills the screen, with Safari's bars still round it).
const sideways = matchMedia('(orientation: landscape) and (max-height: 540px)');
let wantFull = false;
// Where the tip's amount lives off full screen (under the comment box, or under the money buttons).
const ownSpot = document.createComment('own-form');
$('own-form').before(ownSpot);
const layout = () => {
  const full = wantFull || sideways.matches;
  document.body.classList.toggle('full', full);
  document.body.classList.toggle('sideways', sideways.matches);
  $('full').setAttribute('aria-label', full ? T.exitFull : T.full);
  // In full screen ₿ sits in the bottom bar, and the amount opens on the picture above it.
  if (full && $('own-form').parentElement !== $('player')) $('player').append($('own-form'));
  else if (!full && $('own-form').parentElement === $('player')) ownSpot.after($('own-form'));
  wake();
};
// Full screen, playing: the bars fade after 3 seconds without the mouse (or a tap), as on YouTube.
let idle = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idle);
  idle = setTimeout(() => {
    const busy = !$('own-form').hidden || $('player').querySelector('.bar:hover');
    if (document.body.classList.contains('full') && playing && !busy) document.body.classList.add('idle');
    else if (document.body.classList.contains('full')) wake();
  }, 3000);
}
for (const e of ['mousemove', 'pointerdown', 'keydown']) document.addEventListener(e, wake, { passive: true });
$('ov-btc').onclick = () => { unlockAudio(); ownForm($('own-form').hidden); };
sideways.addEventListener('change', layout);
layout();
$('full').onclick = () => {
  wantFull = !document.body.classList.contains('full');
  const doc = document.documentElement;
  if (wantFull) (doc.requestFullscreen || doc.webkitRequestFullscreen)?.call(doc)?.catch?.(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  layout();
};
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && wantFull) { wantFull = false; layout(); } // left with Esc or the back gesture
});

// iPhone (Low Power Mode) may refuse to start a video without a tap: any tap on the picture starts it.
$('player').addEventListener('click', (e) => {
  if (e.target.tagName === 'VIDEO') vids.find((v) => v.classList.contains('on') || v.src)?.play().catch(() => {});
});

// ---- The tip: one tap pays (the price is on the button). Off while paying, so a double tap pays once.
async function tip(button) {
  unlockAudio();
  if (button.disabled) return;
  button.disabled = true;
  try {
    const res = await paidFetch('/api/tip', said());
    if (res.ok) sent();
    say(res.ok ? T.tipDone(show.tip.label || 'Tip') : await refusal(res));
  } catch (e) {
    say(/insufficient|not enough|balance/i.test(e.message) ? T.empty : e.message);
  }
  button.disabled = false;
  balance();
}
$('tip').onclick = () => tip($('tip'));
$('ov-tip').onclick = () => tip($('ov-tip'));

// ---- Tip sats, your amount: type it, then "Tip n sats" pays exactly that (its own 402).
const MIN_TIP = 21; // the server's minimum too (server/set.js)
const ownSats = () => { const n = Number($('own-sats').value); return Number.isInteger(n) && n >= MIN_TIP && n <= 1_000_000 ? n : 0; };
const ownForm = (open) => {
  $('own-form').hidden = !open;
  $('own').hidden = open;
  // While the amount is open the comment box's words go with the tip: its arrow waits (Return goes to the tip).
  $('say-btc').setAttribute('aria-expanded', open);
  $('say-send').disabled = open;
  if (open) { $('own-sats').value = ''; $('own-sats').oninput(); $('own-sats').focus(); }
};
$('own').onclick = () => { unlockAudio(); ownForm(true); };
$('own-cancel').onclick = () => ownForm(false);
$('own-sats').oninput = () => {
  const n = ownSats();
  $('own-pay').disabled = !n;
  $('own-pay').textContent = n ? T.ownPay(n) : T.ownTip;
};
$('own-form').onsubmit = async (e) => {
  e.preventDefault();
  const n = ownSats();
  if (!n) return;
  $('own-pay').disabled = true;
  try {
    const res = await paidFetch(`/api/tip/${n}`, said());
    say(res.ok ? T.ownDone(n) : await refusal(res));
    if (res.ok) { sent(); ownForm(false); }
  } catch (err) {
    say(/insufficient|not enough|balance/i.test(err.message) ? T.empty : err.message);
  }
  $('own-pay').disabled = !ownSats();
  balance();
};

// ---- The night: the door, the welcome and the free drink, the stage (doors, on, closed), the live chat.
const body = document.body;
body.dataset.as = AS;
if (top !== self) { // inside a host page: it has its own way out, and its own test strip
  $('back-link').remove();
  body.classList.add('framed');
  document.querySelector('.test-banner')?.remove();
}
// At home the stretch goal sits under the money buttons, in a box of its own (board 2); the chat keeps the messages.
// The page of its own (not inside The show's frame): the goal over one wallet card holding all the money buttons.
const WALLET_CARD = AS === 'home' && top === self;
if (WALLET_CARD) {
  body.classList.add('wallet-card');
  // The wallet card: the wallet, what this costs, what just happened, the stretch goal.
  document.querySelector('.purse').append($('status'), $('goal'));
  // The show's line under the picture, as on a video site: the artist and the date.
  const line = Object.assign(document.createElement('div'), { className: 'show-line' });
  $('player').after(line);
  line.append(document.querySelector('.masthead'), $('when'));
  // Tips start from the comment box: ₿ opens the amount, and the comment goes with the tip.
  $('say').after($('own-form'));
  ownSpot.remove();
  $('own-form').before(ownSpot);
  // The balance is a figure, not a link; the buttons say what they do.
  const sum = $('wallet-link');
  sum.removeAttribute('href');
  sum.firstElementChild.textContent = 'Wallet balance';
  sum.lastElementChild.hidden = true;
  $('wallet-page').textContent = 'My browser wallet';
  $('topup').textContent = 'Add test sats';
  $('say-btc').onclick = () => { unlockAudio(); ownForm($('own-form').hidden); };
} else if (AS === 'home') $('money').after($('goal'));
const DEFAULT_PHOTO = '/img/peggy-5-1372.jpg';
$('welcome-photo').src = showPhoto || DEFAULT_PHOTO;
// Closing time ("Cheers", Take it home): the second wide photo, the night's last picture.
$('closing-photo').src = showPhotos.wide2 || showPhoto || DEFAULT_PHOTO;
// Before the set plays, the player shows the artist's photo, like a video's cover picture.
// A wide photo on a wide screen.
const cover = (matchMedia('(orientation: landscape)').matches && showPhotos.wide1) || showPhoto || '/img/fp-32.jpg';
$('player').style.background = `#000 center / cover no-repeat url("${cover}")`;
if (playing) $('player').style.backgroundImage = 'none';
// The words that come from the setup page: redrawn whenever it saves (the demo changes prices live).
// UK time now, as "YYYY-MM-DDTHH:MM", to compare with the show's date and times.
const ukNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
// The line under the name follows the night: the date and both times before; once the stream is live, only what's
// next: the show's start, then when it ends.
function whenLine() {
  const day = show.date ? new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  // The times are UK time: say which, for anyone watching from elsewhere.
  const zone = show.date ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' }).formatToParts(new Date(`${show.date}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value.replace('+0', '') : 'UK time';
  let line;
  if (liveOn) {
    const started = !show.starts || !show.date || ukNow() >= `${show.date}T${show.starts}`;
    line = ['Live now', started ? show.lastOrders && `ends ${show.lastOrders} ${zone}` : `show ${show.starts} ${zone}`];
  } else {
    const times = [show.streams && `stream ${show.streams}`, show.starts && `show ${show.starts}`].filter(Boolean);
    line = [day, times.length && `${times.join(' · ')} ${zone}`];
  }
  const text = line.filter(Boolean).join(' · ');
  if ($('when').textContent !== text) { $('when').textContent = text; doorTop(); }
}
// At the door the photo starts under the words, however many lines the artist's name takes (page coordinates:
// the phone may open the page scrolled, and the poster font may arrive after the first layout).
function doorTop() {
  if (document.body.classList.contains('at-door')) document.body.style.setProperty('--door-top', `${Math.ceil($('when').getBoundingClientRect().bottom + scrollY) + 10}px`);
}
try { history.scrollRestoration = 'manual'; } catch {}
document.fonts?.ready.then(doorTop);
addEventListener('resize', doorTop);
function words() {
  whenLine();
  $('artist-line').textContent = show.artist;
  $('billing').textContent = show.title;
  $('billing').hidden = !show.title;
  $('about').textContent = show.description;
  $('tip').textContent = $('ov-tip').textContent = `Tip ${show.artist || ''} · ${sats(show.tip.price || 0)}`;
  $('tip').disabled = $('ov-tip').disabled = !show.tip.price;
  $('say-tip').textContent = `Send with ${sats(show.tip.price || 0)}`;
}
words();
let shownAt = null;

// The same split as the server's (server/shows.js ticketSplit): with the venue, the drink comes out of the price.
const split = () => {
  const drink = show.drink.mode === 'artist' ? show.drink.price || 0 : 0;
  const artist = show.ticket.price || 0;
  return { artist, drink, total: artist + drink };
};
// The drink failed at the door after the ticket went through: remembered in this browser, so the phone offers it again.
const DUE = `nutpub-drink-due${KEEP}`;
const drinkDue = () => { try { return localStorage.getItem(DUE) === pass; } catch { return false; } };
const owe = (yes) => { try { if (yes) localStorage.setItem(DUE, pass); else localStorage.removeItem(DUE); } catch {} };
const myDoor = () => fetch('/api/door/me', { headers: { 'X-Pass': pass } }).then((r) => r.json()).catch(() => ({}));
let door = TICKET_VIEW ? {} : await myDoor();
const firstStage = await fetch('/api/stage').then((r) => r.json()).catch(() => ({}));
let stage = firstStage.stage || 'doors';
liveOn = !!firstStage.live;
whenLine();
readyLive();

let doorShown = false;
function render() {
  const room = AS === 'room';
  const ticket = !!door.ticket;
  const closed = stage === 'closed' && !TICKET_VIEW;
  const s = split();
  body.dataset.stage = stage;
  // Full picture with the chat over it: the room once the set plays, and always at home.
  body.classList.toggle('immersive', !closed && AS === 'room' && ticket && stage === 'on');
  $('closing').hidden = !closed;
  // A ticket bought while the free drink was off stays a ticket: the drink is only offered again if it failed here.
  $('door').hidden = closed || !room || !show.ticket.on || (ticket && (!room || door.drink || !s.drink || !drinkDue()));
  $('inside').hidden = closed || !room || !ticket || stage !== 'doors';
  // At the door the artist's photo fills the top of the phone; the date and the ticket sit in the bottom half.
  body.classList.toggle('at-door', room && !$('door').hidden);
  body.classList.toggle('test-mint', !!health.mint.test);
  if (body.classList.contains('at-door')) { if (!doorShown) scrollTo(0, 0); doorShown = true; doorTop(); }
  body.classList.toggle('inside-doors', !$('inside').hidden);
  $('player').hidden = closed || (room && (!ticket || stage !== 'on'));
  $('money').hidden = closed || (room && !ticket);
  // In the room the chat opens with the set: at doors the phone is the ticket and the drink.
  $('chat').hidden = closed || (room && !ticket); // at doors the room's phone shows only the goal (styles hide the rest)
  // At home the set plays whenever you press play (the clip, on a loop); in the room it waits for Start the show.
  const live = AS === 'home' ? !closed : stage === 'on';
  $('doors-sign').hidden = AS === 'home' || stage !== 'doors';
  $('live-badge').hidden = stage !== 'on' && !liveOn;
  $('budget-box').hidden = !liveOn || !pays();
  $('live-badge').classList.toggle('on-air', liveOn); // the live light: glows while the artist's stream comes in
  // At home the whole ticket is a button beside the tips (board 2); the ticket box stays for the phone.
  $('whole').hidden = AS !== 'home' || !show.ticket.on || ticket || closed;
  $('whole').textContent = `Online ticket · ${sats(s.artist)}`;
  $('whole-card').hidden = !WALLET_CARD || $('whole').hidden;
  $('price-box').hidden = !pays();
  $('play').disabled = $('big-play').disabled = !live;
  if (!live && playing) stop();

  // At the door: the room's ticket includes the drink; at home, the whole set for the artist's part alone.
  if (!ticket) {
    $('door-title').textContent = room ? 'Ticket' : 'The whole ticket';
    $('ticket-note').textContent = room ? '' : free ? 'Or watch free, with tips.' : 'Or press play and pay as you watch.'; // the ticket page has only its buttons
    $('buy').textContent = room ? `Ticket · ${sats(s.total)}` : `Pay ${sats(s.artist)}`;
    $('door-home').hidden = !room;
    $('door-home').href = `${location.pathname}?as=home`;
  } else {
    $('door-home').hidden = true;
    $('door-title').textContent = 'Your first drink';
    $('ticket-note').textContent = 'The ticket went through; the drink didn’t.';
    $('buy').textContent = `Pay for the drink · ${sats(s.drink)}`;
  }

  // The free drink: a QR with its number only. The bar's page finds the locked token and pours it.
  $('drink').hidden = !door.drink;
  if (door.drink) {
    $('drink-qr').src = `/api/door/drink-qr.svg?id=${door.drink.id}`;
    $('drink-title').textContent = door.drink.poured ? 'Enjoy your pint, cheers!' : 'Get your free drink';
    $('drink-note').textContent = door.drink.poured ? 'One drink per ticket.'
      : `Show this at the bar. ${sats(s.drink)}, locked to the bar’s key.${show.lastOrders ? ` Not poured by ${show.lastOrders}? It goes to ${show.artist || 'the artist'}.` : ''}`;
  }
}

$('whole').onclick = () => $('buy').onclick();
$('say-tip').onclick = () => tip($('tip'));
$('buy').onclick = async () => {
  unlockAudio();
  // Enough in the wallet for what's left to pay? Say so before paying half of it.
  const s = split();
  const due = (door.ticket ? 0 : AS === 'room' ? s.total : s.artist) - (door.ticket ? -s.drink : 0);
  const have = await wallet.balance();
  if (have < due && health.mint.test) {
    // On the test mint, short at the door: fill up by itself and carry on.
    say('Adding test sats…');
    const { id } = await wallet.topup(TOP_UP);
    for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
  } else if (have < due) { $('door-topup').hidden = false; return say(`You need ${sats(due)} and have ${sats(have)}.`); }
  $('buy').disabled = true;
  say('Paying at the door…');
  try {
    let res = door.ticket ? null : await paidFetch('/api/door/ticket');
    if (res && !res.ok) throw new Error(await refusal(res));
    if (AS === 'room' && split().drink) {
      res = await paidFetch('/api/door/drink');
      if (!res.ok) { owe(true); throw new Error(`You’re in, but the drink didn’t go through: ${await refusal(res)}`); }
      owe(false);
    }
    say('');
  } catch (e) {
    say(/insufficient|not enough|balance/i.test(e.message) ? T.empty : e.message);
  }
  door = await myDoor();
  render();
  $('buy').disabled = false;
  balance();
  // At home the ticket is the way in: the set starts at once (this tap lets the browser play sound).
  if (AS === 'home' && door.ticket && !playing) play();
};

// ---- The Pint Signal: the bar never talks to this phone; the phone sees its drink spent at the mint and lights up.
function pint() {
  $('pint-screen').hidden = false;
  setTimeout(() => { $('pint-screen').hidden = true; }, 7000);
}

// ---- Stage lights: three, one by one, then the set (a tap on Play starts the sound: browsers want a tap).
function lights() {
  $('lights').hidden = false;
  $('lights').classList.remove('go');
  void $('lights').offsetWidth;
  $('lights').classList.add('go');
  setTimeout(() => { $('lights').hidden = true; }, 3400);
}

// ---- The live chat. Every message is set as text, never as HTML.
const feed = $('feed');
let lastMsg = 0;
// Short amounts for the goals: 25k, 4.2k, 1.5M.
const short = (n) => (n < 1000 ? String(n) : n < 1e6 ? `${+(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${+(n / 1e6).toFixed(1)}M`);
// Stretch goals: one track from 0 to the last goal, a small notch at each, gold filling along it. Every goal on one line.
let notchesFor = '';
function goal(tipped, goals) {
  const list = [...goals].sort((a, b) => a.at - b.at).slice(0, 3);
  const top = list[list.length - 1];
  $('goal').hidden = $('ov-goal').hidden = !top;
  if (!top) return;
  const next = list.find((x) => tipped < x.at) || top;
  $('goal-sum').textContent = `${short(tipped)} / ${short(next.at)}`;
  $('goal-bar').style.width = `${Math.min(100, (tipped / top.at) * 100)}%`;
  const key = list.map((g) => g.at).join();
  if (key !== notchesFor) { // redrawn only when the goals change
    notchesFor = key;
    $('goal-track').querySelectorAll('.notch').forEach((x) => x.remove());
    for (const g of list.slice(0, -1)) $('goal-track').append(Object.assign(document.createElement('s'), { className: 'notch', style: `left: ${(g.at / top.at) * 100}%` }));
  }
  $('goal-label').replaceChildren(...list.flatMap((g, i) => {
    const el = Object.assign(document.createElement('span'), { className: tipped >= g.at ? 'met' : '', textContent: `${tipped >= g.at ? '✓ ' : ''}${g.label} ${short(g.at)}` });
    return i ? [' · ', el] : [el];
  }));
  $('ov-goal').textContent = `${next.label} · ${short(tipped)} / ${short(next.at)}`;
}
function chat(r) {
  for (const m of r.messages) {
    if (m.id <= lastMsg) continue; // two ticks crossing: already shown
    const li = document.createElement('li');
    li.dataset.id = m.id;
    const who = document.createElement('span');
    who.className = 'from';
    who.textContent = m.who;
    li.append(who, ' ');
    if (m.sats) { // the name first, then what they tipped, in gold
      li.className = 'tipped';
      const amt = document.createElement('b');
      amt.className = 'amt';
      amt.textContent = m.sats.toLocaleString('en-GB');
      li.append(amt, ' ');
    }
    if (m.text) li.append(m.text);
    feed.append(li);
    lastMsg = Math.max(lastMsg, m.id);
  }
  for (const id of r.deleted) feed.querySelector(`[data-id="${id}"]`)?.remove();
  while (feed.children.length > 60) feed.firstElementChild.remove();
  feed.scrollTop = feed.scrollHeight;
  goal(r.tipped, r.goals);
}
// What the message box says goes with the next tip (highlighted), or on its own with Send.
// The words stay in the box until the tip has gone through, so a failed tip loses nothing.
function said() {
  const text = $('say-text').value.trim();
  return text ? { 'X-Message': encodeURIComponent(text) } : {};
}
function sent() {
  $('say-text').value = '';
  setTimeout(() => tick().catch(() => {}), 300);
}
// Return in the comment box while ₿ is open pays the tip with the words (the greyed arrow blocks the form's own Return).
$('say-text').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || $('own-form').hidden) return;
  e.preventDefault();
  if (ownSats()) $('own-form').requestSubmit(); else $('own-sats').focus();
});
$('say').onsubmit = async (e) => {
  e.preventDefault();
  if (!$('own-form').hidden) { // ₿ is open: the words are the tip's message, never a comment on their own
    if (ownSats()) $('own-form').requestSubmit(); else $('own-sats').focus();
    return;
  }
  const text = $('say-text').value.trim();
  if (!text) return;
  const r = await fetch('/api/message', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (r.ok) { $('say-text').value = ''; tick().catch(() => {}); } else say((await r.json().catch(() => ({}))).detail || 'Not sent.');
};

// ---- Every 2 s, one request: the stage, this phone's drink, the chat. (Polling: Cloudflare holds back live streams of events.)
async function tick() {
  const waiting = door.drink && !door.drink.poured; // the phone only needs its drink while the bar hasn't poured it
  const now = await fetch(`/api/tick?after=${lastMsg}${shownAt ? `&shown=${encodeURIComponent(shownAt)}` : ''}${waiting ? '&door=1' : ''}`,
    { headers: { 'X-Pass': pass } }).then((r) => r.json());
  if (shownAt && now.show) { Object.assign(show, now.show); words(); }
  shownAt = now.updated;
  liveOn = !!now.live;
  whenLine();
  readyLive();
  if (now.stage === 'on' && stage !== 'on' && (AS === 'home' || door.ticket)) lights();
  stage = now.stage;
  if (now.door) {
    door = now.door;
    if (door.drink?.poured) pint(); // the bar just poured it: the mint says it's spent (NUT-07)
  }
  if (stage === 'closed') $('change').textContent = `Your change: ${sats(await wallet.balance())}, in this browser.`;
  render();
  chat(now);
}
render();
tick().catch(() => {});
setInterval(() => tick().catch(() => {}), 2000);
