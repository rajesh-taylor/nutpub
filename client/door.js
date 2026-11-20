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
// The Doorman's List (agreed 17 Nov; blind-signed tickets 20 Nov): green Let them in, Authorised ticket., the three
// checks in short form, then what the door can still know. Never a name, nor which purchase.
const WORDS = {
  in: ['Let them in', 'Authorised ticket.'],
  already: ['Already in', ''],
  unknown: ['Not a ticket', 'Not signed by tonight’s gig.'],
  stale: ['Old QR', 'Ask them to open the ticket page, then scan again.'],
  off: ['Door check off', 'The artist hasn’t turned the door check on for this gig.'],
};
const CHECKS = [['signed', 'Signed by tonight’s gig'], ['fresh', 'QR fresh (30 s)'], ['first', 'First time in']];
function show(state, big, small, checks = null, line = '') {
  $('result').dataset.state = state;
  $('big').textContent = big;
  $('small').textContent = small;
  $('checks').replaceChildren(...CHECKS.filter(([k]) => checks && k in checks).map(([k, words]) =>
    Object.assign(document.createElement('li'), { className: checks[k] ? 'ok' : 'no', textContent: `${checks[k] ? '✓' : '✗'} ${words}` })));
  $('checks').hidden = !checks;
  $('paid').textContent = line;
  $('paid').hidden = !line;
}
const count = async () => { const c = await api('GET', '/api/door/count'); $('inside').textContent = c.inside; $('sold').textContent = c.sold; return c; };

async function scan(proof) {
  try {
    const out = await api('POST', '/api/door/scan', { proof });
    const [big, small] = WORDS[out.result] || WORDS.unknown;
    const at = out.at && new Date(out.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const line = out.sold ? `${out.result === 'in' ? 'A venue ticket for tonight · ' : ''}${out.inside} in of ${out.sold} sold` : '';
    show(out.result, big, out.result === 'already' ? `Scanned at ${at}.` : small, out.checks || null, line);
    await count();
  } catch (e) { show('unknown', 'Try again', e.message); }
}
function fromHash() {
  const b = new URLSearchParams(location.hash.slice(1)).get('b');
  const old = new URLSearchParams(location.hash.slice(1)).get('t'); // a ticket page from before 20 Nov
  if (b || old) history.replaceState(null, '', location.pathname);
  if (b) scan(b);
  else if (old) show('unknown', 'Old ticket page', 'Ask them to reload the ticket page, then scan again.');
}

try {
  const c = await count();
  if (!c.on) show('off', ...WORDS.off);
} catch (e) {
  $('locked').hidden = false;
  if (e.status !== 403) $('locked').textContent = `Couldn't reach the server: ${e.message}`;
  else if (key) $('locked').textContent = e.message;
  throw e;
}
$('page').hidden = false;
fromHash();
addEventListener('hashchange', fromHash);
setInterval(() => { if (!document.hidden) count().catch(() => {}); }, 30_000);
