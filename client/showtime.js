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
// An example gig (a stage's setlist): its set plays from a recording, so no Larix. The stream button becomes a status
// light, ● On air, and the signal box says so (Rajesh 14 Nov).
const LIST = await api('GET', '/api/admin/setlist').then((r) => r.setlist).catch(() => null);
const EXAMPLE = !!LIST;
// Gig 3 on a judge's stage (session 40): End night calls last orders, then a no-show's ticket and beer token are paid
// from a wallet of its own in this browser (noshow.js), so Takings has an unpoured drink going to Longy.
const NOSHOW = !!LIST?.only && LIST.at === 'pickle' && !!info.show.ticket?.price && !!info.show.drink?.price;
const mintUrl = NOSHOW ? (await fetch('/api/health').then((r) => r.json()).catch(() => null))?.mint?.url : null;
if (NOSHOW && mintUrl) import('./noshow.js').then((m) => m.noShowReady(mintUrl, info.show.ticket.price)).catch(() => {}); // test sats ahead of time
let lastOrders = false; // End night's few seconds: the button says Last orders…
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
    if (lastOrders && b.dataset.stage === 'closed') continue; // Last orders… stays until the night's over
    const i = ORDER.indexOf(b.dataset.stage);
    const [next, current, past] = (phone.matches ? SHORT : LABEL)[b.dataset.stage];
    const isNow = i === at && now.stage !== 'doors';
    b.disabled = b.dataset.stage !== NEXT[now.stage];
    b.classList.toggle('now', isNow);
    b.classList.toggle('done', i < at || (isNow && now.stage === 'closed'));
    b.textContent = i < at || (isNow && now.stage === 'closed') ? TICK + past : isNow ? current : next;
    const light = EXAMPLE && b.dataset.stage === 'open' && now.stage !== 'doors';
    b.classList.toggle('on-air', light);
    if (light) b.textContent = now.stage === 'closed' ? '\u25cf Off air' : '\u25cf On air';
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
  if (EXAMPLE && !now.live) {
    $('signal').classList.toggle('on', now.stage !== 'closed' && !before);
    $('signal-head').textContent = now.stage === 'closed' ? 'Off air' : before ? 'Ready: the set is a recording' : 'On air: the set plays from a recording';
    $('signal-text').textContent = now.stage === 'closed' ? 'The night is over.' : 'No Larix needed on an example gig. Viewers can watch now.';
    preview();
    return;
  }
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

// A free stream opens only once it's paid for on Plan gig (session 35, upfront.js): until then, say so.
const freeNow = info.show.stream.mode === 'free' ? await api('GET', '/api/admin/free-stream').catch(() => null) : null;
const unpaid = () => !!freeNow && !freeNow.covered;
$('unpaid-note').hidden = !unpaid();
// Rajesh 21 Nov (session 47): the browser's own confirm box looked out of place (and some browsers cancel it unseen),
// so the question asks in the page's own look: the safe answer outlined, the one that goes ahead amber.
function ask(text, yes, no = 'Not yet') {
  return new Promise((done) => {
    const d = Object.assign(document.createElement('dialog'), { className: 'ask' });
    d.innerHTML = '<p></p><div class="ask-btns"><button type="button" class="btn quiet"></button><button type="button" class="btn primary"></button></div>';
    d.querySelector('p').textContent = text;
    const [n, y] = d.querySelectorAll('button');
    n.textContent = no;
    y.textContent = yes;
    const end = (answer) => { d.close(); d.remove(); done(answer); };
    n.onclick = () => end(false);
    y.onclick = () => end(true);
    d.addEventListener('cancel', (e) => { e.preventDefault(); end(false); }); // Esc
    document.body.append(d);
    d.showModal();
    n.focus();
  });
}
for (const b of buttons) {
  b.onclick = async () => {
    const s = b.dataset.stage;
    if (['open', 'on'].includes(s) && unpaid()) { $('unpaid-note').hidden = false; $('unpaid-note').classList.add('flash'); return; }
    if (s === 'closed' && !(await ask('End night? Every phone goes to Cheers and everyone watching stops.', 'End night'))) return;
    if (s === 'open' && now.opensAt && Date.now() / 1000 < now.opensAt
      && !(await ask(`Open the stream to viewers now? It would open by itself at ${clock(now.opensAt)}.`, 'Open it now'))) return;
    (async () => {
      if (s === 'closed' && NOSHOW && mintUrl) {
        lastOrders = true;
        b.disabled = true;
        b.textContent = 'Last orders\u2026';
        try {
          await api('POST', '/api/admin/last-orders');
          const show = await fetch('/api/show').then((r) => r.json());
          await (await import('./noshow.js')).noShow(mintUrl, show.show.ticket.price);
        } catch (e) { console.warn('[no-show]', e.message); } // the night ends anyway
        lastOrders = false;
      }
      await stage(s);
    })().catch((e) => { if (e.status === 409) { $('unpaid-note').hidden = false; } });
  };
}
await stage();
setInterval(() => { if (!document.hidden) stage().catch(() => {}); }, 5_000);
