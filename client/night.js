// Page 3, Takings (/takings), design C (13 Nov): what came in, by bitcoin and by card, and one Move button. Each card
// opens its own wallet in this browser ('nutpub-takings' for the artist, 'nutpub-bar' for the bar), the same wallets
// as the artist's and the bar's own pages, so Collect and Pour sign with the key that lives here. The server only
// lists the locked payments and marks one collected when the mint says it's spent.
import { openWallet, wordsFor, forgetWords } from './wallet.js';
import { ask, tell } from './ask.js'; // session 56: the site's own sheet, not the browser's boxes
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

try { await api('GET', '/api/admin/drinks'); } catch (e) {
  // An artist's stage, signed out (session 54): its front page has both ways in, Back to your gigs and the 12 words.
  if (e.status === 403 && /^(?=[a-z0-9]*\d)[a-z][a-z0-9]{5}$/.test(location.hostname.split('.')[0])) location.replace('/');
  else $('locked').hidden = false;
  throw new Error('signed out');
}
$('page').hidden = false;
const health = await fetch('/api/health').then((r) => r.json());
let info = await fetch('/api/show').then((r) => r.json());
const setlistReply = await api('GET', '/api/admin/setlist').catch(() => null);
// A show producer (session 55, Rajesh 22 Nov): the takings are the artist's alone, totals included. Show Time instead.
if (setlistReply?.role === 'producer') { location.replace('/show'); await new Promise(() => {}); }
const onSetlist = setlistReply?.setlist || false;
// A practice stage closes 7 days after it's made (stages.js), test sats not moved with it: Takings says when.
if (setlistReply?.closes) {
  const day = new Date(setlistReply.closes).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  $('keep-line').textContent = `Practice stages close 7 days after they’re made: this one on ${day}. Move your sats before then.`;
} // a stage's example gigs (setlist.js); .only: a judge's one-gig stage
// The three gig cards, on thenutpub.com (a stage's address without its first part).
const judgePage = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/judge`;
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
  keyAway = !(await holds(artist, pubkey));
  $('key-warn').hidden = !keyAway; // its two ways out: the 12 words, or a new key (asks first)
  return pubkey;
}
let keyAway = false;
// Session 62c (Rajesh 25 Nov): on a laptop the box is a card of its own, top right, above Your recordings, so the left
// column is earnings only; on a phone it stays right under the figure.
const narrow = matchMedia('(max-width: 1000px)');
const placeKeyWarn = () => (narrow.matches ? $('key-status').before($('key-warn')) : $('recs').before($('key-warn')));
placeKeyWarn();
narrow.addEventListener('change', placeKeyWarn);
$('key-new').onclick = () => $('key-sheet').showModal();
$('key-keep').onclick = () => $('key-sheet').close();
$('key-switch').onclick = async () => {
  $('key-sheet').close();
  const { publicKeyHex } = await artist.coco.keyring.generateKeyPair();
  await api('PUT', '/api/admin/artist-key', { pubkey: publicKeyHex });
  $('key-status').textContent = '';
  await refresh();
};

// ---- The 12 words (session 42): the backup of the key above, made with this browser's takings wallet (wallet.js).
// The padlock beside Move: open until the words are written down and two of them checked, then shut. A key brought
// back from typed words is backed up by those words. A stage made before 20 Nov has no words: today's line stays.
// The words never leave this browser; checked once, the browser remembers it (nutpub-takings-checked).
const CHECKED = 'nutpub-takings-checked';
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
// Session 54: the words back the key only if they make it (wordsFor); once checked they're put on record with the gig
// and forgotten here (as Cellar does), so the paper is the only copy.
const wordsNow = async () => wordsFor(state.pubkey && await artist.coco.keyring.getKeyPair(state.pubkey), state.pubkey);
async function backup(pubkey) {
  const pair = pubkey && await artist.coco.keyring.getKeyPair(pubkey);
  if (!pair) return 'away';
  if (wordsFor(pair, pubkey)) return recall(CHECKED) ? 'shut' : 'open';
  if (recall(CHECKED)) return 'brought'; // checked, then forgotten: backed up all the same
  if (pair.derivationIndex == null) return 'brought';
  return 'old';
}
async function settleWords() {
  const w = await wordsNow();
  if (!w) return;
  const { recordWords } = await import('./recover.js');
  if ((await recordWords(w, key)) && recall(CHECKED)) forgetWords();
}
const linkButton = (text, onclick) => Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: text, onclick });
async function drawLock() {
  const kind = await backup(state.pubkey);
  const shut = kind === 'shut' || kind === 'brought';
  $('lock-arm').setAttribute('d', kind === 'open' ? 'M8 11V7a4 4 0 0 1 7.6-1.7' : 'M8 11V7a4 4 0 0 1 8 0v4');
  $('lock-body').setAttribute('fill', shut ? '#d9953a' : 'none');
  $('lock').hidden = kind === 'away'; // the key's in another browser: the box says so instead
  const t = $('lock-text');
  if (kind === 'open') t.replaceChildren('Only this browser can open your bitcoin. ', linkButton('Write down your 12 words', showWords), ' to bring it back on another.');
  else if (shut) t.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Backed up with your 12 words.' }), ' Move it after the gig, or the next day.',
    ...(kind === 'shut' ? [' ', linkButton('Show my words', showWords)] : []));
  else t.replaceChildren('Only this browser can open your bitcoin. Move it after the gig, or the next day.');
}

// Sheet 1, the words; sheet 2, two of them checked (picked at random each time).
let toCheck = [];
async function showWords() {
  const words = ((await wordsNow()) || '').split(' ');
  if (words.length !== 12) return;
  $('words-list').replaceChildren(...words.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
  $('words-sheet').showModal();
}
const forget = () => $('words-list').replaceChildren(); // the words leave the page once the sheet is shut
$('words-sheet').addEventListener('close', forget);
$('words-later').onclick = () => $('words-sheet').close();
$('words-done').onclick = async () => {
  $('words-sheet').close();
  toCheck = (await import('./words.js')).twoToCheck();
  $('check-a-l').textContent = `Word ${toCheck[0]}`;
  $('check-b-l').textContent = `Word ${toCheck[1]}`;
  $('check-a').value = $('check-b').value = '';
  $('check-err').textContent = '';
  $('check-sheet').showModal();
};
$('check-again').onclick = () => { $('check-sheet').close(); showWords(); };
$('check-form').onsubmit = async (e) => {
  e.preventDefault();
  const words = ((await wordsNow()) || '').split(' ');
  const wrong = toCheck.filter((at, i) => ($(i ? 'check-b' : 'check-a').value.trim().toLowerCase() !== words[at - 1]));
  if (wrong.length === 2) { $('check-err').textContent = `Words ${wrong[0]} and ${wrong[1]} aren't right. Look at your paper again.`; return; }
  if (wrong.length) { $('check-err').textContent = `Word ${wrong[0]} isn't right. Look at your paper again.`; return; }
  remember(CHECKED, '1');
  $('check-sheet').close();
  await settleWords();
  $('key-status').textContent = 'Backed up. Keep the paper somewhere safe: this browser has forgotten them.';
  await drawLock();
};

// Sheet 3, on a browser without the key: the typed words find which of their keys is the stage's, and it goes into
// this browser's keyring as it is (this browser keeps its own seed: two browsers sharing one seed would trip over each
// other's coins). Then the mint is asked for coins made from the words' seed (collected, never moved): Coco's sweep
// swaps any it finds into this browser's wallet, so Move takes them too.
$('back-open').onclick = () => { $('back-err').textContent = ''; $('back-sheet').showModal(); $('back-words').focus(); };
$('back-cancel').onclick = () => $('back-sheet').close();
$('back-sheet').addEventListener('close', () => { $('back-words').value = ''; });
$('back-words').addEventListener('paste', (e) => { // a pasted list (numbered, one a line) shows as one line of words
  const t = e.clipboardData?.getData('text');
  if (!t) return;
  e.preventDefault();
  e.target.value = t.toLowerCase().normalize('NFKD').split(/[^a-z]+/).filter(Boolean).join(' ');
});
$('back-words').addEventListener('keydown', (e) => { // Enter brings it back (the words never need a new line)
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('back-form').requestSubmit(); }
});
$('back-form').onsubmit = async (e) => {
  e.preventDefault();
  const { checkWords, seedOf, findKey, keyAt } = await import('./words.js');
  const typed = checkWords($('back-words').value);
  if (typed.error) { $('back-err').textContent = typed.error; return; }
  const seed = seedOf(typed.words);
  const at = findKey(seed, state.pubkey);
  if (at < 0) { $('back-err').textContent = 'These words are for a different stage.'; return; }
  await artist.coco.keyring.addKeyPair(keyAt(seed, at).secretKey);
  $('back-sheet').close();
  import('./recover.js').then((m) => m.recordWords(typed.words, key)).catch(() => {}); // a gig with no words on record gets these

  const say = (t) => { $('key-status').textContent = t; };
  say('Your bitcoin is back in this browser. Looking for sats collected before…');
  await refresh();
  const before = await artist.balance();
  const looked = await Promise.race([
    artist.coco.wallet.sweep(health.mint.url, seed, { units: ['sat'] }).then(() => true, () => false),
    new Promise((ok) => setTimeout(() => ok(false), 30000)),
  ]);
  const found = (await artist.balance()) - before;
  say(found > 0 ? `Your bitcoin is back in this browser. Also found ${sats(found)} collected before.`
    : looked ? 'Your bitcoin is back in this browser.' : 'Your bitcoin is back in this browser. The mint didn’t answer about sats collected before.');
  await refresh();
};
async function keyLine(id, wallet, pubkey, who, path) { // the bar's card (hidden until the first drink returns)
  const here = await holds(wallet, pubkey);
  $(id).replaceChildren(here ? `This browser holds ${who}'s key.` : `${who}'s key is on another browser.`);
  if (here) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn quiet pour-btn';
  b.textContent = 'Make a new key here';
  b.onclick = async () => {
    if (!(await ask({ title: `Make ${who}’s key here?`, text: 'Payments locked to the old key can only be collected where that key is.', yes: 'Make it here' }))) return;
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
// Card money is pounds (session 62b): as sats at today's rate when the page shows £, $ or €; beside the sats in ₿.
const gbp = (p) => `£${(p / 100).toFixed(2)}`;
const cardSats = (p) => (p && rate?.gbp > 0 ? Math.round((p / 100 / rate.gbp) * 1e8) : 0);
const byCard = (g) => (g.card?.pence ? ` + ${gbp(g.card.pence)} by card` : '');
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
let settled = false;
let sums = null; // what paint() draws
const afterLastOrders = () => state.lastOrdersAt && Date.now() / 1000 > state.lastOrdersAt + 5;
// Drinks nobody poured, waiting under the bar's key once last orders has gone: the artist's to collect (session 40).
const lateWaiting = () => (afterLastOrders() ? state.waiting.filter((p) => p.kind === 'drink' && p.pubkey !== state.pubkey).reduce((t, p) => t + p.sats, 0) : 0);
const shortDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '');
async function refresh() {
  const [takings, locked, drinks] = await Promise.all([
    api('GET', '/api/admin/takings'), api('GET', '/api/admin/locked'), api('GET', '/api/admin/drinks'),
  ]);
  info = await fetch('/api/show').then((r) => r.json());
  const pubkey = await artistKeyHere(locked.pubkey);
  state = { waiting: locked.waiting, drinks, lastOrdersAt: locked.lastOrdersAt, pubkey };
  if (!settled) { settled = true; await settleWords().catch(() => {}); } // once a visit: the words on record, forgotten once checked
  await drawLock();
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
  const came = all('ticket') + all('tip') + all('piece') + all('replay') + drinkSum;
  sums = {
    tickets: all('ticket'), ticketsN: count('ticket'), tips: all('tip'), tipsN: count('tip'), zaps, home: all('piece'), replay: all('replay'), replayN: count('replay'), replayOn: takings.replay,
    drinks: drinkSum, drinksN: toArtist.length + unpouredLate.length, drinkOn, came,
    late: lateWaiting(), // unpoured after last orders, still locked to the bar's key: Move takes them by the refund path
    feePercent: takings.feePercent ?? 5,
    waiting: locked.totals.here.sats, held: await artist.balance(), stream: show.stream?.mode,
    // Anything still to move, wherever it's locked (another browser too); drinks locked to the bar are the bar's.
    left: locked.waiting.filter((p) => p.kind !== 'drink' || p.pubkey === pubkey).reduce((t, p) => t + p.sats, 0),
    upfront: takings.upfront?.sats || 0, // a free stream, paid before the gig from the artist's own wallet (session 35)
    over: !!takings.over, homeN: count('piece'), sold: takings.sold || {}, poured: poured.length, drinksAll: drinks.length,
    card: takings.card?.count ? takings.card : null, // card tips tonight, in pence (session 62b): in the top figure, not the Bitcoin card
  };
  paint();
  drawCard(takings.card);

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
// each payment split as it's paid), so it's on the receipt and not taken off (Rajesh 25 Nov: no line on the card).
function paint() {
  if (!sums) return;
  const s = sums;
  // The top figure: everything that came in tonight, bitcoin and card (session 62b). In £, $ or €: one figure, as the
  // fan's page; in ₿: the sats, then + the card pounds.
  const card = s.card?.pence || 0;
  if (fiatOn() && (!card || cardSats(card))) $('big').replaceChildren(fig(s.came + cardSats(card)));
  else $('big').replaceChildren(n(s.came), ' ', Object.assign(document.createElement('small'), { textContent: 'sats' }), ...(card ? [' + ', gbp(card)] : []));
  $('v-tickets').textContent = fig(s.tickets);
  $('s-tickets').textContent = `${n(s.ticketsN)} sold`;
  $('v-tips').textContent = fig(s.tips);
  $('s-tips').textContent = `${n(s.tipsN)} tip${s.tipsN === 1 ? '' : 's'}${s.zaps ? ` · ${n(s.zaps)} Nutzap${s.zaps === 1 ? '' : 's'}` : ''}`;
  $('v-home').textContent = fig(s.home);
  $('s-home').textContent = s.stream === 'ticket' ? 'Watch online' : s.stream === 'free' ? 'Free to watch' : 'Pay as you watch';
  // Replays (session 34): their own tile, once the gig has a replay or replay sats came in.
  $('t-replay').hidden = !s.replay && !s.replayOn;
  $('v-replay').textContent = fig(s.replay);
  const fans = s.replayN ? `${n(s.replayN)} fan${s.replayN === 1 ? '' : 's'} · ` : ''; // one payment each (session 35)
  $('s-replay').textContent = fans + (s.replayOn?.state === 'on' ? `${n(s.replayOn.days)} day${s.replayOn.days === 1 ? '' : 's'} left`
    : s.replayOn?.state === 'deleted' ? 'Recording deleted' : 'Replay over');
  $('t-drinks').classList.toggle('later', !s.drinkOn);
  $('v-drinks').textContent = s.drinkOn ? fig(s.drinks) : '—';
  $('s-drinks').textContent = s.drinkOn ? `${n(s.drinksN)} not poured by last orders` : 'With the first drink';
  // Step 2: everything moved (or nothing came in and the night is over): the same page says so in place.
  const k = kept();
  const allMoved = !k && s.came > 0 && !s.left && !s.held;
  const done = allMoved || (!k && !s.came && !s.left && !s.held && s.over);
  // The ending: the till receipt once everything's moved; after Finish gig, folded and stamped (until something new comes in).
  if (finishedLine && (s.came || k)) finishedLine = null;
  const view = finishedLine ? 'finished' : allMoved ? 'wrap' : null;
  document.body.classList.toggle('wrapped', !!view);
  $('wrap').hidden = !view;
  $('btc').hidden = !!view || !!k;
  for (const id of ['big', 'unit', 'in-wallet']) if (view) $(id).hidden = true;
  if (!view) { $('big').hidden = false; $('unit').hidden = false; }
  if (view) drawWrap(view, s);
  $('in-wallet').hidden = !allMoved || !!view;
  if (done) $('key-warn').hidden = true; // nothing left behind in another browser: no warning
  $('btc-done').hidden = !done;
  $('btc-done-word').textContent = allMoved ? 'In your wallet' : 'Nothing came in';
  $('tiles').hidden = done;
  $('move-row').hidden = done;
  $('done-counts').hidden = !allMoved;
  $('done-counts').textContent = [s.ticketsN && `${n(s.ticketsN)} ticket${s.ticketsN === 1 ? '' : 's'}`, s.tipsN && `${n(s.tipsN)} tip${s.tipsN === 1 ? '' : 's'}`,
    s.home && 'watching from home', s.replay && 'replays', s.drinksN && `${n(s.drinksN)} unpoured drink${s.drinksN === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const last = lastMoved();
  $('done-moved').hidden = !allMoved;
  $('done-moved').textContent = last?.amount ? `Moved ${n(last.amount)} sats${last.fee ? ` · the mint kept ${n(last.fee)}` : ''}` : 'Moved to your own wallet.';
  $('finish').hidden = !done;
  $('finish-go').hidden = !s.over;
  $('finish-note').textContent = s.over ? (onSetlist?.only ? (onSetlist.at === 'pickle' ? 'Then read the Pub Board.' : 'Then back to the three gigs.') : onSetlist ? 'It ticks off your setlist, and the next gig opens.' : 'Plan gig opens for the next one, same settings.') : 'Finish gig comes once the night’s over: End night on Show Time.';
  if (done) { if (!$('artist-status').dataset.busy) $('artist-status').textContent = ''; return; }
  const toMove = (keyAway ? 0 : s.waiting) + s.held + s.late; // locked to a key in another browser: nothing to move here
  $('move').disabled = !toMove;
  if (!toMove && !$('artist-status').dataset.busy) $('artist-status').textContent = s.came && !keyAway ? 'Nothing waiting to move.' : '';
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
    const expected = before + state.waiting.filter((p) => p.pubkey === state.pubkey).reduce((t, p) => t + p.sats, 0) + lateWaiting();
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
const MOVED = 'nutpub-moved-artist'; // the last code that landed: "Moved 121,937 sats · the mint kept 43"
function lastMoved() { try { return JSON.parse(localStorage.getItem(MOVED) || 'null'); } catch { return null; } }
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
let onReturn = null;
document.addEventListener('visibilitychange', () => { if (!document.hidden && kept()) onReturn?.(); });
function showKept() {
  const k = kept();
  $('moved').hidden = !k;
  $('btc').hidden = !!k || !sums || !$('wrap').hidden; // drawn once the numbers are in (no empty board while loading)
  clearInterval(watching);
  if (!k) return;
  $('moved-amount').replaceChildren(k.amount == null ? 'Your code' : n(k.amount), ...(k.amount == null ? [] : [' ', Object.assign(document.createElement('small'), { textContent: 'sats' })]));
  $('moved-fee').textContent = k.fee ? `Mint’s fee · ${n(k.fee)} sats` : '';
  $('moved-fee').hidden = !k.fee;
  $('artist-token').textContent = k.token;
  $('open-wallet').href = `cashu:${k.token}`;
  $('cashu-me').href = `https://wallet.cashu.me/#token=${k.token}`;
  $('moved-wait').lastElementChild.textContent = 'Waiting for your wallet.';
  const check = async () => {
    if (document.hidden) return;
    try {
      if (!(await artist.landed(k.token))) return;
      clearInterval(watching);
      try { localStorage.removeItem(KEPT); localStorage.setItem(MOVED, JSON.stringify({ amount: k.amount, fee: k.fee })); } catch {}
      $('moved-wait').lastElementChild.textContent = 'In your wallet.';
      setTimeout(() => { showKept(); refresh().catch(() => {}); }, 300);
    } catch {}
  };
  // Every second, and at once when this tab comes back from Cashu.me (Rajesh 15 Nov: the receipt took 3 to 8 seconds:
  // a 5-second check that skipped while the tab was hidden, then a 2.5-second pause).
  watching = setInterval(check, 1000); // one small ask of the mint a second, only while waiting
  onReturn = check;
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
// ---- Finish gig (was Next gig on Plan gig): keeps the gig's one-line totals, clears it, same settings. What Move took
// out goes with it, for the receipt.
let finishedLine = null; // the gig just finished: its receipt, folded and stamped
let finishedNext = null; // what comes next (the status line's words)
async function finishGig(btn) {
  btn.disabled = true;
  try {
    const out = await api('POST', '/api/admin/next-gig', { moved: lastMoved() });
    try { localStorage.removeItem(MOVED); } catch {}
    const wrapped = !$('wrap').hidden;
    await pastGigs();
    if (wrapped) finishedLine = pastList[0] || null;
    await refresh();
    // On a stage the gig ticks off the setlist, and the next one is ready there.
    // Rajesh 14 Nov: "Done. Open 1 · Plan your gig: Frankie Peroni's gig is waiting."
    const link = (href, textContent) => Object.assign(document.createElement('a'), { href, textContent });
    const list = out?.setlist;
    const next = list && !list.done.includes(list.at) && { longy: 'Longy\u2019s gig', frankie: 'Frankie Peroni\u2019s gig', pickle: 'Longy at The Fickle Pickle', yours: 'the venue night' }[list.at];
    finishedNext = list?.only ? null
      : next ? ['Done. Open ', link('/setup', '1 · Plan your gig'), `: ${next[0].toUpperCase()}${next.slice(1)} is waiting.`]
      : list ? ['Done. Every gig on ', link('/', 'your setlist'), ' is ticked off.']
      : ['Finished. ', link('/setup', 'Plan gig'), ' is ready for the next one.'];
    if (finishedLine) paint();
    $('artist-status').replaceChildren(...(list?.only ? (onSetlist?.at === 'pickle' ? ['Done.'] : ['Done. ', link(judgePage, 'Back to the three gigs'), '.']) : finishedNext));
    document.dispatchEvent(new Event('nutpub:finished')); // the Judges line moves on (judge-line.js)
  } catch (e) { $(btn === $('wrap-finish') ? 'wrap-status' : 'artist-status').textContent = `Not done: ${e.message}`; }
  finally { btn.disabled = false; }
}
$('finish-go').onclick = () => finishGig($('finish-go'));
$('wrap-finish').onclick = () => finishGig($('wrap-finish'));
$('wrap-save').onclick = () => printSlip(liveLine());

// ---- The till receipt (Ending 2): one slip for the screen, Save receipt and a past gig's Receipt. Always in sats.
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
const ln = (what, v, cls = '', muted = false) => {
  const d = el('div', `ln ${cls}`);
  d.append(el('span', '', what), el('span', muted ? 'm' : '', v));
  return d;
};
// The gig as Takings sees it now, in the shape of a past gig's line (closing.js, keepGigLine).
function liveLine() {
  const s = sums;
  const { show } = info;
  return { artist: show.artist, date: show.date, venue: (show.venue || '').split(',')[0].trim(),
    tickets: { room: s.sold.room?.count || 0, home: s.sold.home?.count || 0, inside: s.sold.room?.inside || 0, sats: s.tickets, roomSats: s.sold.room?.sats ?? null },
    tips: s.tips, tipsN: s.tipsN, home: s.home, replay: s.replay, drinks: s.drinks, drinksN: s.drinksN, poured: s.poured, drinksAll: s.drinksAll,
    sats: s.came, feePercent: s.feePercent, upfront: s.upfront, moved: lastMoved() || true, ...(s.card ? { card: s.card } : {}) };
}
function slip(g, { folded = false } = {}) {
  const out = [el('p', 'mark', 'THE NUTPUB')];
  if (g.artist) out.push(el('p', '', folded ? [g.artist, shortDay(g.date)].filter(Boolean).join(' · ') : g.artist));
  if (!folded) out.push(el('p', '', [shortDay(g.date), g.venue || g.page].filter(Boolean).join(' · ')));
  out.push(el('div', 'rule'));
  const t = g.tickets || {};
  if (!folded) {
    const room = t.room || 0, home = t.home || 0;
    if (room) out.push(ln(`${n(room)} × venue ticket`, t.roomSats == null ? (home ? '' : n(t.sats)) : n(t.roomSats)));
    if (room) out.push(ln('Let in at the door', `${n(t.inside || 0)} of ${n(room)}`, '', true));
    if (home) out.push(ln(`${n(home)} × online ticket`, t.roomSats == null ? (room ? '' : n(t.sats)) : n((t.sats || 0) - t.roomSats)));
    if (!room && !home && t.sats) out.push(ln('Tickets', n(t.sats)));
    if (g.home) out.push(ln('Watching online', n(g.home)));
    if (g.replay) out.push(ln('Replays', n(g.replay)));
    if (g.tips) out.push(ln(g.tipsN ? `${n(g.tipsN)} × tip` : 'Tips', n(g.tips)));
    if (g.drinksAll || g.poured) out.push(ln('Free first drink', g.drinksAll ? `${n(g.poured || 0)} of ${n(g.drinksAll)} poured` : `${n(g.poured)} poured`, '', true));
    if (g.drinks) out.push(ln(g.drinksN ? `${n(g.drinksN)} × unpoured drink` : 'Unpoured drinks', n(g.drinks)));
    out.push(el('div', 'rule'));
  }
  out.push(ln('YOURS', sats(g.sats), 'tot'));
  // The 5% on every receipt, folded too (Rajesh 15 Nov: after Finish gig it was missing).
  const pct = g.feePercent ?? 5;
  out.push(ln(`The NutPub's ${pct}%`, `(${n(Math.round(((g.sats || 0) * pct) / 100))})`));
  out.push(el('p', 'small', 'not taken on the test mint'));
  // Card tips (session 62b): pounds, through the artist's own Stripe; the 5% there is Stripe's application fee.
  const c = g.card;
  if (c?.count) {
    out.push(el('div', 'rule'));
    out.push(ln(folded ? 'By card' : `${n(c.count)} × card tip`, gbp(c.pence)));
    if (!folded) {
      if (c.stripeFee != null) out.push(ln('Stripe’s fee', `(${gbp(c.stripeFee)})`));
      out.push(ln(`The NutPub's ${pct}%`, `(${gbp(c.nutpub || 0)})`));
      if (c.net != null) out.push(ln('Stripe pays you', gbp(c.net)));
    }
    out.push(el('p', 'small', 'through your own Stripe, test mode'));
  }
  // A free stream's cost, paid up front (session 35): the artist's own money, so not in YOURS or the 5%.
  if (g.upfront) {
    out.push(ln('Free stream, paid before the gig', `(${n(g.upfront)})`));
    if (!folded) out.push(el('p', 'small', 'from your own wallet, to the NutPub'));
  }
  out.push(el('div', 'rule'));
  const m = g.moved;
  if (m?.amount) {
    out.push(ln('Moved to your own wallet', n(m.amount)));
    if (!folded && m.fee) out.push(ln('Mint fees', n(m.fee)));
  } else if (m) out.push(ln('Moved to your own wallet', '✓'));
  out.push(el('div', 'rule'));
  if (folded) out.push(el('p', '', 'Thank you for sharing the night with us.'));
  else if (health.mint?.test !== false) out.push(el('p', 'test', '*** TEST SATS. NO REAL MONEY. ***'));
  return out;
}
function printSlip(g) {
  $('r-slip').replaceChildren(...slip(g));
  print();
}
// Gig 3's thank-you (Rajesh 20 Nov), its cockney glossed for judges abroad; then the Pub Board (21 Nov).
function thanks() {
  const p = el('p', 'wrap-thanks', 'That’s all three gigs. Cheers, me old ');
  const china = Object.assign(document.createElement('abbr'), { textContent: 'china', tabIndex: 0 });
  china.dataset.means = 'Mate: Cockney rhyming slang, china plate';
  p.append(china,
    '! 🍻 Before you go, read the Pub Board: AI agents buy tickets here too.');
  return p;
}
function drawWrap(view, s) {
  const fin = view === 'finished';
  $('wrap-tag').textContent = fin ? 'Finished' : 'In your wallet';
  $('slip').replaceChildren(...slip(fin ? finishedLine : liveLine(), { folded: fin }));
  $('stamp').hidden = !fin;
  $('slip').classList.toggle('folded', fin);
  $('wrap-acts').hidden = fin;
  $('wrap-after').hidden = !fin;
  $('wrap-finish').hidden = !s.over;
  $('wrap-finish-note').textContent = s.over ? (onSetlist?.only ? 'Done with this gig? The receipt stays under Past gigs.' : onSetlist ? 'Done with this gig? It ticks off your setlist. The receipt stays under Past gigs.' : 'Done with this gig? Plan gig opens for the next one. The receipt stays under Past gigs.') : 'Finish gig comes once the night’s over: End night on Show Time.';
  if (fin) {
    // Judges get one way on (Rajesh 15 Nov): back to the three gig cards.
    // Gig 3 is the last (Rajesh 20 Nov): a thank-you, and the Pub Menu for more.
    const last = onSetlist?.at === 'pickle';
    $('wrap-after').replaceChildren(...(onSetlist?.only
      ? (last ? [thanks(), Object.assign(el('a', 'btn primary judges-on', 'Read the board →'), { href: judgePage.replace(/\/judge$/, '/board') })]
        : [Object.assign(el('a', 'btn primary judges-on', 'Judges: on to the next gig →'), { href: judgePage })])
      : [Object.assign(el('p', 'wrap-next'), {})]));
    if (!onSetlist?.only) $('wrap-after').firstChild.append(...(finishedNext || []));
  }
}

// ---- Past gigs: one line each, with Receipt (printed: the phone's own Save as PDF) and Delete (asks first).
const gigWhen = (g) => [shortDay(g.date), g.venue || g.page].filter(Boolean).join(' · ');
let pastList = [];
// ---- Your recordings: Stream's copy of each broadcast. Download asks Stream for an MP4 (made once, a few minutes for
// a long set: the button counts the percent), then opens the signed link; Delete asks first.
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
async function recordings() {
  const list = await api('GET', '/api/admin/recordings').catch(() => null);
  if (!Array.isArray(list)) { $('recs').hidden = true; return; } // Stream not set up here
  $('recs-list').replaceChildren(...(list.length ? list.map((v) => {
    const row = el('div', 'past-row');
    const p = el('p');
    p.append(`${day(v.created)} · ${v.minutes} min`, document.createElement('br'),
      el('span', '', v.recording ? 'Recording now' : `Recorded live · gone ${day(v.gone)}`));
    const acts = el('span', 'acts');
    const get = Object.assign(el('button', 'btn quiet', 'Download'), { type: 'button', disabled: v.recording });
    const del = Object.assign(el('button', 'btn quiet del', 'Delete'), { type: 'button', disabled: v.recording });
    get.onclick = () => fetchMp4(v, get);
    del.onclick = async () => {
      if (!(await ask({ title: `Delete the recording from ${day(v.created)}?`, text: 'It can’t be brought back.', yes: 'Delete it', no: 'Keep it' }))) return;
      del.disabled = get.disabled = true;
      await api('POST', `/api/admin/recordings/${v.uid}/delete`).catch((e) => tell('Not deleted', e.message));
      recordings();
    };
    acts.append(get, del);
    row.append(p, acts);
    return row;
  }) : [el('p', 'none', 'None yet: go live from your streaming app and the set is recorded here.')]));
}
async function fetchMp4(v, btn) {
  btn.disabled = true;
  for (let i = 0; i < 200; i += 1) { // up to about 10 minutes
    let r;
    try { r = await api('POST', `/api/admin/recordings/${v.uid}/download`); } catch (e) { btn.textContent = 'Download'; btn.disabled = false; tell('Not downloaded', e.message); return; }
    if (r.status === 'ready' && r.url) { btn.textContent = 'Download'; btn.disabled = false; location.href = r.url; return; }
    btn.textContent = `Preparing ${r.percent || 0}%`;
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  btn.textContent = 'Download';
  btn.disabled = false;
}
recordings();

async function pastGigs() {
  const gigs = await api('GET', '/api/admin/gigs');
  pastList = gigs;
  $('past').hidden = !gigs.length;
  $('past-list').replaceChildren(...gigs.map((g) => {
    const row = document.createElement('div');
    row.className = 'past-row';
    const p = document.createElement('p');
    p.append(gigWhen(g), document.createElement('br'), Object.assign(document.createElement('span'), { textContent: sats(g.sats) + byCard(g) }));
    const acts = document.createElement('span');
    acts.className = 'acts';
    const rec = Object.assign(document.createElement('button'), { type: 'button', className: 'btn quiet', textContent: 'Receipt' });
    rec.onclick = () => receipt(g);
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'btn quiet del', textContent: 'Delete' });
    del.onclick = () => askDelete(g);
    acts.append(rec, del);
    row.append(p, acts);
    return row;
  }));
}
const receipt = (g) => printSlip(g);
let deleting = null;
function askDelete(g) {
  deleting = g;
  $('del-h').textContent = `Delete ${shortDay(g.date) || 'this gig'}?`;
  $('del-what').textContent = [g.venue || g.page, sats(g.sats) + byCard(g)].filter(Boolean).join(' · ');
  $('del-sheet').showModal();
}
$('del-keep').onclick = () => $('del-sheet').close();
$('del-receipt').onclick = () => deleting && receipt(deleting);
$('del-go').onclick = async () => {
  if (!deleting) return;
  try { await api('POST', '/api/admin/gigs/delete', { id: deleting.id }); } catch {}
  $('del-sheet').close();
  deleting = null;
  pastGigs().catch(() => {});
};

showKept();

await pastGigs().catch(() => {});
if (onSetlist?.only && onSetlist.done?.includes(onSetlist.at) && pastList[0]) finishedLine = pastList[0];
await refresh();
setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60_000); // each refresh is 4 requests

// Card money (session 62): only once the artist has connected Stripe in Cellar; otherwise the box stays "Card · soon".
// Stripe's own figures: what fans tipped, Stripe's fee, the NutPub's 5% and what Stripe pays the artist.
function drawCard(card) {
  if (!card) return;
  const box = document.querySelector('.card-box');
  const make = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || '', textContent: text ?? '' });
  box.classList.add('on');
  $('card-h').textContent = 'Card money';
  const body = [];
  if (!card.count) body.push(make('p', 'note card-none', 'No card tips yet tonight. Fans see By card next to the sats tips.'));
  else {
    const dl = make('dl', 'card-sums');
    const line = (k, v, cls) => dl.append(make('dt', cls, k), make('dd', cls, v));
    // Session 63 (Rajesh 26 Nov): two lines, as the Bitcoin card; Stripe's fee and the NutPub's 5% are on the receipt.
    line(`${card.count} card tip${card.count === 1 ? '' : 's'}`, gbp(card.pence));
    line('Stripe pays you', card.net == null ? 'Stripe is still working it out' : gbp(card.net), 'total');
    body.push(dl);
  }
  // The demo account (judges' gigs) is the NutPub's, not the judge's: no Open my Stripe, a plain tag instead.
  const open = card.demo ? make('span', 'small', 'Demo Stripe account · test mode') : make('a', 'btn quiet', 'Open my Stripe ↗');
  if (!card.demo) Object.assign(open, { href: 'https://dashboard.stripe.com/test/dashboard', target: '_blank', rel: 'noopener' });
  // Rajesh 25 Nov: Open my Stripe takes the badge's place, top right, so the box is shorter.
  const badge = box.querySelector('.box-head img');
  if (badge) badge.replaceWith(open); else box.querySelector('.box-head a.btn')?.replaceWith(open);
  body.push(make('p', 'note card-note', 'Stripe pays it into your bank on its own schedule. The NutPub never holds it.'));
  box.querySelectorAll('.card-body, .stripe-room, .card-box > p.note').forEach((x) => x.remove());
  const wrap = make('div', 'card-body');
  wrap.append(...body);
  box.append(wrap);
}
