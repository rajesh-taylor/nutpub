// The door's page (/door.html#k=<the door link's key>, or #t=<ticket code>.<time code> from a ticket's QR): one
// scan, once.
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
// The Doorman's List (agreed 17 Nov): green Let them in, Authorised ticket., then what was paid; never a name.
const WORDS = {
  in: ['Let them in', 'Authorised ticket.'],
  already: ['Already in', ''],
  online: ['Watch online', 'For watching online, not for the venue.'],
  unknown: ['Not a ticket', 'Not for this gig.'],
  stale: ['Old QR', 'The ticket’s QR changes every 30 seconds. Ask them to open the ticket page, then scan again.'],
  off: ['Door check off', 'The artist hasn’t turned the door check on for this gig.'],
};
function show(state, big, small, paid = '') {
  $('result').dataset.state = state;
  $('big').textContent = big;
  $('small').textContent = small;
  $('paid').textContent = paid;
  $('paid').hidden = !paid;
}
// "Ticket 1 · paid £35 (72,262 sats) on 19 Nov"
const paidLine = (o) => {
  if (!o?.n) return '';
  const sats = `${Number(o.sats).toLocaleString('en-GB')} sats`;
  const day = o.paidAt ? ` on ${new Date(o.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  return `Ticket ${o.n} · paid ${o.pence ? `£${(o.pence / 100).toFixed(2).replace(/\.00$/, '')} (${sats})` : sats}${day}`;
};
const count = async () => { const c = await api('GET', '/api/door/count'); $('inside').textContent = c.inside; $('sold').textContent = c.sold; return c; };

async function scan(code, otp = '') {
  try {
    const out = await api('POST', '/api/door/scan', { code, otp });
    const [big, small] = WORDS[out.result];
    show(out.result, big, out.result === 'already' ? `Scanned at ${new Date(out.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : small, paidLine(out));
    await count();
  } catch (e) { show('unknown', 'Try again', e.message); }
}
function fromHash() {
  const t = new URLSearchParams(location.hash.slice(1)).get('t');
  if (t) { history.replaceState(null, '', location.pathname); scan(...t.split('.')); }
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
