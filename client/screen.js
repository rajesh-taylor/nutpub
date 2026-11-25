// The room's tippers screen (/longy/screen): for the venue's big screen. Tonight's top three tippers (the server adds
// them up, ?top=1), then the chat as it comes in: handle · sats · words, newest at the bottom (session 45). The gig page's one request,
// /api/tick, at the pace it asks for; a message a moderator deletes goes from here too. Comments off: tips only, no words.
const $ = (id) => document.getElementById(id);
const SHOWN = 12; // fit() keeps what fits: the newest, real lines before scripted ones (session 45)
let after = 0;
let updated = '';
let every = 2;
const feed = [];

const sats = (n) => `${n.toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;
const cell = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });

// Only the lines that fit whole (Rajesh 19 Nov: the latest was cut in half). Session 45 (Rajesh 21 Nov): the chat reads
// from the bottom up, newest at the bottom, as in the full screen and the chat box; what doesn't fit goes off the top.
// Measured from the layout (offsetHeight), not the screen: a new line slides in and looks shorter than it ends up.
function fit() {
  const box = $('feed-box');
  const list = $('feed');
  if (!box || !list || box.hidden) return;
  const head = box.querySelector('h2');
  const room = box.clientHeight - head.offsetHeight - parseFloat(getComputedStyle(head).marginBottom);
  // Too many: the example gig's scripted lines go first, oldest first, so what people really typed and tipped stays in
  // view (Rajesh 21 Nov). Nothing marks whose line is whose.
  while (list.children.length > 1 && list.offsetHeight > room) {
    const scripted = [...list.children].filter((li) => li.classList.contains('cue'));
    (scripted.length > 1 ? scripted[0] : list.firstElementChild).remove();
  }
}

addEventListener('resize', () => draw(new Set()));
document.fonts?.ready.then(() => draw(new Set()));

// On a judge's stage, a note on what this page is for (Rajesh 19 Nov).
fetch('/api/show').then((r) => r.json()).then((s) => { if (s.judge) { $('screen-judge').hidden = false; document.body.classList.add('judging'); draw(new Set()); } }).catch(() => {});

const byCardTag = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100} by card`; // a card tip's pounds (session 62b)
function draw(fresh, top) {
  $('feed-box').hidden = !feed.length;
  $('feed').replaceChildren(...feed.slice(0, SHOWN).reverse().map((m) => { // oldest first: the newest at the bottom
    const li = document.createElement('li');
    if (fresh.has(m.id)) li.classList.add('new');
    if (m.cue) li.classList.add('cue');
    li.append(cell(m.nostr ? 'who nostr' : 'who', m.who));
    if (m.nutzap) li.append(cell('zap', 'Nutzap'));
    if (m.sats) li.append(cell('sats', sats(m.sats)));
    if (m.pence) li.append(cell('sats by-card', byCardTag(m.pence)));
    if (m.text) li.append(cell('words', m.text));
    return li;
  }));
  fit();
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
  // Session 51 (Rajesh): once every goal's met the band goes, so it never reads as "no more tips needed", and the chat
  // and Superfans get the room. Only the artist's thanks stays, if there is one.
  $('goals').hidden = allMet && !done;
  $('goals').classList.toggle('thanks-only', done);
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
    document.title = `Pub TV · ${name}`;
    // The artist's own Lightning address under the QR (Rajesh 21 Nov), else the gig page's address.
    $('where').textContent = now.lightning ? `⚡ ${now.lightning}` : `${location.host}${location.pathname.replace(/\/screen$/, '')}`;
    $('qr').src = `/api/show/qr.svg?u=${encodeURIComponent(updated)}`;
  }
  const fresh = new Set();
  for (const m of now.messages || []) {
    if (m.back) { // a line back after Undo (session 56): in its place (newest first), once
      if ((m.sats > 0 || m.pence > 0 || m.text) && !feed.some((f) => f.id === m.id)) {
        const at = feed.findIndex((f) => f.id < m.id);
        feed.splice(at < 0 ? feed.length : at, 0, { id: m.id, who: m.who, nostr: !!m.nostr, nutzap: !!m.nutzap, sats: m.sats, pence: m.pence || 0, text: m.text, cue: !!m.cue });
        fresh.add(m.id);
      }
      continue;
    }
    after = Math.max(after, m.id);
    if (m.sats > 0 || m.pence > 0 || m.text) { feed.unshift({ id: m.id, who: m.who, nostr: !!m.nostr, nutzap: !!m.nutzap, sats: m.sats, pence: m.pence || 0, text: m.text, cue: !!m.cue }); fresh.add(m.id); }
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
