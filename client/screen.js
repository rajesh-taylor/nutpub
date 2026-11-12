// The room's tippers screen (/longy/screen): for the venue's big screen. Each tip as it comes in, by handle and sats,
// newest on top; never the words (a big screen in a pub is no place for them). The gig page's one request, /api/tick,
// at the pace it asks for; a tip a moderator deletes goes from here too.
const $ = (id) => document.getElementById(id);
const SHOWN = 6;
let after = 0;
let updated = '';
let every = 2;
const tips = [];

const sats = (n) => `${n.toLocaleString('en-GB')} sat${n === 1 ? '' : 's'}`;

function draw(fresh) {
  const list = $('tips');
  list.replaceChildren(...tips.slice(0, SHOWN).map((t) => {
    const li = document.createElement('li');
    li.dataset.id = t.id;
    if (fresh.has(t.id)) li.className = 'new';
    const who = document.createElement('span'); who.className = 'who'; who.textContent = t.who;
    const amt = document.createElement('span'); amt.className = 'sats'; amt.textContent = sats(t.sats);
    li.append(who, amt);
    return li;
  }));
  $('empty').hidden = tips.length > 0;
}

async function tick() {
  const res = await fetch(`/api/tick?after=${after}&shown=${encodeURIComponent(updated)}`, { cache: 'no-store' });
  if (!res.ok) return;
  const now = await res.json();
  every = now.every || every;
  if (now.show) {
    updated = now.updated || '';
    const name = now.show.artist || now.show.title || 'tonight';
    $('artist').textContent = name;
    document.title = `Tips · ${name}`;
    $('where').textContent = `${location.host}${location.pathname.replace(/\/screen$/, '')}`;
  }
  const fresh = new Set();
  for (const m of now.messages || []) {
    after = Math.max(after, m.id);
    if (m.sats > 0) { tips.unshift({ id: m.id, who: m.who, sats: m.sats }); fresh.add(m.id); }
  }
  const gone = new Set(now.deleted || []);
  for (let i = tips.length - 1; i >= 0; i -= 1) if (gone.has(tips[i].id)) tips.splice(i, 1);
  tips.length = Math.min(tips.length, 50);
  draw(fresh);
}

async function loop() {
  await tick().catch(() => {});
  setTimeout(loop, every * 1000);
}
loop();

// The screen stays on, and goes full screen with a tap (the button then hides).
const awake = async () => { try { await navigator.wakeLock?.request('screen'); } catch { /* not allowed: fine */ } };
awake();
document.addEventListener('visibilitychange', () => { if (!document.hidden) awake(); }); // the lock goes when the tab hides
$('full').addEventListener('click', () => { document.documentElement.requestFullscreen?.().catch(() => {}); awake(); });
document.addEventListener('fullscreenchange', () => { $('full').hidden = !!document.fullscreenElement; });
