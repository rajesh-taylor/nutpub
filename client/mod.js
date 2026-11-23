// The Mod page (session 55e): <stage>/mod, a page of its own for a gig's moderators, on a laptop. The chat with Quiet,
// Undo and ×, Slow mode and Pin (the main mod's), a box to say something, and one player: the gig page itself in a
// frame, the picture only (?view=player), as the mod sees it on the gig page (free, from before the start time). No
// phone and desktop views: those are the artist's once-over on Show Time. Producers stay on Show Time (Rajesh 24 Nov).
// Signed in as mods are: a passkey mod's browser key or an old link's key (X-Mod), or a Nostr mod through the gig page's
// pass, signed in with their npub (X-Pass). Signed out, the two ways in: Nostr Sign In (the chat's own) or the passkey.
// Nothing here signs or encrypts anything new.
import { signIn, connect, connected, signer, extension, signOut } from './nostr.js';

const $ = (id) => document.getElementById(id);
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text != null ? { textContent: text } : {}) });
const STAGE_ID = /^(?=[a-z0-9]*\d)[a-z][a-z0-9]{5}$/.test(location.hostname.split('.')[0]) ? location.hostname.split('.')[0] : null;
const FRONT = `${location.protocol}//${location.host.split('.').slice(1).join('.')}`; // thenutpub.com, where passkeys live
const NOSTR_MOD = 'nutpub-mod-nostr'; // the gig page's sign, for a Nostr mod's browser
const TOUCH = matchMedia('(pointer: coarse)').matches;

let key = get('nutpub-mod'); // a passkey mod's browser key, or an old link's key
let pass = get('nutpub-pass-home'); // the gig page's pass at home, where mods sign in
let as = 'home';
const headers = () => ({ ...(pass ? { 'X-Pass': pass } : {}), ...(key ? { 'X-Mod': key } : {}), 'Content-Type': 'application/json' });
const api = (method, url, body) => fetch(url, { method, headers: headers(), body: body && JSON.stringify(body) })
  .then(async (r) => { const out = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(out.detail || 'That didn’t work: try again.'), { status: r.status, code: out.error }); return out; });
let sayTimer = null;
const say = (text, ms = 5000) => { $('say').textContent = text; clearTimeout(sayTimer); if (ms) sayTimer = setTimeout(() => { $('say').textContent = ''; }, ms); };
const clock = (at) => new Date(at * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

// A mod's links, and the pin's: http(s) only, opened in a new tab, the rest as text (as the gig page has them).
const LINKS = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|uk|me|app|xyz|link|ly|gg|tv|fm|shop|store|info|biz|music|band|live|events?)\b(?:\/\S*)?/gi;
function withLinks(text) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(LINKS)) {
    const url = m[0].replace(/[.,!?;:)\]]+$/, '');
    out.push(text.slice(at, m.index));
    out.push(Object.assign(document.createElement('a'), { href: /^https?:\/\//i.test(url) ? url : `https://${url}`, textContent: url, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }));
    at = m.index + url.length;
  }
  out.push(text.slice(at));
  return out.filter((x) => x !== '');
}

// Who's asking: the browser key first, then the pass at home, then the room's (a Nostr mod who signed in there).
async function first() {
  try { return await api('GET', '/api/mod/chat'); } catch (e) { if (e.code !== 'not_mod') throw e; }
  const room = get('nutpub-pass');
  if (room && room !== pass) {
    const was = pass;
    pass = room; as = 'room';
    try { return await api('GET', '/api/mod/chat'); } catch (e) { pass = was; as = 'home'; if (e.code !== 'not_mod') throw e; }
  }
  return null;
}
// A pass the server knows, for Nostr Sign In and the mod's own lines: the one at home, or a new one kept there.
async function knownPass() {
  pass ||= get('nutpub-pass-home'); // the player's frame may have made one meanwhile
  if (pass && (await fetch('/api/pass/me', { headers: { 'X-Pass': pass } }).then((r) => r.status).catch(() => 0)) !== 403) return pass;
  pass = (await fetch('/api/pass', { method: 'POST' }).then((r) => r.json())).pass;
  put('nutpub-pass-home', pass);
  return pass;
}

// ---- Signed in.
let me = null;
let gig = null;
let drawn = '';
function start(s) {
  me = s.me;
  gig = s.gig;
  if (me.via === 'nostr') put(NOSTR_MOD, '1');
  $('page').hidden = false;
  $('head-right').hidden = false;
  $('who').textContent = `${me.icon} ${me.name}`.trim(); // the page says Mod already (Rajesh 23 Nov)
  $('who').classList.toggle('nostr', me.via === 'nostr');
  $('sign-out').hidden = !['passkey', 'nostr'].includes(me.via); // a link stays the mod's own
  $('to-gig').href = `${gig.path}${as === 'home' ? '?as=home' : ''}`;
  $('player').src = `${gig.path}?${as === 'home' ? 'as=home&' : ''}view=player`;
  draw(s);
  setInterval(() => { if (!document.hidden) load(); }, 3000);
  // What the player says (Stopped, Paused, not ready yet…): on the gig page it's the line under the picture, which the
  // frame leaves out, so it's shown here.
  setInterval(() => {
    let t = '';
    try { t = $('player').contentDocument?.getElementById('status')?.textContent?.trim() || ''; } catch {}
    $('player-say').textContent = t;
    $('player-say').hidden = !t;
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}
function gigLine() {
  const date = gig.date ? new Date(`${gig.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  $('gig-line').textContent = [gig.artist, gig.venue, date].filter(Boolean).join(' · ');
}
// What fans see now, under the player.
function under() {
  const soon = gig.stage === 'doors';
  const words = gig.stage === 'closed' ? 'The night is over: fans see Cheers.'
    : soon ? `Fans see the countdown${gig.opensAt ? ` until ${clock(gig.opensAt)}` : ''}. You see the stream already.`
      : gig.live ? 'Live: fans see this now.' : 'Fans see this now.';
  $('under').textContent = words;
}
function draw(s) {
  gig = s.gig;
  gigLine();
  under();
  $('under-free').hidden = !s.tipWords;
  $('slow-btn').textContent = `Slow mode · ${s.slow ? 'on' : 'off'}${s.busy ? ' · busy' : ''}`;
  $('slow-btn').setAttribute('aria-pressed', !!s.slow);
  pin(s.pin);
  $('say-form').hidden = !s.comments;
  const now = JSON.stringify([s.lines, s.quiet]);
  if (now === drawn) return;
  drawn = now;
  const box = $('lines');
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40; // reading back up: don't jump
  box.replaceChildren(...(s.lines.length ? s.lines.map(line) : [el('li', 'none', s.comments ? 'No messages yet.' : 'Comments are off for this gig: tips only.')]));
  if (atEnd) box.scrollTop = box.scrollHeight;
  $('quiet-row').hidden = !s.quiet.length;
  $('quiet-text').textContent = s.quiet.length ? `Quiet tonight: ${s.quiet.map((q) => q.who).join(', ')}` : '';
  const last = s.quiet.at(-1);
  $('undo').onclick = last ? () => act('DELETE', `/api/mod/quiet/${last.id}`, null, `${last.who} is back in the chat.`) : null;
}
function line(m) {
  const li = el('li', m.sats ? 'tipped' : '');
  li.append(el('span', m.nostr ? 'from nostr' : 'from', m.who), ' ');
  if (m.mod) li.append(...(m.icon ? [m.icon, ' '] : []), el('span', 'mod-tag', 'Mod'), ' ');
  if (m.sats) li.append(el('b', 'amt', m.sats.toLocaleString('en-GB')), ' ');
  const words = el('span', 'words');
  words.append(...(m.mod ? withLinks(m.text) : [m.text]));
  li.append(words);
  const acts = el('span', 'acts');
  if (!m.mod && !m.cue) {
    const q = el('button', 'btn quiet', 'Quiet');
    q.type = 'button';
    q.title = 'Take it off and keep this phone’s words out of the chat tonight. Its tips still reach the artist.';
    q.setAttribute('aria-label', `Quiet ${m.who} tonight`);
    q.onclick = () => { q.disabled = true; act('POST', '/api/mod/quiet', { message: m.id }, `${m.who} is quiet tonight.`).finally(() => { q.disabled = false; }); };
    acts.append(q);
  }
  const x = el('button', 'btn quiet', '×');
  x.type = 'button';
  x.title = 'Delete this message';
  x.setAttribute('aria-label', 'Delete this message');
  x.onclick = async () => {
    x.disabled = true;
    try { await api('DELETE', `/api/mod/messages/${m.id}`); li.remove(); load(); } catch (e) { gone(e) || say(e.message); x.disabled = false; }
  };
  acts.append(x);
  li.append(acts);
  return li;
}
async function act(method, url, body, done) {
  try { draw(await api(method, url, body)); say(done); } catch (e) { gone(e) || say(e.message); }
}
async function load() {
  try { draw(await api('GET', '/api/mod/chat')); } catch (e) { gone(e); }
}
// Removed by the artist (or the 12 words' lock-out): signed out at once, as on the gig page.
function gone(e) {
  if (e?.code !== 'not_mod' || !me) return false;
  put('nutpub-mod', null); put(NOSTR_MOD, null);
  location.reload();
  return true;
}

// The pin: everyone sees it; the main mod changes it here, in a box on the page.
let pinNow = null;
function pin(text = '') {
  $('pin-add').hidden = !me.main || !!text || !$('pin-form').hidden;
  $('pin-change').hidden = !me.main;
  if (text === pinNow) return;
  pinNow = text;
  $('pin-row').hidden = !text || !$('pin-form').hidden;
  $('pin-words').replaceChildren(...withLinks(text));
}
const pinEdit = (on) => {
  $('pin-form').hidden = !on;
  $('pin-row').hidden = on || !pinNow;
  $('pin-add').hidden = on || !!pinNow || !me.main;
  $('pin-down').hidden = !pinNow;
  if (on) { $('pin-input').value = pinNow || ''; $('pin-input').focus(); }
};
$('pin-change').onclick = () => pinEdit(true);
$('pin-add').onclick = () => pinEdit(true);
$('pin-cancel').onclick = () => pinEdit(false);
async function pinSave(text) {
  try {
    const r = await api('POST', '/api/mod/pin', { text });
    pinEdit(false);
    pinNow = null;
    pin(r.pin);
    say(r.pin ? 'Pinned over the chat.' : 'The pin is down.');
  } catch (e) { gone(e) || say(e.message); }
}
$('pin-form').onsubmit = (e) => { e.preventDefault(); pinSave($('pin-input').value); };
$('pin-down').onclick = () => pinSave('');

$('slow-btn').onclick = async () => {
  const on = $('slow-btn').getAttribute('aria-pressed') !== 'true';
  try {
    const o = await api('POST', '/api/mod/slow', { on });
    $('slow-btn').textContent = `Slow mode · ${o.slow ? 'on' : 'off'}${o.busy ? ' · busy' : ''}`;
    $('slow-btn').setAttribute('aria-pressed', !!o.slow);
    say(o.slow ? 'Slow mode on: one message every 30 seconds for fans.' : 'Slow mode off.');
  } catch (e) { gone(e) || say(e.message); }
};

// The mod's own line in the chat: mods aren't slowed, and may post links. Amber only while there's something to send.
const sendBtn = $('say-form').querySelector('button');
const sendLit = () => { const on = !!$('say-text').value.trim(); sendBtn.classList.toggle('primary', on); sendBtn.classList.toggle('quiet', !on); };
$('say-text').addEventListener('input', sendLit);
sendLit();
$('say-form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('say-text').value.trim();
  if (!text) return;
  sendBtn.disabled = true;
  try {
    await knownPass();
    await api('POST', '/api/message', { text });
    $('say-text').value = '';
    sendLit();
    drawn = '';
    await load();
    $('lines').scrollTop = $('lines').scrollHeight;
  } catch (e) { gone(e) || say(e.message); }
  sendBtn.disabled = false;
};

$('sign-out').onclick = async () => {
  $('sign-out').disabled = true;
  if (me.via === 'passkey') { await api('DELETE', '/api/mod/me').catch(() => {}); put('nutpub-mod', null); }
  if (me.via === 'nostr') { await signOut(pass).catch(() => {}); put(NOSTR_MOD, null); }
  location.reload();
};

// ---- Signed out: the two ways in. The passkey's goes by thenutpub.com/crew and comes straight back here (stage.html).
async function signedOut() {
  const show = await fetch('/api/show').then((r) => r.json()).catch(() => ({}));
  const artist = show.show?.artist || 'the artist';
  $('out').hidden = false;
  $('out-head').textContent = `Moderate ${artist}’s chat`;
  $('out-fine').textContent = `No invite yet? ${artist === 'the artist' ? 'The artist sends' : `${artist} sends`} one from Cellar.`;
  if (STAGE_ID) { $('passkey-go').href = `${FRONT}/crew#in=${STAGE_ID}`; $('passkey-go').hidden = false; }
  $('nostr-go').onclick = () => nostrGo($('nostr-go'));
}
const outSay = (text) => { $('out-status').textContent = text; };
let waiting = null;
async function nostrGo(b) {
  b.disabled = true;
  try {
    await knownPass();
    const kept = !window.nostr && connected() ? await signer().catch(() => null) : null;
    let who;
    if (kept) { outSay('Say yes in your signer app…'); who = await signIn(pass, kept); }
    else if (await extension()) who = await signIn(pass);
    else who = await connectPanel();
    if (!who) return; // cancelled
    if (who.mod) { put(NOSTR_MOD, '1'); location.reload(); return; }
    outSay(`Signed in with Nostr${who.name ? ` as ${who.name}` : ''}, but that npub isn’t a mod on this gig. Say yes to the artist’s invite first.`);
  } catch (e) { outSay(e?.message || 'Nostr sign-in didn’t work.'); } finally { b.disabled = false; }
}
// Nostr Connect, waiting for the mod's signer app (Amber, nsec.app): the QR on a computer, a button on a phone.
async function connectPanel() {
  const box = $('nostr-in');
  const c = await connect(pass, { onAuth: (url) => { if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener'); } });
  waiting = c;
  const btn = (text, onclick) => Object.assign(el('button', 'linkish', text), { type: 'button', onclick });
  const copy = btn('Copy link', async () => { try { await navigator.clipboard.writeText(c.uri); copy.textContent = '✓ Copied'; setTimeout(() => { copy.textContent = 'Copy link'; }, 2000); } catch { outSay('Couldn’t copy.'); } });
  const cancel = btn('Cancel', () => { waiting = null; c.cancel(); });
  const side = el('span', 'nostr-side');
  side.append(el('span', 'nostr-note', TOUCH ? 'Opens your Nostr signer app (such as Amber) to say yes. Your secret key stays in the app.'
    : 'Open your Nostr signer app (such as Amber or nsec.app) and scan this from inside it, not with the phone’s camera. Your secret key stays in the app.'));
  if (TOUCH) side.append(Object.assign(el('a', 'btn quiet', 'Open my signer app'), { href: c.uri }));
  const row = el('span', 'nostr-row');
  row.append(el('span', 'nostr-wait', 'Waiting for your signer app…'), ' ', copy, ' · ', cancel);
  side.append(row);
  const parts = [side];
  if (!TOUCH) { const { qrSvg } = await import('./qr.js'); parts.unshift(Object.assign(el('span', 'nostr-qr'), { innerHTML: await qrSvg(c.uri) })); }
  box.replaceChildren(...parts);
  box.classList.add('connecting');
  box.hidden = false;
  try { return await c.done; } catch (e) { if (waiting !== c) return null; throw e; } finally {
    waiting = null;
    box.hidden = true;
    box.replaceChildren();
  }
}

try {
  const s = await first();
  if (s) start(s);
  else { put('nutpub-mod', key = null); signedOut(); }
} catch {
  $('out').hidden = false;
  $('out-head').textContent = 'The Mod page';
  $('out-say').textContent = 'Can’t reach the NutPub just now: reload the page in a moment.';
  $('nostr-go').hidden = true;
}
