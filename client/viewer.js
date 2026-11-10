// The viewer page: the set, 10 seconds at a time. Each piece's sound is bought just before it plays (NUT-24:
// a 402, paid in the same request from this browser's own wallet); its picture comes with it. Stop paying and it
// stops at once. "Free, with tips" shows play without a 402. The tip button is a 402 of its own.
import { openWallet, walletStep } from './wallet.js';
import { money, satsFrom } from '../server/money.js';

const $ = (id) => document.getElementById(id);
// ?as=home: someone watching at home (the desktop view), with a pass and wallet of their own, apart from the
// phone in the room, even when both are open in one browser (the demo page).
const AS = new URLSearchParams(location.search).get('as') === 'home' ? 'home' : 'room';
// ?view=ticket: the setup page's picture of the ticket page, whatever this browser already holds and whatever the night.
const TICKET_VIEW = new URLSearchParams(location.search).get('view') === 'ticket';
const CLOSING_VIEW = new URLSearchParams(location.search).get('view') === 'closing'; // Takings' picture of the end of the night
const KEEP = AS === 'home' ? '-home' : '';
const BUY_AHEAD = 3; // seconds before a piece starts that it's bought
const PIECE = 10;
const TOP_UP = 150_000; // test sats in every wallet: a ticket, a drink and plenty of tips

// A moderator's link (…#mod=<key>): kept in this browser, then taken out of the address bar so it isn't passed on by
// mistake. The key only moderates: the stream before it opens (free), links, delete, slow mode.
let MOD_KEY = null;
try {
  MOD_KEY = new URLSearchParams(location.hash.slice(1)).get('mod') || localStorage.getItem('nutpub-mod');
  if (MOD_KEY) localStorage.setItem('nutpub-mod', MOD_KEY);
} catch {}
if (/(^|[#&])mod=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
let MOD = null; // { name, slow } once the server knows the key
if (MOD_KEY && top === self) {
  const r = await fetch('/api/mod/me', { headers: { 'X-Mod': MOD_KEY } }).catch(() => null);
  if (r?.ok) MOD = await r.json();
  else if (r?.status === 403) { try { localStorage.removeItem('nutpub-mod'); } catch {} }
}
const modH = () => (MOD ? { 'X-Mod': MOD_KEY } : {});

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

// What just happened. On the home page it fades after 10 s: read once, it needn't stay.
let sayTimer = null;
// `shine`: good news about sats: Bitcoin orange, a shimmer, and it stays 30 s so it gets seen.
const say = (text, shine = false) => {
  clearTimeout(sayTimer);
  $('status').classList.remove('fade');
  $('status').classList.toggle('shine', shine);
  $('status').textContent = text || '';
  if (text && document.body.classList.contains('wallet-card')) {
    sayTimer = setTimeout(() => {
      $('status').classList.add('fade');
      sayTimer = setTimeout(() => { $('status').textContent = ''; $('status').classList.remove('fade', 'shine'); }, 800);
    }, shine ? 30_000 : 10_000);
  }
};
const sats = (n) => `${Number(n).toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;
// ₿ / £ / $: what the page's figures read in, remembered in this browser. Only the reading changes: every payment is in sats.
const SYMBOL = { gbp: '£', usd: '$' };
let rate = null; // from /api/rate; none, and the page stays in sats
let unit = 'btc';
try { unit = localStorage.getItem('nutpub-unit') || 'btc'; } catch {}
const inFiat = () => !!rate && !!SYMBOL[unit];
const fiat = (n) => money(n, rate[unit], SYMBOL[unit]);
const reads = (n) => (inFiat() ? fiat(n) : sats(n));

const [health, { show, photo: showPhoto, photos: showPhotos = {} }] = await Promise.all([
  fetch('/api/health').then((r) => r.json()),
  fetch('/api/show').then((r) => r.json()),
]);
document.title = `${show.artist || show.title || 'The show'} · The NutPub`;
$('billing').textContent = show.title;
$('about').textContent = show.description;
$('about').hidden = !show.description;
const free = show.stream.mode === 'free';
const online = show.stream.mode === 'ticket';
document.body.classList.toggle('no-comments', show.comments === false); // tips stay; the words go // watching from home needs an Online ticket (or a room ticket)
// A stream-only gig (no room tickets): the show's link opens the home view.
// The setup page's phone (view=ticket) follows the same rule, and turns back when room tickets are switched on again.
const homeOnly = !show.ticket.on && show.stream.mode !== 'off';
if (AS === 'room' && homeOnly && (top === self || TICKET_VIEW)) location.replace(`${location.pathname}?as=home${TICKET_VIEW ? '&view=ticket' : ''}`);
if (AS === 'home' && TICKET_VIEW && !homeOnly) location.replace(`${location.pathname}?view=ticket`);
// Free shows: no price and no "This set" (there's nothing to count).
$('price').textContent = free || online ? '' : T.perMinute(show.stream.perMinute);
const tipText = `Tip ${show.artist || ''} · ${sats(show.tip.price || 0)}`.replace('  ', ' ');
$('tip').textContent = $('ov-tip').textContent = tipText;

// ---- This phone's pass: what paid pieces are recorded against. Kept in this browser.
// A saved ticket link (…#ticket=<pass>): this browser takes that pass, ticket and all. After the #, so it never reaches a server log.
const linkedPass = new URLSearchParams(location.hash.slice(1)).get('ticket');
const fromLink = /^[\w-]{8,128}$/.test(linkedPass || '') ? linkedPass : null;
if (linkedPass) history.replaceState(null, '', location.pathname + location.search);
if (fromLink) { try { localStorage.setItem(`nutpub-pass${KEEP}`, fromLink); } catch {} }
async function getPass(fresh = false) {
  if (!fresh && fromLink) return fromLink;
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
let tippedHere = 0; // this browser's tips, all of them (the server keeps the total)
let ticketHere = 0; // what this browser's ticket cost: it counts as support too
let resumeAt = 0; // this pass's first unpaid piece
let liveSpentSoFar = 0;
const me = await fetch('/api/pass/me', { headers: { 'X-Pass': pass } });
if (me.status === 403) pass = await getPass(true);
else ({ spent: spentHere, next: resumeAt, live: liveSpentSoFar, tipped: tippedHere = 0 } = await me.json());
spentHere += liveSpentSoFar;
// The mint's fee on live minutes: it leaves the wallet too, so it counts towards the limit. Only this browser knows it.
let liveFees = 0;
try { liveFees = liveSpentSoFar ? Number(localStorage.getItem(`nutpub-fees${KEEP}`)) || 0 : 0; } catch {}
// What this browser has given tonight: minutes watched and tips. A free stream says so, and asks for a tip.
const meter = () => {
  const given = (free ? 0 : spentHere + liveFees) + tippedHere + ticketHere;
  $('spent-label').textContent = `You've supported ${show.artist || 'the artist'} with`;
  $('spent').textContent = inFiat() ? fiat(given) : T.spent(given);
  $('spent-box').hidden = free && !given;
  $('free-note').hidden = !free;
  $('free-line').textContent = `Tip ${show.artist || 'the artist'} for hosting the live show`;
};
// A tip went through: the server says this browser's new total.
const tipped = (res) => res.clone().json().then((j) => { if (j.total != null) { tippedHere = j.total; meter(); } }).catch(() => {});
meter();

// ---- The wallet (Coco, in this browser).
// Opened in the background: a browser with a long history can take seconds, and the page needn't wait for it.
// Everything that uses the wallet waits for it instead; the balance shows "…" until then.
let realWallet = null;
const walletReady = openWallet(health.mint.url, `nutpub${KEEP}`).then((w) => (realWallet = w));
const wallet = {
  balance: () => walletReady.then((w) => w.balance()),
  pay: (creq) => walletReady.then((w) => w.pay(creq)),
  topup: (n) => walletReady.then((w) => w.topup(n)),
  topupDone: (id) => walletReady.then((w) => w.topupDone(id)),
  on: (event, fn) => { walletReady.then((w) => w.on(event, fn)); },
  get lastFee() { return realWallet?.lastFee || 0; },
};
const balance = async () => {
  const have = await wallet.balance();
  const n = have.toLocaleString('en-GB');
  $('balance').classList.remove('opening');
  $('balance').textContent = inFiat() ? fiat(have) : n;
  const d = document.getElementById('door-balance'); // on the door's ticket box too: you see what you have before you pay
  if (d) d.textContent = n;
};
// Until the wallet answers, say so: an empty balance would look like lost sats.
$('balance').classList.add('opening');
$('balance').textContent = '';
// If it never opens, say so: every wallet button waits for it, and a button that does nothing looks broken.
const walletTrouble = (text) => { $('balance').classList.add('opening'); $('balance').textContent = text; };
let walletFailed = false;
walletReady.catch((e) => { // Safari with Block All Cookies, for one, refuses a site its storage
  walletFailed = true;
  // The error can come wrapped (Coco's own Error with "SecurityError ..." in its message), so read both.
  const blocked = /SecurityError|security context|insecure/i.test(`${e.name} ${e.message}`);
  walletTrouble(blocked ? (/iPhone|iPad/.test(navigator.userAgent)
    ? 'This browser blocks the wallet. In Settings → Apps → Safari → Advanced, turn off Block All Cookies, then reload. Or use another browser.'
    : 'This browser blocks the wallet: it may be set to block all cookies. Allow them for this site and reload, or use another browser.')
    : `Your wallet didn't open: ${e.message}`);
});
setTimeout(() => { if (!realWallet && !walletFailed) walletTrouble(`Wallet stuck: ${walletStep.now}. Try reloading.`); }, 20_000);
balance().catch(() => {});
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
  if (!realWallet) say('Your wallet is still opening. One moment…');
  try {
    const { id } = await wallet.topup(TOP_UP);
    for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
    await balance();
    say(`+${TOP_UP.toLocaleString('en-GB')} test sats.`, true);
  } catch (e) { say(e.message); }
  $('topup').disabled = false;
};

// ---- NUT-24: ask; on a 402, pay the creqA from this wallet and ask again with the cashuB.
// Safe retry (if on): a lost reply is asked for again with the same token, which the server answers without
// charging twice.
async function paidFetch(url, extra = {}) {
  const headers = { 'X-Pass': pass, ...modH(), ...extra };
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
  if (on) say(''); // playing again: the "Stopped" line goes
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
const pays = () => !free && !online && !door.ticket && !MOD; // a mod watches free
const budget = () => Number($('budget').value) || 0;
try { $('budget').value = localStorage.getItem(`nutpub-budget${KEEP}`) || ''; } catch {}
$('budget').value ||= Math.max(500, (show.stream.perMinute || 0) * 6);
$('budget').oninput = () => { try { localStorage.setItem(`nutpub-budget${KEEP}`, $('budget').value); } catch {} };

const SCREEN = Math.random().toString(36).slice(2); // this page, this time: a ticket opens one screen at a time
// One token: free for a ticket or a free show, otherwise a 402. Returns its reply, or null with the picture stopped.
async function renew(mine, first) {
  if (pays() && liveSpent + liveFees + show.stream.perMinute > budget()) { stop(T.budget(liveSpent + liveFees)); return null; }
  const res = await paidFetch(`/api/live/token${first ? '?start=1' : ''}`, { 'X-Screen': SCREEN });
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
      reply = await renew(mine, !started);
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
let sidewaysOut = false; // a sideways phone starts full screen; the button steps out to the page (comments, wallet) until it's turned again
// Where the tip's amount lives off full screen (under the comment box, or under the money buttons).
const ownSpot = document.createComment('own-form');
$('own-form').before(ownSpot);
const layout = () => {
  const full = wantFull || (sideways.matches && !sidewaysOut);
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
sideways.addEventListener('change', () => { sidewaysOut = false; layout(); });
layout();
$('full').onclick = () => {
  if (sideways.matches && !wantFull) { sidewaysOut = !sidewaysOut; layout(); return; }
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
// With a mouse, a click on the picture plays and pauses it, as on YouTube (a phone's tap keeps the old way).
$('player').addEventListener('click', (e) => {
  const onPicture = e.target === $('player') || e.target.tagName === 'VIDEO';
  if (onPicture && e.pointerType === 'mouse' && !$('play').disabled) return toggle();
  if (e.target.tagName === 'VIDEO') vids.find((v) => v.classList.contains('on') || v.src)?.play().catch(() => {});
});

// ---- The tip: one tap pays (the price is on the button). Off while paying, so a double tap pays once.
async function tip(button) {
  unlockAudio();
  if (button.disabled) return;
  button.disabled = true;
  try {
    const res = await paidFetch('/api/tip', said());
    if (res.ok) { sent(); tipped(res); }
    say(res.ok ? T.tipDone(show.tip.label || 'Tip') : await refusal(res), res.ok);
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
const ownSats = () => { const v = $('own-sats').value; const n = inFiat() ? satsFrom(v, rate[unit]) : Number(v); return Number.isInteger(n) && n >= MIN_TIP && n <= 1_000_000 ? n : 0; };
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
    say(res.ok ? T.ownDone(n) : await refusal(res), res.ok);
    if (res.ok) { sent(); tipped(res); ownForm(false); }
  } catch (err) {
    say(/insufficient|not enough|balance/i.test(err.message) ? T.empty : err.message);
  }
  $('own-pay').disabled = !ownSats();
  balance();
};

// ---- The night: the door, the welcome and the free drink, the stage (doors, open, on, closed), the live chat.
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
  document.querySelector('.purse').append($('goal'));
  // The show's line under the picture, as on a video site: the artist and the date.
  const line = Object.assign(document.createElement('div'), { className: 'show-line' });
  $('player').after(line);
  // What just happened ("Stopped. Nothing more is charged.") on the same line, from the right.
  line.append(document.querySelector('.masthead'), $('when'), $('status'));
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
  // All the goals met: a ₿ button by them opens the tip box under the comment, as ₿ there does.
  $('goal-more').onclick = () => { unlockAudio(); ownForm(true); $('say').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); $('own-sats').focus({ preventScroll: true }); };
} else if (AS === 'home') $('money').after($('goal'));
const DEFAULT_PHOTO = '/img/peggy-5-1372.jpg';
$('welcome-photo').src = showPhoto || DEFAULT_PHOTO;
if (AS === 'home') for (const a of document.querySelectorAll('a[href="/wallet.html"]')) a.href = '/wallet.html?as=home'; // its own wallet
// Closing time ("Cheers", Take it home): the second wide photo, the night's last picture.
$('closing-photo').src = showPhotos.wide2 || showPhoto || DEFAULT_PHOTO;
// Before the set plays, the player shows the artist's photo, like a video's cover picture.
// A wide photo on a wide screen.
const WIDE = matchMedia('(orientation: landscape)');
let cover;
const setCover = () => {
  cover = (WIDE.matches && showPhotos.wide1) || showPhoto || '/img/fp-32.jpg';
  $('player').style.background = `#000 center / cover no-repeat url("${cover}")`;
  if (playing) $('player').style.backgroundImage = 'none';
};
setCover();
// A window dragged narrow (or a phone turned) swaps to the tall photo, and back.
let wasWide = WIDE.matches;
addEventListener('resize', () => { if (WIDE.matches === wasWide) return; wasWide = WIDE.matches; setCover(); backdrop(playing); });
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
  // One start time (10 Nov): the stream's.
  if (liveOn) line = ['Live now', show.lastOrders && `ends ${show.lastOrders} ${zone}`];
  else line = [day, show.streams && `starts ${show.streams} ${zone}`];
  // Each part stays whole on a narrow phone: the line breaks between parts, never inside "show starts 21:30".
  const text = line.filter(Boolean).map((x) => String(x).replace(/ /g, '\u00a0')).join(' · ');
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
  $('tip').textContent = $('ov-tip').textContent = `Tip ${show.artist || ''} · ${reads(show.tip.price || 0)}`;
  $('tip').disabled = $('ov-tip').disabled = !show.tip.price;
  $('say-tip').textContent = `Send with ${reads(show.tip.price || 0)}`;
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
ticketHere = door.ticketSats || 0;
meter();
// The server's stage: doors, open, on, closed. 'open' is still the doors in the room (the phone is the ticket until
// Start the show), but at home the stream is public: before it, a countdown and no picture.
let opened = false;
let opensAt = null;
let skew = 0; // the server's clock less this phone's, so every countdown ends together
function takeStage(s) {
  opened = s.stage === 'open' || s.stage === 'on';
  opensAt = s.opensAt || null;
  if (s.now) skew = s.now - Date.now();
  return s.stage === 'open' ? 'doors' : s.stage || 'doors';
}
const firstStage = await fetch('/api/stage').then((r) => r.json()).catch(() => ({}));
let stage = takeStage(firstStage);
liveOn = !!firstStage.live && (opened || !!MOD); // a sound check before the start time is live only for the mods
whenLine();
readyLive();

let doorShown = false;
function render() {
  const room = AS === 'room';
  const ticket = !!door.ticket;
  const closed = (stage === 'closed' && !TICKET_VIEW) || CLOSING_VIEW;
  const s = split();
  body.dataset.stage = stage;
  // Full picture with the chat over it: the room once the set plays, and always at home.
  // The door check: late, after Start the show, the QR comes first, then the set.
  const doorCheck = !!(show.ticket.on && show.door?.on);
  const atDoor = room && ticket && door.ticketKind === 'room' && doorCheck && !door.checkedAt && stage === 'on';
  body.classList.toggle('immersive', !closed && AS === 'room' && ticket && stage === 'on' && !atDoor);
  $('closing').hidden = !closed;
  // A ticket bought while the free drink was off stays a ticket: the drink is only offered again if it failed here.
  $('door').hidden = closed || !room || !show.ticket.on || (ticket && (!room || door.drink || !s.drink || !drinkDue()));
  $('inside').hidden = closed || !room || !ticket || (stage !== 'doors' && !atDoor);
  // Bought ahead of the night: the page is only the confirmation (the photo, the receipt, the link). The tips, goals,
  // chat and wallet come on the gig day, or as soon as the stream or the show is on.
  const confirmed = ticket && !closed && !TICKET_VIEW && top === self && stage === 'doors' && !liveOn && show.date !== ukNow().slice(0, 10);
  body.classList.toggle('confirmed', confirmed);
  $('save-ticket').hidden = !confirmed;
  if (confirmed) receipt();
  // At the door the artist's photo fills the top of the phone; the date and the ticket sit in the bottom half.
  body.classList.toggle('at-door', room && !$('door').hidden);
  body.classList.toggle('test-mint', !!health.mint.test);
  if (body.classList.contains('at-door')) { if (!doorShown) scrollTo(0, 0); doorShown = true; doorTop(); }
  body.classList.toggle('inside-doors', !$('inside').hidden);
  $('player').hidden = closed || (room && (!ticket || stage !== 'on' || atDoor));
  $('money').hidden = closed || (room && !ticket);
  // In the room the chat opens with the set: at doors the phone is the ticket and the drink.
  $('chat').hidden = closed || (room && !ticket); // at doors the room's phone shows only the goal (styles hide the rest)
  // At home the set plays whenever you press play (the clip, on a loop); in the room it waits for Start the show.
  const live = AS === 'home' ? !closed && !confirmed && (opened || !!MOD) : stage === 'on';
  const counting = AS === 'home' && !closed && !confirmed && !opened && !TICKET_VIEW && !MOD;
  $('countdown').hidden = !counting;
  body.classList.toggle('counting', counting);
  countdown();
  $('doors-sign').hidden = AS === 'home' || stage !== 'doors';
  $('live-badge').hidden = stage !== 'on' && !liveOn;
  $('budget-box').hidden = !liveOn || !pays();
  $('live-badge').classList.toggle('on-air', liveOn); // the live light: glows while the artist's stream comes in
  // At home the whole ticket is a button beside the tips (board 2); the ticket box stays for the phone.
  $('whole').hidden = AS !== 'home' || !online || !show.online?.price || ticket || closed;
  $('whole').textContent = `Online ticket · ${sats(show.online?.price)}`;
  $('whole-card').hidden = !WALLET_CARD || $('whole').hidden;
  $('price-box').hidden = !pays();
  $('play').disabled = $('big-play').disabled = !live;
  if (!live && playing) stop();

  // At the door: the room's ticket includes the drink; at home, the whole set for the artist's part alone.
  if (!ticket) {
    $('door-title').textContent = room ? 'Ticket' : 'The whole ticket';
    $('ticket-note').textContent = room ? '' : free ? 'Or watch free, with tips.' : 'Or press play and pay as you watch.'; // the ticket page has only its buttons
    $('buy').textContent = room ? `Ticket · ${sats(s.total)}` : `Pay ${sats(show.online?.price || 0)}`;
    if (room && door.soldOut) { $('buy').textContent = 'Sold out'; $('buy').disabled = true; }
    $('door-home').hidden = !room || show.stream.mode === 'off';
    $('door-home').href = `${location.pathname}?as=home`;
  } else {
    $('door-home').hidden = true;
    $('door-title').textContent = 'Your first drink';
    $('ticket-note').textContent = 'The ticket went through; the drink didn’t.';
    $('buy').textContent = `Pay for the drink · ${sats(s.drink)}`;
  }

  // The door's QR, on the gig day (a QR weeks ahead would need a second device to show it). Scanned once, the page says
  // so by itself.
  const passOn = room && doorCheck && door.ticketKind === 'room' && !confirmed && !closed && !TICKET_VIEW && !!door.code;
  $('door-pass').hidden = !passOn;
  if (passOn) {
    const inRoom = !!door.checkedAt;
    $('door-show').hidden = inRoom;
    $('door-pass-title').textContent = inRoom ? 'You’re in' : 'Your ticket';
    $('door-pass-note').textContent = inRoom ? '· enjoy the night' : '';
    if (!$('door-qr').src.includes(door.code)) $('door-qr').src = `/api/door/ticket-qr.svg?code=${door.code}`;
    // Scanned while the QR is open: it says so, then closes by itself.
    if (inRoom && !$('door-screen').hidden && $('door-in').hidden) {
      $('door-in').hidden = false; $('door-qr').hidden = true; $('door-small').textContent = 'Enjoy the night.';
      setTimeout(() => { $('door-screen').hidden = true; }, 3000);
    }
  }

  // The free drink: a QR with its number only. The bar's page finds the locked token and pours it.
  $('drink').hidden = !door.drink || !s.drink; // the drink is off until after 27 Nov: a drink bought before stays out of sight
  if (door.drink) {
    $('drink-qr').src = `/api/door/drink-qr.svg?id=${door.drink.id}`;
    $('drink-title').textContent = door.drink.poured ? 'Enjoy your pint, cheers!' : 'Get your free drink';
    $('drink-note').textContent = door.drink.poured ? 'One drink per ticket.'
      : `Show this at the bar. ${sats(s.drink)}, locked to the bar’s key.${show.lastOrders ? ` Not poured by ${show.lastOrders}? It goes to ${show.artist || 'the artist'}.` : ''}`;
  }
}

// The ticket's QR, full screen: big and plain, so the door's camera reads it at once.
$('door-show').onclick = () => {
  $('door-artist').textContent = show.artist || '';
  $('door-when').textContent = [shortDay(show.date && `${show.date}T12:00:00Z`), show.streams || show.starts].filter(Boolean).join(' · ');
  $('door-in').hidden = true; $('door-qr').hidden = false; $('door-small').textContent = 'Show this at the door.';
  $('door-screen').hidden = false;
  $('door-close').focus();
};
$('door-close').onclick = () => { $('door-screen').hidden = true; };
$('whole').onclick = () => $('buy').onclick();
$('say-tip').onclick = () => tip($('tip'));
$('buy').onclick = async () => {
  unlockAudio();
  // Enough in the wallet for what's left to pay? Say so before paying half of it.
  const s = split();
  const due = (door.ticket ? 0 : AS === 'room' ? s.total : show.online?.price || 0) - (door.ticket ? -s.drink : 0);
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
    let res = door.ticket ? null : await paidFetch(AS === 'home' ? '/api/door/ticket?as=home' : '/api/door/ticket');
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
  ticketHere = door.ticketSats || 0;
  meter();
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

// ---- The countdown to the start time, on the artist's picture: days, then hours, then minutes and seconds.
let cdTimer = null;
let cdShape = '';
const pad = (v) => String(v).padStart(2, '0');
function countdown() {
  const box = $('countdown');
  if (box.hidden) { clearInterval(cdTimer); cdTimer = null; return; }
  cdTimer ??= setInterval(countdown, 250);
  const left = opensAt ? Math.ceil(opensAt - (Date.now() + skew) / 1000) : null;
  let units = null;
  if (left > 0) {
    const d = Math.floor(left / 86400), h = Math.floor(left / 3600) % 24, m = Math.floor(left / 60) % 60, sec = left % 60;
    units = d ? [[d, d === 1 ? 'day' : 'days'], [pad(h), 'hrs'], [pad(m), 'min']]
      : h ? [[pad(h), 'hrs'], [pad(m), 'min'], [pad(sec), 'sec']] : [[pad(m), 'min'], [pad(sec), 'sec']];
  }
  const shape = units ? units.map((u) => u[1]).join() : left === null ? 'soon' : 'now';
  if (shape !== cdShape) { // a new layout: build it once, then only the numbers change
    cdShape = shape;
    const digits = $('cd-digits');
    if (units) {
      digits.replaceChildren(...units.flatMap(([, label], i) => {
        const unit = Object.assign(document.createElement('span'), { className: 'cd-unit' });
        unit.append(document.createElement('b'), Object.assign(document.createElement('small'), { textContent: label }));
        return i ? [Object.assign(document.createElement('span'), { className: 'cd-sep', textContent: ':', ariaHidden: 'true' }), unit] : [unit];
      }));
    } else digits.replaceChildren(Object.assign(document.createElement('span'), { className: 'cd-soon', textContent: left === null ? 'Starting soon' : 'Starting now' }));
    $('cd-label').hidden = !units;
    $('cd-when').textContent = opensAt ? `${new Date(opensAt * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} your time` : '';
  }
  if (units) {
    const bs = $('cd-digits').querySelectorAll('b');
    units.forEach(([v], i) => {
      if (bs[i].textContent === String(v)) return;
      bs[i].textContent = v;
      bs[i].classList.remove('tick'); void bs[i].offsetWidth; bs[i].classList.add('tick');
    });
    box.setAttribute('aria-label', `Live in ${units.map(([v, l]) => `${Number(v)} ${l}`).join(' ')}`);
  } else box.setAttribute('aria-label', left === null ? 'Starting soon' : 'Starting now');
  box.classList.toggle('final', left !== null && left > 0 && left <= 60);
  box.classList.toggle('last10', left !== null && left > 0 && left <= 10);
  box.classList.toggle('now', left !== null && left <= 0);
}

// ---- The live chat. Every message is set as text, never as HTML.
const feed = $('feed');
let lastMsg = 0;
// Short amounts for the goals: 25k, 4.2k, 1.5M.
const short = (n) => (n < 1000 ? String(n) : n < 1e6 ? `${+(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${+(n / 1e6).toFixed(1)}M`);
// Stretch goals: one track from 0 to the last goal, a small notch at each, gold filling along it. Every goal on one line.
let notchesFor = '';
let lastGoal = null; // redrawn when ₿ / £ / $ changes
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
const WIDE_CARD = matchMedia('(min-width: 900px)');
function goal(tipped, goals, thanks) {
  // Desktop has the room for whole figures (25,000 sats); a phone gets 25k.
  lastGoal = [tipped, goals, thanks];
  const fiatOn = inFiat();
  const fig = fiatOn ? fiat : WIDE_CARD.matches ? (n) => Number(n).toLocaleString('en-GB') : short;
  const word = fiatOn ? '' : ' sats';
  const list = [...goals].sort((a, b) => a.at - b.at).slice(0, 3);
  const top = list[list.length - 1];
  $('goal').hidden = $('ov-goal').hidden = !top;
  const spot = top ? $('goal') : $('wallet-link'); // the switch sits by the goal figure, or by the balance on a gig with no goals
  if ($('unit') && $('unit').parentNode !== spot) spot.append($('unit'));
  if (!top) return;
  const next = list.find((x) => tipped < x.at) || top;
  const allMet = tipped >= top.at;
  $('goal-sum').textContent = allMet
    ? `${fig(tipped)}${word} · all goal${list.length > 1 ? 's' : ''} met`
    : `${fig(tipped)} / ${fig(next.at)}${WIDE_CARD.matches ? word : ''}`;
  $('goal-more-row').hidden = !allMet; // the goals are done, the tips needn't be
  $('goal-label').hidden = allMet; // and the list of what they were folds away
  // Every goal met and the artist wrote a thank-you: the message instead of the bar.
  const done = tipped >= top.at && !!thanks;
  $('goal-thanks').hidden = !done;
  $('goal-thanks').textContent = thanks || '';
  $('goal-track').hidden = $('goal-sum').hidden = done;
  $('goal-bar').style.width = `${Math.min(100, (tipped / top.at) * 100)}%`;
  const key = list.map((g) => g.at).join();
  if (key !== notchesFor) { // redrawn only when the goals change
    notchesFor = key;
    $('goal-track').querySelectorAll('.notch').forEach((x) => x.remove());
    for (const g of list) {
      const mic = Object.assign(document.createElement('s'), { className: 'notch mic', title: g.label });
      mic.style.left = `${(g.at / top.at) * 100}%`;
      mic.dataset.at = g.at;
      mic.innerHTML = MIC; // our own fixed icon, never the artist's text
      $('goal-track').append(mic);
    }
  }
  $('goal-track').querySelectorAll('.mic').forEach((m) => m.classList.toggle('met', tipped >= Number(m.dataset.at)));
  $('goal-label').replaceChildren(...list.flatMap((g, i) => {
    const el = Object.assign(document.createElement('span'), { className: tipped >= g.at ? 'met' : '', textContent: `${tipped >= g.at ? '✓ ' : ''}${g.label} ${fig(g.at)}` });
    return i ? [' · ', el] : [el];
  }));
  const ov = fiatOn ? fiat : short;
  $('ov-goal').textContent = allMet ? `All goals met · ${ov(tipped)}` : `${next.label} · ${ov(tipped)} / ${ov(next.at)}`;
}
// A mod's links: http(s) only, opened in a new tab, the rest of the words as text.
const LINKS = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|uk|me|app|xyz|link|ly|gg|tv|fm|shop|store|info|biz|music|band|live|events?)\b(?:\/\S*)?/gi;
function withLinks(text) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(LINKS)) {
    const url = m[0].replace(/[.,!?;:)\]]+$/, '');
    out.push(text.slice(at, m.index));
    const a = Object.assign(document.createElement('a'), { href: /^https?:\/\//i.test(url) ? url : `https://${url}`, textContent: url, target: '_blank', rel: 'noopener noreferrer nofollow ugc' });
    out.push(a);
    at = m.index + url.length;
  }
  out.push(text.slice(at));
  return out.filter((x) => x !== '');
}
// The mod's strip over the chat (their name, slow mode), and the line guests see while slow mode is on.
function modBar(slow) {
  $('slow-note').hidden = !slow || !!MOD;
  $('mod-bar').hidden = !MOD;
  if (!MOD) return;
  $('mod-who').textContent = `${MOD.icon || ''} ${MOD.name} · Mod`.trim();
  $('pin-btn').hidden = !MOD.main;
  $('slow-btn').textContent = `Slow mode · ${slow ? 'on' : 'off'}`;
  $('slow-btn').setAttribute('aria-pressed', !!slow);
  $('mod-say').textContent = !opened && stage !== 'closed' ? 'Viewers see the countdown: you see the stream already.' : '';
}
// The pinned message, beside "Live chat": the artist's (Gig Set Up) or the main mod's. Links work in it.
let pinNow = null;
function pin(text = '') {
  if (text === pinNow) return;
  pinNow = text;
  $('pin').hidden = !text;
  $('pin-text').replaceChildren(...withLinks(text));
  $('pin').title = text;
}
$('pin-btn').onclick = async () => {
  const text = prompt('Pinned message, over the chat (140 characters; links work). Empty it to take it down.', pinNow || '');
  if (text === null) return;
  const r = await fetch('/api/mod/pin', { method: 'POST', headers: { ...modH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (r.ok) pin((await r.json()).pin); else say((await r.json().catch(() => ({}))).detail || 'Not pinned.');
};
$('slow-btn').onclick = async () => {
  const on = $('slow-btn').getAttribute('aria-pressed') !== 'true';
  const r = await fetch('/api/mod/slow', { method: 'POST', headers: { ...modH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) });
  if (r.ok) modBar((await r.json()).slow); else say('Slow mode not changed: is your mod link still on?');
};
function chat(r) {
  for (const m of r.messages) {
    if (m.id <= lastMsg) continue; // two ticks crossing: already shown
    const li = document.createElement('li');
    li.dataset.id = m.id;
    const who = document.createElement('span');
    who.className = 'from';
    who.textContent = m.who;
    li.append(who, ' ');
    if (m.mod) { // the name first, then the artist's icon for them and the Mod tag
      if (m.icon) li.append(Object.assign(document.createElement('span'), { className: `mod-icon${m.icon === '₿' ? ' btc' : ''}`, textContent: m.icon }), ' ');
      li.append(Object.assign(document.createElement('span'), { className: 'mod-tag', textContent: 'Mod' }), ' ');
    }
    if (m.sats) { // the name first, then what they tipped, in gold
      li.className = 'tipped';
      const amt = document.createElement('b');
      amt.className = 'amt';
      amt.dataset.sats = m.sats;
      amt.textContent = inFiat() ? fiat(m.sats) : m.sats.toLocaleString('en-GB');
      li.append(amt, ' ');
    }
    if (m.mod) li.classList.add('mod');
    if (m.text) li.append(...(m.mod ? withLinks(m.text) : [m.text])); // only a mod's links are links
    if (MOD) {
      const del = Object.assign(document.createElement('button'), { type: 'button', className: 'del', textContent: '×', title: 'Delete this message' });
      del.setAttribute('aria-label', 'Delete this message');
      del.onclick = async () => {
        const r = await fetch(`/api/mod/messages/${m.id}`, { method: 'DELETE', headers: modH() });
        if (r.ok) li.remove(); else say('Not deleted: is your mod link still on?');
      };
      li.append(del);
    }
    feed.append(li);
    lastMsg = Math.max(lastMsg, m.id);
  }
  for (const id of r.deleted) feed.querySelector(`[data-id="${id}"]`)?.remove();
  modBar(r.slow);
  pin(r.pin);
  while (feed.children.length > 60) feed.firstElementChild.remove();
  feed.scrollTop = feed.scrollHeight;
  goal(r.tipped, r.goals, r.thanks);
}
// Full screen on a phone: the keyboard covers the tip box (sideways it leaves only a strip), so while typing the box
// goes to the top of the part still visible, and the bars get out of its way.
const vv = window.visualViewport;
function tipAboveKeyboard() {
  const typing = body.classList.contains('full') && document.activeElement === $('own-sats') && matchMedia('(pointer: coarse)').matches;
  body.classList.toggle('tip-typing', typing);
  $('own-form').style.top = typing ? `${(vv?.offsetTop || 0) + 8}px` : '';
}
$('own-sats').addEventListener('focus', () => { tipAboveKeyboard(); setTimeout(tipAboveKeyboard, 350); });
$('own-sats').addEventListener('blur', tipAboveKeyboard);
vv?.addEventListener('resize', tipAboveKeyboard);
vv?.addEventListener('scroll', tipAboveKeyboard);
// ---- Save your ticket: it lives in this browser, which can forget it after a week away. The link brings it back, on any device.
if (AS === 'home') document.querySelector('.bottom').append($('save-ticket'));
else $('welcome').append($('save-ticket')); // in the room: over the photo
const ticketLink = () => `${location.origin}${location.pathname}${AS === 'home' ? '?as=home' : ''}#ticket=${pass}`;
const shortDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '');
const gigLine = () => [show.artist, shortDay(show.date && `${show.date}T12:00:00Z`), show.streams || show.starts].filter(Boolean).join(' · ');
// The card is the receipt: what it's for and what was paid. Paid amounts stay in sats, whatever the page reads in.
function receipt() {
  const lines = [gigLine(), `${door.ticketKind === 'home' ? 'Online ticket' : 'Room ticket'} · ${sats(door.ticketSats)}`, door.ticketAt ? `Paid ${shortDay(door.ticketAt)}` : ''].filter(Boolean);
  $('receipt').replaceChildren(...lines.flatMap((l, i) => (i ? [document.createElement('br'), l] : [l])));
}
$('save-link').onclick = async () => {
  const url = ticketLink();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) return await navigator.share({ title: 'My ticket', text: `My ticket: ${gigLine()}`, url });
    await navigator.clipboard.writeText(url);
    $('save-link').textContent = 'Link copied ✓';
  } catch { /* the share sheet was closed */ }
};
// ---- The ₿ / £ / $ switch: £ and $ first, ₿ to their right.
const unitBox = Object.assign(document.createElement('span'), { className: 'unit', id: 'unit' });
unitBox.setAttribute('role', 'group');
unitBox.setAttribute('aria-label', 'Show amounts in');
unitBox.innerHTML = '<span><small>Pounds</small><button type="button" data-unit="gbp" aria-label="Pounds">£</button></span><span><small>Dollars</small><button type="button" data-unit="usd" aria-label="Dollars">$</button></span><span><small>Bitcoin</small><button type="button" data-unit="btc" aria-label="Sats">₿</button></span>';
$('wallet-link').append(unitBox);
let ownMode = 'btc';
function drawUnit() {
  const mode = inFiat() ? unit : 'btc';
  for (const b of unitBox.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', b.dataset.unit === mode);
    if (b.dataset.unit !== 'btc') b.disabled = !rate; // no real rate: sats only
  }
  const label = document.querySelector('#balance + span'); // "test sats", beside a figure that's now in £
  if (label) label.hidden = WALLET_CARD || mode !== 'btc';
  balance().catch(() => {});
  meter();
  words();
  if (lastGoal) goal(...lastGoal);
  for (const a of feed.querySelectorAll('.amt')) a.textContent = inFiat() ? fiat(Number(a.dataset.sats)) : Number(a.dataset.sats).toLocaleString('en-GB');
  if (mode === ownMode) return;
  // The tip box takes pounds or dollars; its button still says the sats that will be paid.
  ownMode = mode;
  const box = $('own-sats');
  box.value = '';
  if (mode === 'btc') {
    Object.assign(box, { min: 21, max: 1_000_000, step: 1, inputMode: 'numeric', placeholder: '21 sats or more' });
    box.setAttribute('aria-label', 'Tip amount in sats, 21 or more');
  } else {
    let pence = 1;
    while (satsFrom(pence / 100, rate[mode]) < MIN_TIP) pence++;
    box.removeAttribute('max');
    Object.assign(box, { min: pence / 100, step: 0.01, inputMode: 'decimal', placeholder: `${SYMBOL[mode]}${(pence / 100).toFixed(2)} or more` });
    box.setAttribute('aria-label', `Tip amount in ${mode === 'gbp' ? 'pounds' : 'dollars'}`);
  }
  box.oninput();
}
unitBox.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  e.preventDefault(); // it can sit inside the wallet link
  unit = b.dataset.unit;
  try { localStorage.setItem('nutpub-unit', unit); } catch {}
  drawUnit();
};
addEventListener('storage', (e) => { if (e.key === 'nutpub-unit' && e.newValue) { unit = e.newValue; drawUnit(); } }); // the page's other frames follow
async function readRate() {
  try {
    const r = await (await fetch('/api/rate')).json();
    rate = r.source !== 'fixed' && r.gbp > 0 && r.usd > 0 ? r : null; // the fixed rough figure is for setup, not for telling people what they hold
  } catch { /* keep the last one */ }
  drawUnit();
}
drawUnit();
readRate();
setInterval(readRate, 10 * 60_000);
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
  const r = await fetch('/api/message', { method: 'POST', headers: { 'X-Pass': pass, ...modH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (r.ok) { $('say-text').value = ''; tick().catch(() => {}); } else say((await r.json().catch(() => ({}))).detail || 'Not sent.');
};

// ---- One request, as often as the server says (every 2 s on the night, once a minute before it; not at all from a
// hidden tab): the stage, this phone's drink, the chat. (Polling: Cloudflare holds back live streams of events.)
let tickEvery = 2;
let tickTimer = null;
function nextTick() {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(() => {
    if (document.hidden) nextTick();
    else tick().catch(() => {}).finally(nextTick);
  }, tickEvery * 1000);
}
async function tick() {
  // The phone only needs its door state while the door hasn't scanned it, or the bar hasn't poured its drink.
  const waiting = (show.door?.on && door.ticketKind === 'room' && !door.checkedAt) || (door.drink && !door.drink.poured);
  const now = await fetch(`/api/tick?after=${lastMsg}${shownAt ? `&shown=${encodeURIComponent(shownAt)}` : ''}${waiting ? '&door=1' : ''}`,
    { headers: { 'X-Pass': pass } }).then((r) => r.json());
  if (shownAt && now.show) { Object.assign(show, now.show); words(); }
  shownAt = now.updated;
  tickEvery = now.every || 2;
  const next = takeStage(now);
  liveOn = !!now.live && (opened || !!MOD);
  whenLine();
  readyLive();
  stage = next;
  if (now.door) {
    const pouredBefore = door.drink?.poured;
    door = { ...door, ...now.door };
    if (door.drink?.poured && !pouredBefore) pint(); // the bar just poured it: the mint says it's spent (NUT-07)
  }
  if (stage === 'closed' && playing) stop(''); // the night is over: nobody goes on paying for a hidden player
  if (stage === 'closed' || CLOSING_VIEW) {
    const left = await wallet.balance();
    $('change').textContent = left ? `You have ${sats(left)} left in this temp browser wallet. Move them into your Cashu/Lightning wallet. Best done now: this browser will forget them after 7 days. Permanently.` : '';
    $('take-home').hidden = !left;
  }
  render();
  chat(now);
}
render();
document.body.classList.add('ready'); // the page shows once it knows what to show (no flash of Doors before the ticket)
tick().catch(() => {}).finally(nextTick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick().catch(() => {}).finally(nextTick); });
