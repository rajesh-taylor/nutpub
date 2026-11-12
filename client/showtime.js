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
  for (const b of buttons) b.disabled = b.dataset.stage !== NEXT[now.stage];
  $('after').hidden = now.stage !== 'closed';
  document.body.dataset.stage = now.stage;
  signal();
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
