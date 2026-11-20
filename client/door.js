// The door's page (/door.html#k=<the door link's key>, or #b=<the ticket's proof> from a ticket's QR): one scan, once.
// Blind-signed tickets (session 39): the door sees that tonight's gig signed the ticket, that its QR is fresh and that
// it's the first time in; never which purchase it came from.
// The phone's own camera opens the QR's link in its default browser, where the key was saved when the door link was
// first opened. The artist's own browser opens it too, with the artist's key.
const $ = (id) => document.getElementById(id);
let key = null;
let artist = null;
const first = new URLSearchParams(location.hash.slice(1));
try {
  if (first.get('k')) localStorage.setItem('nutpub-door', first.get('k'));
  key = localStorage.getItem('nutpub-door');
  artist = localStorage.getItem('nutpub-admin');
} catch {}
if (first.get('k')) history.replaceState(null, '', location.pathname); // the key stays out of the address bar

async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'X-Door': key || '', 'X-Admin': artist || '', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.detail || r.statusText), { status: r.status });
  return data;
}
// The Doorman's List (agreed 17 Nov; blind-signed tickets 20 Nov; designed 21 Nov, the Artifact "NutPub Doorman's
// List"): one colour fills the screen, with a shape as well as a word (✓ ✕ ↻), so it reads from arm's length in a dark
// pub, and by doormen who can't tell red from green. The count sits at the top, once. Every answer carries its time,
// and after 15 seconds it steps back to Ready, so an old green can't be shown to the next person. Never a name, nor
// which purchase.
const WORDS = {
  in: ['go', 'Let the Nutter in', 'Authorised ticket.'],
  already: ['stop', 'Already in', ''],
  unknown: ['stop', 'Not a ticket', 'Not signed by tonight’s gig.'],
  stale: ['retry', 'Old QR', 'A real ticket, but a screenshot or a sleeping phone. Ask them to open the ticket page, then scan again.'],
  old: ['retry', 'Old ticket page', 'Ask them to reload the ticket page, then scan again.'],
  retry: ['retry', 'Try again', ''],
  off: ['off', 'Door check off', 'The artist hasn’t turned the door check on for this gig.'],
};
const READY = ['ready', 'Ready', 'Open this phone’s camera and point it at the ticket’s QR. The answer shows here.'];
const MARKS = { go: '✓', stop: '✕', retry: '↻' };
const CHECKS = [['signed', 'Signed by tonight’s gig'], ['fresh', 'QR fresh (30 s)'], ['first', 'First time in']];
const HOLD = 15_000;
const hhmm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
let back = null;
function show(look, big, small, { checks = null, at = null } = {}) {
  clearTimeout(back);
  $('result').dataset.look = look;
  $('mark').textContent = MARKS[look] || '';
  $('big').textContent = big;
  $('small').textContent = small;
  $('small').hidden = !small;
  $('checks').replaceChildren(...CHECKS.filter(([k]) => checks && k in checks).map(([k, words]) =>
    Object.assign(document.createElement('li'), { className: checks[k] ? 'ok' : 'no', textContent: `${checks[k] ? '✓' : '✕'} ${words}` })));
  $('checks').hidden = !checks;
  $('when').textContent = at ? `Scanned ${hhmm(at)}` : '';
  $('when').hidden = !at;
  $('last').hidden = true;
  if (at) back = setTimeout(() => { // back to Ready, with the last answer small under it
    show(...READY);
    $('last').textContent = `Last: ${big} · ${hhmm(at)}`;
    $('last').hidden = false;
  }, HOLD);
}
const count = async () => {
  const c = await api('GET', '/api/door/count');
  $('inside').textContent = c.inside; $('sold').textContent = c.sold; $('count').hidden = false;
  return c;
};
// "This ticket came in at 21:04, 6 minutes ago."
function cameIn(at) {
  const min = Math.floor((Date.now() - new Date(at).getTime()) / 60_000);
  return `This ticket came in at ${hhmm(at)}, ${min < 1 ? 'just now' : min === 1 ? '1 minute ago' : `${min} minutes ago`}.`;
}

async function scan(proof) {
  try {
    const out = await api('POST', '/api/door/scan', { proof });
    const [look, big, small] = WORDS[out.result] || WORDS.unknown;
    if (out.result === 'off') show(look, big, small);
    else show(look, big, out.result === 'already' && out.at ? cameIn(out.at) : small, { checks: out.checks || null, at: Date.now() });
    await count();
  } catch (e) { const [look, big] = WORDS.retry; show(look, big, e.message, { at: Date.now() }); }
}
function fromHash() {
  const b = new URLSearchParams(location.hash.slice(1)).get('b');
  const old = new URLSearchParams(location.hash.slice(1)).get('t'); // a ticket page from before 20 Nov
  if (b || old) history.replaceState(null, '', location.pathname);
  if (b) scan(b);
  else if (old) show(...WORDS.old.slice(0, 3), { at: Date.now() });
}
// The phone stays awake while the page is open, between fans (the browser's wake lock; asked again on coming back).
async function awake() {
  if (document.hidden) return;
  try { await navigator.wakeLock?.request('screen'); } catch {}
}

try {
  const c = await count();
  if (!c.on) show(...WORDS.off);
} catch (e) {
  $('locked').hidden = false;
  if (e.status !== 403) $('locked').textContent = `Couldn't reach the server: ${e.message}`;
  else if (key) $('locked').textContent = e.message;
  throw e;
}
$('result').hidden = false;
fromHash();
awake();
addEventListener('hashchange', fromHash);
document.addEventListener('visibilitychange', awake);
setInterval(() => { if (!document.hidden) count().catch(() => {}); }, 30_000);
