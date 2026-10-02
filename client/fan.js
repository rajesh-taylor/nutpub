// Fan page: the phone's wallet, the gift it arrived with, the door, and the paid stream.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';
import QRCode from 'qrcode';
import { Mint, hashToCurve, getDecodedToken } from '@cashu/cashu-ts';
import { t, has, sats, onLang } from './i18n.js';
import { initSheets, spend, spent, resetSpend } from './sheets.js';
import { heroes } from './heroes.js';

const $ = (id) => document.getElementById(id);
const show = (id) => document.querySelectorAll('[data-screen]').forEach((el) => (el.hidden = el.id !== id));

// A refusal from the gate: its code has a line in i18n.js; anything else, say what the server said.
const refusal = (body) => (has(body.error) ? body.error : body.detail || body.error);

let wallet, config, pass, tier;
let showState = { t0: null };
let clockOffset = 0; // server time minus this phone's time
let streaming = false;
let resumed = false; // came back after a reload: wait for a tap (iOS needs one before it plays sound)
let run = 0; // each start gets a number, so a stopped loop that wakes up late just exits

const serverNow = () => Date.now() + clockOffset;
// The status line. Keys are looked up in i18n.js (so a language switch can say it again); raw text passes through.
let lastSay = [''];
function say(key, vars = {}, loud = false) {
  lastSay = [key, vars, loud];
  $('status').innerHTML = '';
  $('status').textContent = key ? t(key, vars) : '';
  $('status').classList.toggle('loud', loud);
}

// The night in chapters, so anyone watching knows which part of the story this phone is in.
let chapterNow = '';
let gifted = false; // a gift landed on this phone
function chapter(name) {
  if (name === chapterNow) return;
  chapterNow = name;
  $('chapter-title').textContent = t(`ch.${name}.t`);
  $('chapter-line').textContent = t(name === 'door' && gifted ? 'ch.door.gift' : `ch.${name}.l`);
}

// The pocket: what this phone holds at the NutPub Mint. Hidden until there's something in it.
async function refresh() {
  const n = await wallet.balance();
  $('pocket-amt').textContent = n;
  $('pocket-big').textContent = sats(n);
}

async function claimGift() {
  const token = decodeURIComponent(location.hash.slice(1));
  if (!token.startsWith('cashuB') && !token.startsWith('cashuA')) return;
  history.replaceState(null, '', location.pathname); // the gift is live money: don't leave it in the address bar
  say('gift.opening');
  try {
    await wallet.receive(token);
    gifted = true;
    chapterNow = '';
    if (!pass) chapter('door');
    say('gift.landed', { n: await wallet.balance() }, true);
  } catch (e) {
    say('gift.fail', { msg: e.message });
  }
}

// NUT-24 round trip: ask, get a 402 with a creqA, pay it in-band, ask again with the cashuB.
// What was paid goes on this phone's own tally for the night (Pocket).
// With `retry`, a lost reply is asked for again with the same token (Basement58): same request, same answer,
// charged once. `basement` makes the server hold its reply so this phone loses it on purpose (presenter only).
async function paidFetch(url, headers = {}, kind = '', amount = 0, { retry = false, basement = false } = {}) {
  const res = await fetch(url, { headers });
  if (res.status !== 402) return res;
  const token = await wallet.pay(res.headers.get('X-Cashu'));
  const paid = retry ? await sendAgain(url, { ...headers, 'X-Cashu': token }, basement)
    : await fetch(url, { headers: { ...headers, 'X-Cashu': token } });
  if (paid.ok && kind) spend(kind, amount);
  paid.token = token;
  return paid;
}
async function sendAgain(url, headers, basement) {
  let lost = false;
  for (let i = 0; i < 90; i++) {
    const ctrl = new AbortController();
    const h = basement && i === 0 ? { ...headers, 'X-Basement': '1' } : headers;
    if (basement && i === 0) setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch(url, { headers: h, signal: ctrl.signal });
      res.retried = lost;
      return res;
    } catch {
      if (!lost) say('basement.lost', {}, true);
      lost = true;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(t('basement.gone'));
}

// ---- Basement58, on the presenter's phone: arm it, the next payment's reply goes missing, the phone asks again.
const presenter = (() => { try { return !!localStorage.getItem('nutpub-k'); } catch { return false; } })();
let basementArmed = false;
let lastPaidSeg = null; // { n, token } of the payment that came back after a retry
const paidSegs = new Set();
async function sameTokenNextSong() {
  if (!lastPaidSeg) return;
  unlockAudio();
  const live = Math.floor((serverNow() - showState.t0) / showState.segmentMs);
  const n = [live, live + 1, live + 2].find((k) => !paidSegs.has(k) && k !== lastPaidSeg.n);
  const res = await fetch(`/api/segment/${n}`, { headers: { 'X-Pass': pass, 'X-Cashu': lastPaidSeg.token } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 400 && body.error === 'reused') { trombone(); say('basement.refused', {}, true); }
  else say(body.error || `${res.status}`);
  $('next-same').hidden = true;
}

async function enter(which) {
  unlockAudio();
  say('knocking');
  try {
    resetSpend(); // a new pass is a new night
    const crew = presenter ? { 'X-Admin': localStorage.getItem('nutpub-k') } : {}; // not counted as a guest
    const res = await paidFetch(`/api/door?tier=${which}`, crew, which === 'ticket' ? 'door' : 'stream', config.tiers[which].door);
    const body = await res.json();
    if (res.ok) {
      ({ pass, tier } = body);
      try { localStorage.setItem('nutpub-pass', pass); } catch {}
      $('in-tier').textContent = t(`tier.${tier}`);
      say('');
      show('inside');
      chapter(showState.t0 ? 'playing' : 'inside');
      keepAwake();
      $('pint').hidden = tier !== 'ticket';
      if (showState.t0 && tier === 'stream') startStream();
    } else {
      trombone();
      say(refusal(body));
    }
  } catch (e) {
    say(e.message.includes('Insufficient') ? 'no.sats' : e.message);
  }
  refresh();
}

async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
}

// ---- The stream: buy each 10-second segment just before it plays, and schedule it on the shared clock.
// Everything the stream plays goes through one gain, so Stop can fade it out at once.
let master = null;
let sources = [];
let paidTo = 0; // seconds of the set this phone has paid for
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function player(on) {
  $('stop').classList.toggle('on', on);
  $('ctl-play').classList.toggle('on', on);
  $('ctl-play').setAttribute('aria-label', t(on ? 'stop' : 'play'));
  $('stop').setAttribute('aria-label', t(on ? 'stop' : 'play'));
  $('stop-label').textContent = t(on ? 'stop' : 'play');
  $('player-kicker').textContent = t('player.kicker', { n: config.tiers[tier || 'stream'].segment });
  const n = spent('stream');
  $('set-total').textContent = n ? t('set.total', { sats: sats(n) }) : '';
}

async function startStream() {
  if (streaming || !pass) return;
  streaming = true;
  const me = ++run;
  const ac = unlockAudio();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 1;
  analyser = ac.createAnalyser();
  analyser.fftSize = 256;
  master.connect(analyser).connect(ac.destination);
  const out = master;
  requestAnimationFrame(drawLevel);
  $('stream').hidden = false;
  $('basement').hidden = !presenter;
  player(true);
  const ms = showState.segmentMs;
  let n = Math.max(0, Math.floor((serverNow() - showState.t0) / ms));

  while (streaming && me === run) {
    const startsAt = showState.t0 + n * ms;
    const wait = startsAt - serverNow() - 3000; // buy 3 s ahead
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!streaming || me !== run) break;

    let res;
    try {
      const basement = basementArmed;
      basementArmed = false;
      $('basement').classList.remove('armed');
      res = await paidFetch(`/api/segment/${n}`, { 'X-Pass': pass }, 'stream', config.tiers[tier].segment, { retry: true, basement });
      if (res.ok && res.retried) {
        lastPaidSeg = { n, token: res.token };
        say('basement.same', {}, true);
        $('next-same').hidden = false;
      }
    } catch (e) {
      stopStream(e.message.includes('Insufficient') ? 'out.of.sats' : e.message);
      break;
    }
    if (res.status === 409) { // fell behind: jump to the live segment
      n = (await res.json()).live ?? n + 1;
      continue;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      stopStream(body.error ? refusal(body) : t('seg.refused', { status: res.status }));
      break;
    }
    paidTo = Math.max(paidTo, (n + 1) * ms / 1000);
    paidSegs.add(n);
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    if (!streaming || me !== run) break; // stopped while it was on its way: don't start it
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    sources.push(src);
    src.onended = () => (sources = sources.filter((x) => x !== src));
    const late = (serverNow() - startsAt) / 1000;
    if (late > 0) src.start(0, Math.min(late, buf.duration - 0.05));
    else src.start(ac.currentTime - late);
    showVideo(n, startsAt, me);
    player(true);
    refresh();
    n++;
  }
}

// ---- The player frame: a level meter from the real audio, mute, and a tip with a confirm step.
let analyser = null;
let muted = false;
function drawLevel() {
  const c = $('level');
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  if (!streaming || !analyser) return;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  const bars = 20;
  const w = c.width / bars;
  g.fillStyle = '#d9953a';
  for (let i = 0; i < bars; i++) {
    const k = 1 + Math.floor(((i / bars) ** 2) * 60); // spread the bars over the low end, where music lives
    const h = Math.max(2, (bins[k] / 255) * c.height);
    g.fillRect(i * w + 1, c.height - h, w - 2, h);
  }
  requestAnimationFrame(drawLevel);
}
let controlsTimer;
function showControls() {
  $('frame').classList.add('show');
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => $('frame').classList.remove('show'), 3500);
}
function mute() {
  muted = !muted;
  $('ctl-mute').classList.toggle('muted', muted);
  $('ctl-mute').setAttribute('aria-label', t(muted ? 'unmute' : 'mute'));
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, unlockAudio().currentTime, 0.05);
  say(muted ? 'mute' : '');
}
async function tip() {
  unlockAudio();
  $('tip-confirm').hidden = true;
  try {
    const res = await paidFetch('/api/tip', pass ? { 'X-Pass': pass } : {}, 'tips', 21);
    const body = await res.json();
    if (!res.ok) { trombone(); return say(refusal(body)); }
    clink();
    say('tip.done', { n: body.tipped }, true);
  } catch (e) {
    say(e.message.includes('Insufficient') ? 'no.sats' : e.message);
  }
  refresh();
}

// The picture for a paid segment, shown when its sound starts (the server only hands it to a pass that paid for it).
async function showVideo(n, startsAt, me) {
  try {
    const r = await fetch(`/api/video/${n}`, { headers: { 'X-Pass': pass } });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const go = () => {
      if (!streaming || me !== run) return URL.revokeObjectURL(url);
      const v = $('vid');
      const old = v.src;
      v.onloadedmetadata = () => {
        v.currentTime = Math.max(0, Math.min((serverNow() - startsAt) / 1000, v.duration - 0.1));
        v.play().catch(() => {});
      };
      v.src = url;
      v.hidden = false;
      if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    };
    const wait = startsAt - serverNow();
    if (wait > 0) setTimeout(go, wait); else go();
  } catch {}
}

// Stop paying: the music fades out now, not at the end of what was already bought.
function stopStream(why) {
  streaming = false;
  if (master) {
    const ac = unlockAudio();
    master.gain.setTargetAtTime(0, ac.currentTime, 0.12);
    for (const s of sources) { try { s.stop(ac.currentTime + 0.7); } catch {} }
    sources = [];
    master = null;
  }
  $('vid').pause();
  $('vid').hidden = true;
  player(false);
  say(why ? 'stop.why' : paidTo ? 'stopped' : 'stopped.none', { why: t(why), t: mmss(paidTo) });
}

// ---- First pint's on the house. The QR only appears when you ask for it (it's a bearer voucher).
let pintToken = null;
async function freePint() {
  unlockAudio();
  if (!pintToken) {
    const res = await fetch('/api/pint', { method: 'POST', headers: { 'X-Pass': pass } });
    const body = await res.json();
    if (!res.ok) return say(refusal(body));
    pintToken = body.token;
    watchPint(pintToken);
  }
  await QRCode.toCanvas($('pint-qr'), `${config.publicUrl || location.origin}/bar.html#${pintToken}`, { errorCorrectionLevel: 'L', margin: 1, width: 640 });
  $('pint-qr').hidden = false;
  $('pint').innerHTML = `<span data-t="pint.show">${t('pint.show')}</span>`;
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
  pintPoured = true;
  $('last-call').hidden = true;
  $('pint-qr').hidden = true;
  $('pint').hidden = true;
  $('pint-signal').hidden = false;
  clink();
  setTimeout(clink, 900);
  // After the pour, back to Longy by itself.
  setTimeout(() => $('pint-signal').classList.add('leaving'), 5600);
  setTimeout(() => { $('pint-signal').hidden = true; $('pint-signal').classList.remove('leaving'); }, 6500);
}

// ---- The finale: a round for the band. The 402 asks for a locked token; this phone adds its own refund key.
let finale = null;
let reclaiming = false;

async function roundForTheBand() {
  unlockAudio();
  say('pledging');
  try {
    const url = '/api/pledge';
    const ask = await fetch(url, { headers: { 'X-Pass': pass } });
    if (ask.status !== 402) {
      const b = await ask.json().catch(() => ({}));
      return say(b.error === 'round_paid' ? 'round.paid' : refusal(b));
    }
    const token = await wallet.pledge(ask.headers.get('X-Cashu'));
    const res = await fetch(url, { headers: { 'X-Pass': pass, 'X-Cashu': token } });
    const body = await res.json();
    if (!res.ok) { trombone(); return say(refusal(body)); }
    spend('pledges', 21);
    say('pledged');
  } catch (e) {
    say(e.message.includes('Insufficient') ? 'no.sats' : e.message);
  }
  refresh();
}

function showFinale(f) {
  if (!f || !pass) return;
  const was = finale?.state;
  finale = f;
  const mine = wallet.pledges().reduce((s, p) => s + p.amount, 0);
  $('finale').hidden = !showState.t0;
  $('goal').textContent = t('goal', { total: f.total, goal: f.goal });
  const lit = f.state === 'paid' ? 7 : Math.min(7, Math.floor((7 * f.total) / f.goal));
  document.querySelectorAll('#goal-lamps i').forEach((el, i) => el.classList.toggle('on', i < lit));
  const left = Math.max(0, f.lastOrders - Math.floor(serverNow() / 1000));
  $('last-orders').textContent = f.state === 'open' ? t('last.in', { t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }) : '';
  $('band').disabled = f.state !== 'open';
  const p = f.payout || {};
  $('paid-screen').querySelector('.small').textContent = t(
    p.state === 'sent' ? 'paid.ln' : p.state === 'sending' ? 'paid.sending' : 'paid.small', { sats: sats(p.sats) });
  if (f.state === 'paid' && was !== 'paid') {
    if (mine) wallet.forgetPledges(); // they went to Longy
    $('paid-screen').hidden = false;
    rain();
    clink();
  }
  if (f.state === 'missed' && wallet.pledges().length && !reclaiming) comeHome();
  lastCall(f);
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
    spend('pledges', -back);
    say('home', { n: back }, true);
    clink();
    setTimeout(() => ($('closing').hidden = false), 4000);
  }
  refresh();
}

function rain() {
  const box = $('rain');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 ? '⚡' : '🍺';
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 2.5}s`;
    s.style.fontSize = `${18 + Math.random() * 22}px`;
    box.append(s);
  }
  setTimeout(() => box.replaceChildren(), 6000);
}

// Lights up: the rig fades in one lamp at a time, then Longy. (Reduced motion: a plain fade.)
function lightsUp(hold = false) {
  const el = $('lights-up');
  el.classList.toggle('hold', hold);
  el.hidden = false;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
  if (!hold) setTimeout(() => (el.hidden = true), 9900);
}
// Design preview: /?preview=lights plays lights up and stays on Longy (tap to replay).
if (new URLSearchParams(location.search).get('preview') === 'lights') {
  addEventListener('load', () => {
    lightsUp(true);
    $('lights-up').style.pointerEvents = 'auto';
    $('lights-up').onclick = () => lightsUp(true);
  });
}

// Last orders, pint unclaimed: a nudge (its lock sends it back to the house when the bell rings).
let pintPoured = false;
let nudged = false;
function lastCall(f) {
  if (nudged || pintPoured || tier !== 'ticket' || f.state !== 'open') return;
  const left = f.lastOrders - Math.floor(serverNow() / 1000);
  if (left > 60 || left < 0) return;
  nudged = true;
  $('last-call').hidden = false;
}

// Before curtains up, the phone shows the room filling: one stage light per phone through the door.
let lampsDrawn = 0;
function room(s) {
  $('room').hidden = !(pass && !s.t0);
  if ($('room').hidden) return;
  const at = config.curtainsAt || 0;
  const want = Math.min(21, Math.max(s.phones, at, 3));
  if (want !== lampsDrawn) { $('room-lamps').innerHTML = '<i></i>'.repeat(want); lampsDrawn = want; }
  $('room-lamps').querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < s.phones));
  $('room-line').textContent = t(s.phones === 1 ? 'room.phone' : 'room.phones', { n: s.phones }) + (at ? ` · ${t('room.at', { n: at })}` : '');
}

// ---- Curtains up: the server sends T0 over SSE (falls back to polling if the stream stalls).
function listen() {
  const apply = (s) => {
    clockOffset = s.now - Date.now();
    const opening = s.t0 && !showState.t0;
    showState = s;
    showFinale(s.finale);
    $('curtain').textContent = t(s.t0 ? 'curtain.now' : 'curtain.soon');
    // Once Longy's on, the show is the headline, not the ticket.
    $('in-h1').hidden = $('in-tier').hidden = !!s.t0;
    if (opening && pass) lightsUp();
    if (opening && pass && !resumed && tier === 'stream') startStream();
    document.body.dataset.photo = s.t0 && pass ? 'live' : pass ? 'stage' : '';
    room(s);
    if (pass) chapter(s.finale?.state === 'paid' ? 'paid' : s.finale?.state === 'missed' ? 'missed' : s.t0 ? 'playing' : 'inside');
    $('stream').hidden = !(s.t0 && pass && (tier === 'stream' || streaming || run > 0));
    $('screen').hidden = $('stream').hidden;
    document.body.classList.toggle('streaming', !$('screen').hidden);
    if (s.t0) $('screen-clock').textContent = mmss(Math.max(0, Math.floor((serverNow() - s.t0) / 1000)));
    $('tune').hidden = !(s.t0 && pass && tier === 'ticket' && !streaming && run === 0);
  };
  // SSE for speed, plus a 1-s poll: the Cloudflare tunnel holds SSE back, so the poll is what you get through it.
  const es = new EventSource('/api/events');
  es.onmessage = (e) => apply(JSON.parse(e.data));
  const poll = () => fetch('/api/show').then((r) => r.json()).then(apply).catch(() => {}).finally(() => setTimeout(poll, 1000));
  poll();
}

async function main() {
  config = await fetch('/api/config').then((r) => r.json());
  const prices = () => {
    $('ticket-price').textContent = sats(config.tiers.ticket.door);
    $('stream-price').textContent = t('per.seg', { n: config.tiers.stream.segment });
  };
  prices();
  heroes(config.heroes || {});
  // 🇬🇧/🇩🇪: say everything again in the other language.
  onLang(() => {
    prices();
    const name = chapterNow;
    chapterNow = '';
    if (name) chapter(name);
    if (tier) $('in-tier').textContent = t(`tier.${tier}`);
    if (tier) player(streaming);
    say(...lastSay);
    if (wallet) refresh();
  });
  // The payment rail: ecash tonight; the card rail is a placeholder (it would learn who paid).
  document.querySelectorAll('.rail button').forEach((b) => (b.onclick = () => {
    const card = b.dataset.rail === 'card';
    document.querySelectorAll('.rail button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    document.body.classList.toggle('card', card);
    $('rail-note').hidden = !card;
  }));
  wallet = await openWallet(config.kitty);
  initSheets(wallet, config, refresh, { tip });
  await claimGift();
  await refresh();
  $('pint').onclick = () => freePint().catch((e) => say(e.message));
  $('band').onclick = roundForTheBand;
  // Longy's paid: after the orange moment, closing time.
  $('paid-screen').onclick = () => { $('paid-screen').hidden = true; $('closing').hidden = false; };
  $('closing-x').onclick = () => ($('closing').hidden = true);
  $('last-call-x').onclick = () => { $('last-call').hidden = true; freePint().catch((e) => say(e.message)); };
  $('pint-signal').onclick = () => ($('pint-signal').hidden = true);
  $('ticket').onclick = () => enter('ticket');
  $('stream-pass').onclick = () => enter('stream');
  $('tune').onclick = () => { unlockAudio(); $('tune').hidden = true; startStream(); };
  $('basement').onclick = () => {
    basementArmed = !basementArmed;
    $('basement').classList.toggle('armed', basementArmed);
    say(basementArmed ? 'basement.armed' : '');
  };
  $('next-same').onclick = () => sameTokenNextSong().catch((e) => say(e.message));
  $('stop').onclick = () => {
    if (streaming) stopStream();
    else { say(''); startStream(); }
  };
  $('frame').onclick = (e) => { if (e.target === $('frame') || e.target.closest('.pic, .live, .clock, #level')) showControls(); };
  $('ctl-play').onclick = () => { showControls(); $('stop').onclick(); };
  $('ctl-mute').onclick = () => { showControls(); mute(); };
  $('ctl-tip').onclick = () => { clearTimeout(controlsTimer); $('tip-confirm').hidden = false; };
  $('tip-yes').onclick = () => tip();
  $('tip-no').onclick = () => ($('tip-confirm').hidden = true);
  listen();
  // Pledges from an earlier night whose locktime has passed: take them back now (refund key on this phone).
  if (wallet.pledges().some((p) => p.locktime < Date.now() / 1000)) comeHome();
  // Already paid at the door on this phone (and the show hasn't been reset)? Straight back in.
  let saved = null;
  try { saved = localStorage.getItem('nutpub-pass'); } catch {}
  const back = saved && (await fetch('/api/pass', { headers: { 'X-Pass': saved } }));
  if (back?.ok) {
    const b = await back.json();
    pass = saved;
    resumed = true;
    tier = b.tier;
    $('in-tier').textContent = t(`tier.${tier}`);
    show('inside');
    chapter(showState.t0 ? 'playing' : 'inside');
    player(false);
    $('stream').hidden = !showState.t0;
    say(tier === 'stream' ? 'welcome' : 'welcome.in');
  } else {
    show('door');
    chapter('door');
  }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && pass) keepAwake(); });
window.addEventListener('hashchange', () => claimGift().then(refresh));
main().catch((e) => say('wallet.fail', { msg: e.message }));
