// Show Time: sign-in, the two views, the artist's own look at the stream, and three big buttons. Only the next step
// is lit: Start stream (the public sees it from now; it opens by itself at the start time), Start show (room
// phones change to the picture), End night.
const $ = (id) => document.getElementById(id);
let key = null;
try { key = localStorage.getItem('nutpub-admin'); } catch {}
const api = (method, url, body) => fetch(url, { method, headers: { 'X-Admin': key || '', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  .then(async (r) => { if (!r.ok) throw Object.assign(new Error(r.statusText), { status: r.status }); return r.json(); });

try { await api('GET', '/api/admin/drinks'); } catch { $('locked').hidden = false; throw new Error('signed out'); }
$('page').hidden = false;
const info = await fetch('/api/show').then((r) => r.json());
$('home').src = `${info.path}?as=home`;
$('phone').src = info.path;
// The room's tippers screen: the venue opens it on their TV before doors.
const screenLink = `${location.origin}${info.path}/screen`;
$('screen-open').href = screenLink;
$('screen-copy').addEventListener('click', async () => {
  const b = $('screen-copy');
  const icon = b.innerHTML;
  try { await navigator.clipboard.writeText(screenLink); b.textContent = '✓'; b.style.color = 'var(--amber)'; } catch { prompt('The room screen\u2019s link:', screenLink); }
  setTimeout(() => { b.innerHTML = icon; b.style.color = ''; }, 2000);
});
// Nutzaps are always on: this page sends the artist's "Nutzap me here" note when the NutPub has none (artist-nostr.js).
import('./artist-nostr.js').then(({ nutzapsOn }) => nutzapsOn(api, info.artistKey)).catch(() => {});

const streamed = info.show.stream.mode !== 'off';
$('stream-btn').hidden = !streamed;
$('signal').hidden = !streamed;

const clock = (at) => new Date(at * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const NEXT = { doors: streamed ? 'open' : 'on', open: 'on', on: 'closed', closed: null };
const buttons = [...document.querySelectorAll('[data-stage]')];
let now = { stage: 'doors' };

async function stage(next) {
  if (next) await api('POST', '/api/admin/stage', { stage: next });
  now = await fetch('/api/stage').then((r) => r.json());
  steps();
  $('after').hidden = now.stage !== 'closed';
  document.body.dataset.stage = now.stage;
  signal();
}

// Option 3 (14 Nov): the buttons say where you are, and one line under them says since when. Done steps get a tick,
// the step you're on is lit, the next one is the only one to press. The stream's own clock comes first: it's when
// the stream first reached us (Stream records from then).
const ORDER = ['doors', 'open', 'on', 'closed'];
const LABEL = { open: ['Start stream', 'Stream on', 'Stream on'], on: ['Start show', 'The show is on', 'Show on'], closed: ['End night', 'Night over', 'Night over'] };
const SHORT = { open: ['Start stream', 'Streaming', 'Stream'], on: ['Start show', 'Show on', 'Show'], closed: ['End night', 'Ended', 'Ended'] }; // one line each on a phone
const phone = matchMedia('(max-width: 700px)');
phone.onchange = () => steps();
const TICK = '\u2713 ';
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const lasted = (iso) => { const m = Math.max(0, Math.floor((now.now - Date.parse(iso)) / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
function steps() {
  const at = ORDER.indexOf(now.stage);
  for (const b of buttons) {
    const i = ORDER.indexOf(b.dataset.stage);
    const [next, current, past] = (phone.matches ? SHORT : LABEL)[b.dataset.stage];
    const isNow = i === at && now.stage !== 'doors';
    b.disabled = b.dataset.stage !== NEXT[now.stage];
    b.classList.toggle('now', isNow);
    b.classList.toggle('done', i < at || (isNow && now.stage === 'closed'));
    b.textContent = i < at || (isNow && now.stage === 'closed') ? TICK + past : isNow ? current : next;
  }
  const t = now.times || {};
  const open = t.open || (now.stage !== 'doors' && now.opensAt ? new Date(now.opensAt * 1000).toISOString() : null);
  const parts = [];
  if (now.stage === 'on' && t.on) parts.push(['b', `The show is on, since ${hhmm(t.on)}`]);
  if (now.stage === 'closed' && t.closed) parts.push(['b', `Night over at ${hhmm(t.closed)}`]);
  if (open && now.stage !== 'doors') parts.push([now.stage === 'open' ? 'b' : '', `stream on since ${hhmm(open)}`]);
  if (now.reachedAt && now.live) parts.push(['', `streaming for ${lasted(now.reachedAt)} (since ${hhmm(now.reachedAt)})`]);
  $('times').hidden = !parts.length;
  $('times').replaceChildren(...parts.flatMap(([tag, text], i) => {
    const out = i ? text : text.charAt(0).toUpperCase() + text.slice(1);
    return [...(i ? [' · '] : []), tag ? Object.assign(document.createElement('b'), { textContent: out }) : out];
  }));
}

// What the artist needs to know before going out: is the stream reaching us, and can viewers see it yet.
function signal() {
  const before = now.stage === 'doors';
  $('signal').classList.toggle('on', !!now.live);
  $('signal-head').textContent = now.live
    ? (before ? 'Your stream is reaching us' : now.stage === 'closed' ? 'Your stream is still coming in' : 'You’re live')
    : 'No stream coming in yet';
  $('signal-text').textContent = now.live
    ? (before ? `Viewers see the countdown and nobody pays yet. ${now.opensAt ? `It opens by itself at ${clock(now.opensAt)}, or press Start stream.` : 'It opens when you press Start stream.'}`
      : now.stage === 'closed' ? 'The night is over: stop streaming in Larix, OBS or Ecamm.' : 'Viewers can watch now.')
    : `Start streaming from Larix, OBS or Ecamm (the server and key are on Plan gig).${before && now.opensAt ? ` The stream opens to viewers at ${clock(now.opensAt)}.` : ''}`;
  preview();
}

// The preview: the real picture, muted until the artist turns the sound up. A token from the host's own route,
// renewed every minute: no seat and no charge.
let hls = null;
let Hls = null;
let token = '';
let renewTimer = null;
const withToken = (url) => url.replace(/^(https:\/\/[^/]+\/)[^/]+(\/manifest\/)/, `$1${token}$2`);
async function preview() {
  const v = $('preview');
  if (!now.live) {
    if (hls) { hls.destroy(); hls = null; v.removeAttribute('src'); v.load(); }
    clearTimeout(renewTimer); renewTimer = null;
    $('preview-box').hidden = true;
    return;
  }
  if (hls || renewTimer) return;
  $('preview-box').hidden = false;
  const renew = async () => {
    let reply = { off: true };
    try { reply = await api('GET', '/api/admin/live/preview'); } catch {}
    if (reply.off) { renewTimer = setTimeout(renew, 10_000); return; }
    token = new URL(reply.url).pathname.split('/')[1];
    if (!hls) {
      Hls ??= (await import('hls.js')).default;
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: false, xhrSetup: (xhr, url) => xhr.open('GET', withToken(url)) });
        hls.loadSource(reply.url);
        hls.attachMedia(v);
      } else { v.src = reply.url; hls = { destroy() {} }; } // Safari without MSE: its own player
      v.play().catch(() => {});
    }
    renewTimer = setTimeout(renew, reply.every * 1000);
  };
  renew();
}

for (const b of buttons) {
  b.onclick = () => {
    const s = b.dataset.stage;
    if (s === 'closed' && !confirm('End night? Every phone goes to Cheers and everyone watching stops.')) return;
    if (s === 'open' && now.opensAt && Date.now() / 1000 < now.opensAt
      && !confirm(`Open the stream to viewers now? It would open by itself at ${clock(now.opensAt)}.`)) return;
    stage(s);
  };
}
await stage();
setInterval(() => { if (!document.hidden) stage().catch(() => {}); }, 5_000);
