// The room's tippers screen (/longy/screen): for the venue's big screen. Tonight's top three tippers (the server adds
// them up, ?top=1), then the chat as it comes in: handle · sats · words, newest on top. The gig page's one request,
// /api/tick, at the pace it asks for; a message a moderator deletes goes from here too. Comments off: tips only, no words.
const $ = (id) => document.getElementById(id);
const SHOWN = 6;
let after = 0;
let updated = '';
let every = 2;
const feed = [];

const sats = (n) => `${n.toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;
const cell = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });

function draw(fresh, top) {
  $('feed-box').hidden = !feed.length;
  $('feed').replaceChildren(...feed.slice(0, SHOWN).map((m) => {
    const li = document.createElement('li');
    if (fresh.has(m.id)) li.className = 'new';
    li.append(cell(m.nostr ? 'who nostr' : 'who', m.who));
    if (m.nutzap) li.append(cell('zap', 'Nutzap'));
    if (m.sats) li.append(cell('sats', sats(m.sats)));
    if (m.text) li.append(cell('words', m.text));
    return li;
  }));
  if (!top) return;
  $('top-box').hidden = !top.length;
  $('top').replaceChildren(...top.map((t, i) => {
    const li = document.createElement('li');
    li.append(cell('n', `${i + 1}`), cell(t.nostr ? 'who nostr' : 'who', t.who), cell('sats', sats(t.sats)));
    return li;
  }));
}

// The stretch goals, fed by tonight's tips: the gig page's track (viewer.js goal()), wide. One track from 0 to the
// last goal, a mic at each, amber once met, the goal's name and amount under it; the artist's thanks once all are met.
const short = (n) => (n < 1000 ? String(n) : n < 1e6 ? `${+(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${+(n / 1e6).toFixed(1)}M`);
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
let goalsKey = '';
function goals(tipped, all, thanks) {
  const key = JSON.stringify([tipped, all, thanks]);
  if (key === goalsKey) return;
  goalsKey = key;
  const list = [...(all || [])].sort((a, b) => a.at - b.at).slice(0, 3);
  const top = list[list.length - 1];
  $('goals').hidden = !top;
  if (!top) return;
  const next = list.find((g) => tipped < g.at) || top;
  const allMet = tipped >= top.at;
  const done = allMet && !!thanks;
  $('goal-sum').textContent = allMet ? `${short(tipped)} sats · all met` : `${short(tipped)} / ${short(next.at)} sats`;
  $('thanks').hidden = !done;
  $('thanks').textContent = done ? thanks : '';
  $('track').hidden = done;
  $('bar').style.width = `${Math.min(100, (tipped / top.at) * 100)}%`;
  $('track').querySelectorAll('.mic').forEach((m) => m.remove());
  for (const g of list) {
    const mic = document.createElement('div');
    mic.className = `mic${tipped >= g.at ? ' met' : ''}`;
    mic.style.left = `${(g.at / top.at) * 100}%`;
    mic.innerHTML = MIC; // our own fixed icon, never the artist's text
    const label = document.createElement('span');
    label.textContent = `${tipped >= g.at ? '✓ ' : ''}${g.label} · ${short(g.at)}`;
    mic.append(label);
    $('track').append(mic);
  }
  // A phone held upright has no room under the mics: the same goals on one line under the track.
  $('goal-list').hidden = done;
  $('goal-list').replaceChildren(...list.flatMap((g, i) => {
    const el = Object.assign(document.createElement('span'), { className: tipped >= g.at ? 'met' : '', textContent: `${tipped >= g.at ? '✓ ' : ''}${g.label} ${short(g.at)}` });
    return i ? [' · ', el] : [el];
  }));
}

async function tick() {
  const res = await fetch(`/api/tick?top=1&after=${after}&shown=${encodeURIComponent(updated)}`, { cache: 'no-store' });
  if (!res.ok) return;
  const now = await res.json();
  every = now.every || every;
  if (now.show) {
    updated = now.updated || '';
    const name = now.show.artist || now.show.title || 'tonight';
    $('artist').textContent = name;
    document.title = `Tips · ${name}`;
    $('where').textContent = `${location.host}${location.pathname.replace(/\/screen$/, '')}`;
    $('qr').src = `/api/show/qr.svg?u=${encodeURIComponent(updated)}`;
  }
  const fresh = new Set();
  for (const m of now.messages || []) {
    after = Math.max(after, m.id);
    if (m.sats > 0 || m.text) { feed.unshift({ id: m.id, who: m.who, nostr: !!m.nostr, nutzap: !!m.nutzap, sats: m.sats, text: m.text }); fresh.add(m.id); }
  }
  const gone = new Set(now.deleted || []);
  for (let i = feed.length - 1; i >= 0; i -= 1) if (gone.has(feed[i].id)) feed.splice(i, 1);
  feed.length = Math.min(feed.length, 50);
  draw(fresh, now.top);
  goals(now.tipped || 0, now.goals, now.thanks);
}

async function loop() {
  await tick().catch(() => {});
  setTimeout(loop, every * 1000);
}
loop();

// The screen stays on, and goes full screen with a tap (the button then hides). An iPhone's Safari can't put a page
// full screen, so the button shows only where it works.
$('full').hidden = !document.fullscreenEnabled;
const awake = async () => { try { await navigator.wakeLock?.request('screen'); } catch { /* not allowed: fine */ } };
awake();
document.addEventListener('visibilitychange', () => { if (!document.hidden) awake(); }); // the lock goes when the tab hides
$('full').addEventListener('click', () => { document.documentElement.requestFullscreen?.().catch(() => {}); awake(); });
document.addEventListener('fullscreenchange', () => { $('full').hidden = !!document.fullscreenElement || !document.fullscreenEnabled; });
