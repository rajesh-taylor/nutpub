// Page 2's bar strip: the drinks bought at the door, each with Pour. The bar's key lives in this browser's 'nutpub-bar'
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
    else { clink(); say(`Drink ${id} poured: ${sats(d.sats)} to the bar. Watch the phone.`); }
  } catch (e) { say(e.message); }
  refresh().catch(() => {});
}

async function refresh() {
  const drinks = await api('GET', '/api/admin/drinks');
  $('bar-drinks').replaceChildren(...drinks.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = d.poured ? 'btn quiet' : 'btn';
    b.textContent = d.collected_by === 'artist' ? `Drink ${d.id} · went to the artist` : d.poured ? `Drink ${d.id} · pour again` : `Pour drink ${d.id}`;
    b.disabled = d.collected_by === 'artist';
    b.onclick = () => pour(d.id);
    return b;
  }));
  $('bar-strip').hidden = !drinks.length;
}

await refresh();
setInterval(() => refresh().catch(() => {}), 3000);
