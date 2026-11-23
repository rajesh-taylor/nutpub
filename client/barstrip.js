// Show Time's door and bar strips (Let in by hand, 14 Nov): the venue tickets not yet in, each with Let in by hand,
// and the drinks bought at the door, each with Pour by hand. The bar's key lives in this browser's 'nutpub-bar'
// wallet (the bar's own page made it). Pouring spends the drink at the mint; the attendee's phone sees it spent and
// shows the pint (NUT-07). A second pour finds it spent: "Already poured, mate".
import { openWallet } from './wallet.js';
import { unlockAudio, trombone, clink } from './sound.js';

const $ = (id) => document.getElementById(id);
const sats = (v) => `${Number(v || 0).toLocaleString('en-GB')} sats`;
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

const health = await fetch('/api/health').then((r) => r.json());
const bar = await openWallet(health.mint.url, 'nutpub-bar');
const say = (t) => { $('bar-say').textContent = t || ''; };

async function pour(id) {
  unlockAudio();
  say('Pouring…');
  try {
    const d = await api('GET', `/api/admin/drinks/${id}`);
    if (!(await bar.coco.keyring.getKeyPair(d.pubkey))) throw new Error('This drink is locked to a bar key held on another browser: open page 3 there.');
    let spent = d.poured;
    if (!spent) {
      try { await bar.collect(d.token, d.pubkey); } catch (e) { if (!/spent/i.test(e.message)) throw e; spent = true; }
      await api('POST', '/api/admin/locked/collected', { ids: [d.locked], by: 'bar' });
    }
    if (spent) { trombone(); say(`Drink ${id}: Already poured, mate. The mint says it's spent.`); }
    else { clink(); say(`Drink ${id} poured: signed with the bar’s key and swapped at the mint, ${sats(d.sats)} to the bar. Watch the phone.`); } // session 58: say what Pour by hand did
  } catch (e) { say(e.message); }
  refresh().catch(() => {});
}

async function refresh() {
  const drinks = await api('GET', '/api/admin/drinks');
  $('bar-drinks').replaceChildren(...drinks.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = d.poured ? 'btn quiet' : 'btn';
    b.textContent = d.collected_by === 'artist' ? `Drink ${d.id} · went to the artist` : d.poured ? `Drink ${d.id} · pour again` : `Pour by hand · drink ${d.id}`;
    b.disabled = d.collected_by === 'artist';
    b.onclick = () => pour(d.id);
    return b;
  }));
  $('bar-strip').hidden = !drinks.length;
  // Gig 3: the drink is a coin on the fan's phone and the bar pours it here (no camera, Rajesh 17 Nov).
  if (!$('bar-say').textContent.startsWith('Drink') && (await showNow()).drinkCoin) $('bar-say').textContent = 'The fan’s phone shows the drink as a coin. Pour by hand takes it at the mint with the bar’s key.';
}
let shown = null;
const showNow = async () => (shown ||= await fetch('/api/show').then((r) => r.json()).then((s) => s.show));

// The door (blind-signed tickets, 20 Nov): the NutPub can't tell whose ticket is whose, so no list by buyer. A fan with
// no scanner at the door shows a door word on their phone (PUNTER-47); Let in marks that ticket in, as a scan does.
let doorSaid = 0; // when Let in last said something: the strip's own line waits 15 s
async function letIn(word) {
  doorSaid = Date.now();
  try {
    const { result } = await api('POST', '/api/admin/door/let-in', { word });
    $('door-say').textContent = result === 'in' ? `${word} let in. Watch the phone.` : result === 'already' ? `${word} is already in.`
      : result === 'old' ? `${word} is more than 10 minutes old: ask for a new one.` : `No door word ${word}.`;
  } catch (e) { $('door-say').textContent = e.message; }
  doorList().catch(() => {});
}
async function doorList() {
  const show = await fetch('/api/show').then((r) => r.json()).then((s) => s.show);
  const on = show.ticket.on && show.door.on;
  const d = on ? await api('GET', '/api/admin/door') : { words: [], sold: 0 };
  $('door-tickets').replaceChildren(...d.words.map((w) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: w.in_at ? 'btn quiet' : 'btn',
      textContent: w.in_at ? `${w.word} · in` : `${w.word} · waiting at the door · Let in`, disabled: !!w.in_at });
    b.onclick = () => letIn(w.word);
    return b;
  }));
  if (Date.now() - doorSaid > 15_000) $('door-say').textContent = `${d.inside ?? 0} in of ${d.sold} sold. The doormen’s phone scans each ticket’s QR. No phone? The fan shows a door word: Let in.`;
  $('door-strip').hidden = !on || !d.sold;
}

await Promise.all([refresh(), doorList()]);
setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 10_000);
setInterval(() => { if (!document.hidden) doorList().catch(() => {}); }, 4_000); // a door word shows within seconds
