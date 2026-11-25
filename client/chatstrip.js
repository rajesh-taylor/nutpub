// Show Time's chat strip (session 55c): the artist alone on stage looks over between songs. The newest 8 lines, each
// with Quiet: one tap takes the line off and keeps that phone's words out of the chat tonight (its own page still
// shows them, nobody else's); its tips still reach the artist. Undo lets the last one back. A producer gets it too.
// Opening Show Time also looks for a newer Nostr mute list (the artist's own browser only: a producer's has no say).
import { refreshMuteList } from './mute.js';

const $ = (id) => document.getElementById(id);
let key = null;
try { key = localStorage.getItem('nutpub-admin'); } catch {}
const api = (method, url, body) => fetch(url, { method, headers: { 'X-Admin': key || '', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  .then(async (r) => { const out = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(out.detail || r.statusText), { status: r.status }); return out; });
const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text != null ? { textContent: text } : {}) });
const say = (text) => { $('chat-say').textContent = text; };
const SAY = 'Quiet takes the line off and keeps that phone’s words off your chat tonight. Its tips still reach you.';

let drawn = '';
function draw(s) {
  $('chat-strip').hidden = false;
  const now = JSON.stringify(s);
  if (now === drawn) return;
  drawn = now;
  $('chat-lines').replaceChildren(...(s.lines.length ? s.lines.map(line) : [el('li', 'none', 'No messages yet.')]));
  const bits = [];
  if (s.quiet.length) bits.push(`Quiet tonight: ${s.quiet.map((q) => q.who).join(', ')}`);
  if (s.muted) bits.push(`Muted on Nostr: ${s.muted}`);
  $('chat-quiet').hidden = !bits.length;
  $('chat-quiet-text').textContent = bits.join(' · ');
  const last = s.quiet.at(-1);
  $('chat-undo').hidden = !last;
  $('chat-undo').onclick = last ? () => act('DELETE', `/api/admin/quiet/${last.id}`, null, `${last.who} is back in the chat.`) : null;
}
function line(m) {
  const li = el('li', m.sats ? 'tipped' : '');
  li.append(el('span', m.nostr ? 'from nostr' : 'from', m.who), ' ');
  if (m.mod) li.append(`${m.icon || ''} `.trimStart(), el('span', 'mod-tag', 'Mod'), ' ');
  if (m.sats) li.append(el('b', 'amt', m.sats.toLocaleString('en-GB')), ' ');
  const words = el('span', 'words', m.text);
  li.append(words);
  if (!m.mod) {
    const b = el('button', 'btn quiet hush', 'Quiet');
    b.type = 'button';
    b.setAttribute('aria-label', `Quiet ${m.who} tonight`);
    b.onclick = () => { b.disabled = true; act('POST', '/api/admin/quiet', { message: m.id }, `${m.who} is quiet tonight.`).then(() => { try { localStorage.setItem('nutpub-quieted', location.host); } catch {} }).finally(() => { b.disabled = false; }); };
    li.append(b);
  }
  return li;
}
async function act(method, url, body, done) {
  try { draw(await api(method, url, body)); say(done); setTimeout(() => say(SAY), 4000); } catch (e) { say(e.message); }
}
async function load() {
  try { draw(await api('GET', '/api/admin/chat')); } catch (e) { if (e.status === 403) clearInterval(timer); }
}
const timer = setInterval(() => { if (!document.hidden) load(); }, 4000);
say(SAY);
load();

// The Nostr mute list, newer than the gig's? Only the artist may change it (a producer's request is refused, quietly).
api('GET', '/api/admin/mute-list').then((m) => (m.pubkey ? refreshMuteList(api, m.pubkey, m.at) : null)).then((m) => { if (m) load(); }).catch(() => {});
