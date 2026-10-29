// The viewer page: the set, 10 seconds at a time. Each piece's sound is bought just before it plays (NUT-24:
// a 402, paid in the same request from this browser's own wallet); its picture comes with it. Stop paying and it
// stops at once. "Free, with tips" shows play without a 402. The tip button is a 402 of its own.
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
// ?as=home: someone watching at home (the desktop view), with a pass and wallet of their own, apart from the
// phone in the room, even when both are open in one browser (the demo page).
const AS = new URLSearchParams(location.search).get('as') === 'home' ? 'home' : 'room';
const KEEP = AS === 'home' ? '-home' : '';
const BUY_AHEAD = 3; // seconds before a piece starts that it's bought
const PIECE = 10;
const TOP_UP = 150_000; // test sats in every wallet: a ticket, a drink and plenty of tips

// Every line this page says, in one place (the EN/DE table comes on the languages evening).
const T = {
  play: 'Play', stop: 'Stop',
  perPiece: (n) => `${n} sat${n === 1 ? '' : 's'} per 10 seconds`,
  full: 'Full screen', exitFull: 'Leave full screen',
  spent: (n) => `This set: ${n} sat${n === 1 ? '' : 's'}`,
  stopped: 'Stopped. Nothing more is charged.',
  empty: 'Your wallet’s empty. Top it up to keep playing.',
  tipDone: (label) => `${label}: paid. Thank you!`,
  ownTip: 'Tip', ownPay: (n) => `Tip ${n} sat${n === 1 ? '' : 's'}`, ownDone: (n) => `${n} sat${n === 1 ? '' : 's'} tipped. Thank you!`,
  retrying: 'Lost the reply. Asking again with the same payment…',
  retried: 'Same payment, same 10 seconds. Charged once.',
  notReady: 'The show isn’t ready yet.',
  tapVideo: 'Tap the picture to start it.',
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

const [health, { show, photo: showPhoto }] = await Promise.all([
  fetch('/api/health').then((r) => r.json()),
  fetch('/api/show').then((r) => r.json()),
]);
document.title = show.title ? `${show.title} · The NutPub` : 'The NutPub';
$('billing').textContent = show.title;
$('about').textContent = show.description;
$('about').hidden = !show.description;
document.body.dataset.shape = show.shape;
const free = show.stream.mode === 'free';
// Free shows: no price and no "This set" (there's nothing to count).
$('price').textContent = free ? '' : T.perPiece(show.stream.price);
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
const me = await fetch('/api/pass/me', { headers: { 'X-Pass': pass } });
if (me.status === 403) pass = await getPass(true);
else ({ spent: spentHere, next: resumeAt } = await me.json());
const meter = () => { $('spent').textContent = free ? '' : T.spent(spentHere); };
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
  const list = showPhoto ? [showPhoto] : on ? BERLIN.playing : BERLIN.before;
  let i = 0;
  backdropTo(list[0]);
  if (list.length > 1) turn = setInterval(() => backdropTo(list[(i += 1) % list.length]), 20_000);
}
backdrop(false);

function controls(on) {
  playing = on;
  backdrop(on);
  $('play').setAttribute('aria-label', on ? T.stop : T.play);
  document.body.classList.toggle('playing', on);
}

async function play() {
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
    if (res.paidWith) { spentHere += show.stream.price; meter(); balance(); }
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
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  $('mute').setAttribute('aria-label', muted ? 'Sound on' : 'Mute');
  document.body.classList.toggle('muted', muted);
}
$('mute').onclick = () => { muted = !muted; level(); };
$('vol').oninput = () => { volume = Number($('vol').value); muted = volume === 0; level(); };

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

// ---- Full screen: the picture fills the screen, with the controls and the tip on it. Phone turned sideways does
// it by itself. The button also asks the browser for real full screen where it can (not on iPhone: there the
// page alone fills the screen, with Safari's bars still round it).
const sideways = matchMedia('(orientation: landscape) and (max-height: 540px)');
let wantFull = false;
const layout = () => {
  const full = wantFull || sideways.matches;
  document.body.classList.toggle('full', full);
  document.body.classList.toggle('sideways', sideways.matches);
  $('full').setAttribute('aria-label', full ? T.exitFull : T.full);
};
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
    if (res.ok) ownForm(false);
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
if (AS === 'home') $('money').after($('goal'));
const DEFAULT_PHOTO = '/img/peggy-5-1372.jpg';
$('welcome-photo').src = $('closing-photo').src = showPhoto || DEFAULT_PHOTO;
// Before the set plays, the player shows the artist's photo, like a video's cover picture.
$('player').style.background = `#000 center / cover no-repeat url("${showPhoto || '/img/fp-32.jpg'}")`;
// The words that come from the setup page: redrawn whenever it saves (the demo changes prices live).
function words() {
  const day = show.date ? new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  $('when').textContent = [day, show.starts && `starts ${show.starts}`, AS === 'home' && show.venue].filter(Boolean).join(' · ');
  $('billing').textContent = show.title;
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
let door = await myDoor();
let stage = (await fetch('/api/stage').then((r) => r.json()).catch(() => ({}))).stage || 'doors';

function render() {
  const room = AS === 'room';
  const ticket = !!door.ticket;
  const closed = stage === 'closed';
  const s = split();
  body.dataset.stage = stage;
  // Full picture with the chat over it: the room once the set plays, and always at home.
  body.classList.toggle('immersive', !closed && AS === 'room' && ticket && stage === 'on');
  $('closing').hidden = !closed;
  // A ticket bought while the free drink was off stays a ticket: the drink is only offered again if it failed here.
  $('door').hidden = closed || !show.ticket.on || (ticket && (!room || door.drink || !s.drink || !drinkDue()));
  $('inside').hidden = closed || !room || !ticket || stage !== 'doors';
  // At the door the artist's photo fills the top of the phone; the date and the ticket sit in the bottom half.
  body.classList.toggle('at-door', room && !$('door').hidden);
  body.classList.toggle('inside-doors', !$('inside').hidden);
  $('player').hidden = closed || (room && (!ticket || stage !== 'on'));
  $('money').hidden = closed || (room && !ticket);
  // In the room the chat opens with the set: at doors the phone is the ticket and the drink.
  $('chat').hidden = closed || (room && !ticket); // at doors the room's phone shows only the goal (styles hide the rest)
  // At home the set plays whenever you press play (the clip, on a loop); in the room it waits for Start the show.
  const live = AS === 'home' ? !closed : stage === 'on';
  $('doors-sign').hidden = AS === 'home' || stage !== 'doors';
  $('live-badge').hidden = stage !== 'on';
  // At home the whole ticket is a button beside the tips (board 2); the ticket box stays for the phone.
  $('whole').hidden = AS !== 'home' || !show.ticket.on || ticket || closed;
  $('whole').textContent = `The whole ticket · ${sats(s.artist)}`;
  $('play').disabled = $('big-play').disabled = !live;
  if (!live && playing) stop();

  // At the door: the room's ticket includes the drink; at home, the whole set for the artist's part alone.
  if (!ticket) {
    $('door-title').textContent = room ? 'Ticket' : 'The whole ticket';
    $('ticket-note').textContent = room ? (s.drink ? 'Includes your first drink' : '') : free ? 'Or watch free, with tips' : 'Or press play and pay as it plays';
    $('buy').textContent = `Pay ${sats(room ? s.total : s.artist)}`;
  } else {
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
function goal(tipped, goals) {
  const g = goals.find((x) => tipped < x.at) || goals[goals.length - 1];
  $('goal').hidden = !g;
  if (!g) return;
  $('goal-label').textContent = g.label;
  $('goal-sum').textContent = `${tipped.toLocaleString('en-GB')} / ${g.at.toLocaleString('en-GB')}`;
  $('goal-bar').style.width = `${Math.min(100, (tipped / g.at) * 100)}%`;
}
async function chat() {
  const r = await fetch(`/api/messages?after=${lastMsg}`).then((x) => x.json());
  for (const m of r.messages) {
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
function said() {
  const text = $('say-text').value.trim();
  $('say-text').value = '';
  setTimeout(() => chat().catch(() => {}), 300);
  return text ? { 'X-Message': encodeURIComponent(text) } : {};
}
$('say').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('say-text').value.trim();
  if (!text) return;
  const r = await fetch('/api/message', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (r.ok) { $('say-text').value = ''; chat().catch(() => {}); } else say((await r.json().catch(() => ({}))).detail || 'Not sent.');
};

// ---- Every 2 s: the stage, this phone's drink, the chat. (Polling: Cloudflare holds back live streams of events.)
async function tick() {
  const fresh = await fetch('/api/show').then((r) => r.json());
  if (shownAt && fresh.updated !== shownAt) { Object.assign(show, fresh.show); words(); }
  shownAt = fresh.updated;
  const latest = (await fetch('/api/stage').then((r) => r.json())).stage;
  if (latest === 'on' && stage !== 'on' && (AS === 'home' || door.ticket)) lights();
  stage = latest;
  if (door.drink && !door.drink.poured) {
    door = await myDoor();
    if (door.drink?.poured) pint(); // the bar just poured it: the mint says it's spent (NUT-07)
  }
  if (stage === 'closed') $('change').textContent = `Your change: ${sats(await wallet.balance())}, in this browser.`;
  render();
  await chat();
}
render();
tick().catch(() => {});
setInterval(() => tick().catch(() => {}), 2000);
