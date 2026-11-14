// The setup page: read the show, edit it, save it to the server. Templates save and load whole shows.
import { satsFrom } from '/js/money.js';
const LANGS = { en: 'English', de: 'Deutsch', es: 'Español*', fr: 'Français*', pt: 'Português*' };
const PROBLEMS = {
  artist: 'artist', venue: 'venue', 'stream.perMinute': 'price a minute', 'goal.amount': 'goal', 'ticket.price': 'ticket price', 'online.price': 'Watch online price',
  date: 'date', 'date.past': 'a date that hasn\u2019t passed', 'drink.price': 'drink price', lastOrders: 'date and last orders',
};

// The admin key comes after the # (so it never reaches a server log), then is kept on this computer only.
const hashArgs = new URLSearchParams(location.hash.slice(1));
let key = hashArgs.get('k');
// Sign in on your phone: the QR's one-time code (#h=), traded once for the key.
const handoff = hashArgs.get('h');
if (location.hash) history.replaceState(null, '', location.pathname);
if (!key && handoff) {
  try {
    const r = await fetch('/api/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: handoff }) });
    if (r.ok) key = (await r.json()).key;
  } catch {}
}
try {
  if (key) localStorage.setItem('nutpub-admin', key);
  else key = localStorage.getItem('nutpub-admin');
} catch {}

const $ = (id) => document.getElementById(id);
const form = $('form');
// The Nutzap buttons' emoji (the server's list, server/shows.js NUTZAP_EMOJI), filled before the fields are read.
const NUTZAP_EMOJI = ['⚡', '🥜', '🍺', '🎸', '🎤', '🔥', '❤️', '🙌'];
for (const sel of form.querySelectorAll('.nz-emoji')) sel.innerHTML = NUTZAP_EMOJI.map((e) => `<option>${e}</option>`).join('');
const fields = [...form.querySelectorAll('[data-path]')];
let show = null;
let dirty = false;
let artistReady = true;

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'X-Admin': key || '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function set(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}

// ---- Show -> form
function fill(s) {
  show = structuredClone(s);
  for (const el of fields) {
    if (el === document.activeElement) continue; // still being typed in
    const v = get(show, el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === v;
    else if (el.tagName !== 'SELECT' || el.classList.contains('nz-emoji')) el.value = v ?? '';
  }
  $('langs').innerHTML = Object.entries(LANGS).map(([code, name]) =>
    `<label class="choice inline"><input type="checkbox" data-lang="${code}"${show.languages.includes(code) ? ' checked' : ''}> ${name}</label>`).join('');
  languageChoices();
  drawSplits();
  refresh();
}

// The artist's own Lightning address is an ordinary field; the rows are drawn round it.
const fieldLightning = Object.assign(document.createElement('input'), { type: 'email', placeholder: 'e.g. longy@walletofsatoshi.com', maxLength: 120, ariaLabel: 'The artist\u2019s Lightning address' });
fieldLightning.dataset.path = 'lightning';
fieldLightning.dataset.g = 'artist';
fieldLightning.autocapitalize = 'off'; fieldLightning.spellcheck = false;
fields.push(fieldLightning);
$('add-split').onclick = () => {
  if (show.splits.length >= 8) return status('Eight splits at most.', 'bad');
  show.splits.push({ name: '', percent: null, lightning: '' });
  drawSplits();
  refresh();
  $('split-rows').querySelector(`[data-split="${show.splits.length - 1}"] .name`).focus();
};

// ---- The show's splits: the artist gets what's left of 95%, and The NutPub's 5% never changes.
const NUTPUB = 5;
const artistShare = () => 100 - NUTPUB - (show.splits || []).reduce((sum, s) => sum + (s.percent || 0), 0);
function drawSplits() {
  const box = $('split-rows');
  const rows = box.querySelectorAll('[data-split]');
  if (box.children.length && rows.length === show.splits.length) { // same rows: new values only, not under the typing
    rows.forEach((row, i) => {
      for (const [cls, k] of [['name', 'name'], ['share', 'percent'], ['to', 'lightning']]) {
        const el = row.querySelector(`.${cls}`);
        const to = cls === 'to' ? box.querySelector(`[data-of="${i}"]`) : el;
        if (to !== document.activeElement) to.value = show.splits[i][k] ?? '';
      }
    });
    orderSplits();
    return;
  }
  const line = (kids, g) => { const d = document.createElement('div'); d.className = 'who-share'; d.dataset.g = g; d.append(...kids); return d; };
  const make = (tag, props) => Object.assign(document.createElement(tag), props);
  const lightning = fieldLightning;
  box.replaceChildren(
    make('span', { className: 'head' }), make('span', { className: 'head', textContent: 'Lightning address' }),
    line([make('b', { id: 'split-artist' }), make('span', { className: 'pct', id: 'split-artist-pct' })], 'artist'), lightning,
  );
  show.splits.forEach((s, i) => {
    const row = make('div', { className: 'who-share' });
    row.dataset.split = i;
    row.dataset.g = i;
    const drop = make('button', { type: 'button', className: 'btn quiet drop', textContent: '✕' });
    drop.setAttribute('aria-label', 'Remove this split');
    drop.onclick = () => { show.splits.splice(i, 1); drawSplits(); refresh(); form.requestSubmit(); };
    const share = make('span', { className: 'share-box' });
    share.append(make('input', { className: 'share', type: 'number', min: 1, max: 94, step: 1, inputMode: 'numeric', value: s.percent ?? '', ariaLabel: 'Their share, in percent' }), '%');
    row.append(make('input', { className: 'name', value: s.name ?? '', placeholder: 'e.g. the drummer', maxLength: 40, ariaLabel: 'Who' }), share);
    const to = make('input', { className: 'to', type: 'email', value: s.lightning ?? '', placeholder: 'name@wallet.example', maxLength: 120, ariaLabel: 'Their Lightning address' });
    to.autocapitalize = 'off'; to.spellcheck = false;
    to.dataset.of = i;
    const toBox = make('div', { className: 'to-box' });
    toBox.dataset.g = i;
    toBox.append(to, drop);
    box.append(row, toBox);
  });
  const ours = make('input', { placeholder: 'Fixed', readOnly: true, tabIndex: -1, ariaLabel: 'The NutPub\u2019s 5% is fixed' }); // a box like the Lightning address's, with nothing to type
  ours.dataset.g = 'nutpub';
  box.append(line([make('b', { textContent: 'The NutPub' }), make('span', { className: 'pct', textContent: `${NUTPUB}%` })], 'nutpub'), ours);
  orderSplits();
}

// Most to least, The NutPub after anyone on the same 5%. Not while a share is being typed: the row moves when it's done.
function orderSplits(force) {
  if (!force && document.activeElement?.classList.contains('share')) return;
  const rank = [['artist', artistShare()], ...show.splits.map((s, i) => [String(i), s.percent || 0]), ['nutpub', NUTPUB]]
    .sort((a, b) => b[1] - a[1]);
  const place = new Map(rank.map(([g], i) => [g, i + 1]));
  for (const el of $('split-rows').querySelectorAll('[data-g]')) el.style.order = place.get(el.dataset.g);
}
$('split-rows').addEventListener('change', (e) => { if (e.target.classList.contains('share')) { read(); orderSplits(true); } });

function languageChoices() {
  const sel = $('language');
  sel.innerHTML = show.languages.map((c) => `<option value="${c}">${LANGS[c].replace('*', '')}</option>`).join('');
  sel.value = show.language;
}

// ---- Form -> show
function read() {
  for (const el of fields) {
    if (el.type === 'radio' && !el.checked) continue;
    const v = el.type === 'checkbox' ? el.checked
      : el.type === 'number' ? (el.value === '' ? null : Number(el.value))
      : el.value;
    set(show, el.dataset.path, v);
  }
  show.splits = [...$('split-rows').querySelectorAll('[data-split]')].map((row) => {
    const percent = row.querySelector('.share').value;
    return { name: row.querySelector('.name').value, percent: percent === '' ? null : Number(percent),
      lightning: $('split-rows').querySelector(`[data-of="${row.dataset.split}"]`).value };
  });
  show.tip.label = `Tip ${show.artist || 'the artist'}`; // the button takes the artist's name
  show.languages = [...$('langs').querySelectorAll('[data-lang]:checked')].map((el) => el.dataset.lang);
  if (!show.languages.length) show.languages = ['en'];
  if (!show.languages.includes(show.language)) show.language = show.languages[0];
}

// Show or hide the fields that belong to a choice; redraw the tip button preview.
// The kind of night (Rajesh 11 Nov): Room only, Room + live stream, Live stream only. It's not saved itself: it sets
// Venue tickets and the stream's mode, which are.
const nightOf = (s) => (s.ticket.on ? (s.stream.mode === 'off' ? 'room' : 'both') : s.stream.mode === 'off' ? '' : 'stream');
let lastMode = 'free'; // the stream's way to pay, kept while a Room only night has it off
function applyNight(kind) {
  $('ticket-on').checked = kind !== 'stream';
  const mode = kind === 'room' ? 'off' : show.stream.mode !== 'off' ? show.stream.mode : lastMode;
  form.querySelector(`[data-path="stream.mode"][value="${mode}"]`).checked = true;
}
function refresh() {
  const night = nightOf(show);
  if (show.stream.mode !== 'off') lastMode = show.stream.mode;
  for (const el of form.querySelectorAll('[name="night"]')) el.checked = el.value === night;
  for (const el of form.querySelectorAll('[data-night]')) el.hidden = !el.dataset.night.split(' ').includes(night);
  for (const el of form.querySelectorAll('[data-when]')) {
    const [path, want] = el.dataset.when.split('=');
    const v = get(show, path);
    el.hidden = want ? String(v) !== want : !v;
  }
  $('split-artist').textContent = show.artist || 'The artist';
  $('split-artist-pct').textContent = `${artistShare()}%`;
  $('takings-link').textContent = `${show.artist || 'The artist'}’s takings`;
  // The small poster follows the form, like the A4 one.
  $('mini-artist').textContent = show.artist || '';
  $('mini-title').textContent = (show.title || '').replace(show.artist || '\u0000', '').replace(/^\s*[·-]?\s*/, '');
  const d = show.date ? new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  $('mini-when').textContent = [d, show.streams].filter(Boolean).join(' · ');
  const n = (v) => Number(v || 0).toLocaleString('en-GB');
  $('tip-preview').textContent = `Tip ${show.artist || 'the artist'} · ${n(show.tip.price)} sats`;
  // Who gets what from each ticket: the same split as the server's (server/shows.js ticketSplit).
  const drink = show.drink?.mode === 'artist' ? show.drink.price || 0 : 0;
  const artist = show.ticket?.price || 0;
  // The drink's price stays in sight; it only counts (and can only be typed) when the free drink is on.
  $('drink-price').querySelector('input').disabled = show.drink?.mode !== 'artist';
  $('split').textContent = !artist ? '' : drink
    ? `Ticket: ${n(artist + drink)} sats. ${n(artist)} locked to ${show.artist || 'the artist'}’s key, ${n(drink)} locked to the bar’s for the first drink. Not poured by ${show.lastOrders || 'last orders'}? It goes to ${show.artist || 'the artist'}.`
    : `Ticket: ${n(artist)} sats, locked to ${show.artist || 'the artist'}’s key.`;
}

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = kind;
}

// ---- Share the show: its public address (the tunnel's, not this page's, when there is one).
let site = location.origin;
function shareLink(path) {
  const link = `${site}${path}`;
  $('site-host').textContent = `${site.replace(/^https?:\/\//, '')}/`;
  $('show-link').textContent = link.replace(/^https?:\/\//, '');
  $('show-link').href = $('open-show').href = link;
  $('poster-link').href = `${path}/poster`;
  $('qr').src = `/api/show/qr.svg?t=${Date.now()}`;
  $('share-link').hidden = !navigator.share;
  $('copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(link); status('Link copied.', 'ok'); } catch { status(link); }
  };
  $('share-link').onclick = () => navigator.share({ title: show.title || 'The NutPub', url: link }).catch(() => {});
}

let phoneKind = '';
function saved(res) {
  fill(res.show);
  shareLink(res.path);
  larix();
  dirty = false;
  // The phone shows the door or the home view by these two: reload it when either changes.
  const kind = `${res.show.ticket.on}/${res.show.stream.mode}`;
  if (phoneKind && kind !== phoneKind) $('preview-frame').contentWindow?.location.reload();
  phoneKind = kind;
  const at = res.updated ? new Date(res.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const todo = res.problems.map((p) => PROBLEMS[p] || p);
  const head = res.updated ? `Saved ${at}.` : 'A new show.';
  if ('artistKey' in res) artistReady = !!res.artistKey;
  if (!artistReady) todo.push('open 3 · Takings once (it makes the key payments lock to; nothing can be sold until then)');
  status(todo.length ? `${head} Still to do before going live: ${todo.join(', ')}.` : `${head} Ready to go live.`,
    todo.length ? 'todo' : 'ok');
  // The box under the page's title says the same, where the artist starts.
  $('ready-box').classList.toggle('ok', !todo.length);
  $('ready-head').textContent = todo.length ? 'Still to fill in' : 'Ready to go live';
  const list = todo.join(', ');
  $('ready-text').textContent = todo.length ? `${list[0].toUpperCase()}${list.slice(1)}.` : 'Everything is filled in.';
}

// ---- Prices: £ beside sats. Typing £ fills the sats from the rate (CoinGecko, kept 30 minutes on the server), unless
// the lock is on: then the sats are the artist's own figure (some give 5–10% off for bitcoin). Typing in the sats turns
// the lock on; turning it off fills them from £ again. Once filled, the sats stay put: they don't follow the rate.
let rate = null;
async function loadRate() {
  try { rate = await (await fetch('/api/rate')).json(); } catch { rate = null; }
  const at = rate?.at ? new Date(rate.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  $('rate-line').textContent = !rate ? 'No bitcoin rate just now: type the sats yourself.'
    : `1 BTC = £${Math.round(rate.gbp).toLocaleString('en-GB')}` + (rate.at ? ` (last updated: ${at} on ${rate.source === 'coingecko' ? 'CoinGecko' : rate.source})` : ' (a rough figure: the price feeds are out of reach)');
}
loadRate();
setInterval(loadRate, 30 * 60 * 1000);
function priceRow(e) {
  const row = e.target.closest('[data-price]');
  if (!row) return;
  const [fiat, sats, lock] = ['input[step="0.01"]', 'input[step="1"]', 'input[type=checkbox]'].map((q) => row.querySelector(q));
  if (![fiat, sats, lock].includes(e.target)) return;
  if (e.target === sats) lock.checked = true;
  if (!lock.checked && fiat.value !== '' && rate?.gbp) sats.value = satsFrom(fiat.value, rate.gbp) ?? '';
}

// After a sale: the name and address are fixed (the server holds to this too); a date can still move, with a warning.
let soldCount = 0;
let soldWhen = '';
const whenNow = () => [show.date, show.streams].join(' ');
function fixAfterSale(n) {
  soldCount = n;
  soldWhen = whenNow();
  for (const id of ['field-artist', 'field-page']) {
    const box = $(id);
    box.classList.toggle('fixed', n > 0);
    box.title = n > 0 ? 'Locked: tickets have sold. A new date after the gig unlocks it.' : '';
    box.querySelector('input').readOnly = n > 0;
  }
}
function dateWarning() {
  const moved = soldCount > 0 && whenNow() !== soldWhen;
  $('date-warn').hidden = !moved;
  $('date-warn').textContent = moved ? `${soldCount} ticket${soldCount === 1 ? '' : 's'} sold. Buyers see the new date when they open their link, but nobody is told: announce it yourself too.` : '';
}
form.addEventListener('input', (e) => {
  if (e.target.type === 'file' || ['mod-name', 'mod-icon', 'pin-text'].includes(e.target.id) || e.target.closest('.mod-row')) return; // saved on their own, not with the form
  if (e.target.name === 'night') applyNight(e.target.value);
  priceRow(e);
  read();
  dateWarning();
  if (e.target.dataset.lang) languageChoices();
  refresh();
  dirty = true;
  status('Saving…', 'todo');
  clearTimeout(autosave); // saved as you type, so the ticket page on every phone follows within seconds
  autosave = setTimeout(() => form.requestSubmit(), 700);
});
let autosave;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  read();
  try {
    saved(await api('PUT', '/api/admin/show', show));
    // A new date after the gig has just cleared it: the page starts again for the next one.
    if (!$('next-gig').hidden && !(await api('GET', '/api/admin/sold')).over) location.reload();
  } catch (err) { status(`Not saved: ${err.message}`, 'bad'); }
});
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
// Next gig moved to Takings as Finish gig (13 Nov): the money first, then the next gig.

// ---- Templates
async function templates(list) {
  list ??= await api('GET', '/api/admin/templates');
  // The word Template until there are two saved shows; then the word heads a drop-down, and choosing one loads it.
  $('tpl-list').innerHTML = `<option value="">Start from a saved gig</option>${list.map((t) => `<option>${t.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</option>`).join('')}`;
  $('tpl-list').hidden = list.length < 2;
  $('tpl-word').hidden = true; // no word "Template" (Rajesh 11 Nov): the drop-down only, with two or more saved shows
  $('tpl-box').hidden = list.length < 2;
  $('tpl-load').disabled = $('tpl-delete').disabled = !list.length;
}
$('tpl-list').onchange = () => { $('tpl-load').click(); $('tpl-list').value = ''; };
$('tpl-save').addEventListener('click', async () => {
  read();
  const name = $('tpl-name').value.trim() || show.title;
  if (!name) return status('Give the template a name first.', 'bad');
  try {
    await templates(await api('POST', '/api/admin/templates', { name, show }));
    $('tpl-list').value = name;
    $('tpl-name').value = '';
    status(`Template “${name}” saved.`, 'ok');
  } catch (err) { status(err.message, 'bad'); }
});
$('tpl-load').addEventListener('click', async () => {
  const name = $('tpl-list').value;
  if (!name || (dirty && !confirm('Load the template over your unsaved changes?'))) return;
  try { saved(await api('POST', '/api/admin/templates/load', { name })); status(`Loaded “${name}”. ${$('status').textContent}`, $('status').className); }
  catch (err) { status(err.message, 'bad'); }
});
$('tpl-delete').addEventListener('click', async () => {
  const name = $('tpl-list').value;
  if (!name || !confirm(`Delete the template “${name}”?`)) return;
  try { await templates(await api('POST', '/api/admin/templates/delete', { name })); status(`Template “${name}” deleted.`); }
  catch (err) { status(err.message, 'bad'); }
});

// ---- The photos: uploaded the moment one is dropped in or picked (the server checks type and size too).
function photos(all = {}) {
  for (const box of form.querySelectorAll('.slot')) {
    const url = all[box.dataset.slot];
    box.classList.toggle('full', !!url);
    box.querySelector('label').style.backgroundImage = url ? `url("${url}")` : '';
    box.querySelector('.drop').hidden = !url;
  }
}
// A new photo shows at once in the ticket phone and on the small poster beside the form.
function photosChanged(data) {
  photos(data.photos);
  $('mini-photo').style.backgroundImage = `url("${data.photo || '/img/fp-32.jpg'}")`;
  $('preview-frame').contentWindow?.location.reload();
}
async function upload(slot, file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return status('Use a JPEG, PNG or WebP photo.', 'bad');
  if (file.size > 5 * 1024 * 1024) return status('That photo is over 5 MB.', 'bad');
  status('Uploading the photo…');
  try {
    const r = await fetch(`/api/admin/photo/${slot}`, { method: 'PUT', headers: { 'X-Admin': key || '', 'Content-Type': file.type }, body: file });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || data.error || r.statusText);
    photosChanged(data);
    status('Photo saved.', 'ok');
  } catch (err) { status(`Photo not saved: ${err.message}`, 'bad'); }
}
for (const box of form.querySelectorAll('.slot')) {
  const { slot } = box.dataset;
  const label = box.querySelector('label');
  const input = box.querySelector('input');
  input.onchange = () => { const f = input.files[0]; input.value = ''; upload(slot, f); };
  label.ondragover = (e) => { e.preventDefault(); label.classList.add('over'); };
  label.ondragleave = () => label.classList.remove('over');
  label.ondrop = (e) => { e.preventDefault(); label.classList.remove('over'); upload(slot, e.dataTransfer.files[0]); };
  box.querySelector('.drop').onclick = async () => {
    try { photosChanged(await api('DELETE', `/api/admin/photo/${slot}`)); status('Photo removed.', 'ok'); }
    catch (err) { status(err.message, 'bad'); }
  };
}

// ---- The stretch goal's bar, filled by the tips so far.
async function goalPreview() {
  const { tipped, goals } = await fetch('/api/tick?after=999999999').then((r) => r.json()).catch(() => ({ tipped: 0, goals: [] }));
  const g = goals.find((x) => tipped < x.at) || goals[goals.length - 1];
  const n = (v) => Number(v).toLocaleString('en-GB');
  document.getElementById('goal-bar').style.width = g ? `${Math.min(100, (tipped / g.at) * 100)}%` : '0';
  document.getElementById('goal-note').textContent = !g ? `Tips so far: ${n(tipped)} sats` : tipped >= g.at ? `All goals met: ${n(tipped)} sats` : `${g.label}: ${n(tipped)} of ${n(g.at)} sats`;
}

// ---- The stream key: hidden like a password; Show reveals it.
$('show-key').onclick = () => {
  const shown = $('live-key').type === 'text';
  $('live-key').type = shown ? 'password' : 'text';
  $('show-key').textContent = shown ? 'Show' : 'Hide';
};

// ---- The live stream: made through Cloudflare Stream; Larix is set up by scanning its QR.
let larixFor = null;
async function larix() {
  const k = show?.live?.key || '';
  if (k === larixFor) return;
  larixFor = k;
  $('make-stream').textContent = k ? 'Stream made ✓' : 'Make my stream';
  $('larix').hidden = !k;
  if (!k) return;
  try {
    const { link, svg } = await api('GET', '/api/admin/live/larix');
    $('larix-qr').innerHTML = svg; // our own server's QR, made from the show's own fields
    $('larix-link').href = link;
  } catch (err) { $('larix').hidden = true; status(err.message, 'bad'); }
}
$('make-stream').onclick = async () => {
  $('make-stream').disabled = true;
  status('Making your stream…', 'todo');
  try { saved(await api('POST', '/api/admin/live')); status('Your stream is ready: scan the code with Larix.', 'ok'); }
  catch (err) { status(`Stream not made: ${err.message}`, 'bad'); }
  $('make-stream').disabled = false;
};
const copy = (id, what) => async () => {
  try { await navigator.clipboard.writeText($(id).value); status(`${what} copied.`, 'ok'); } catch { status(`Couldn't copy the ${what.toLowerCase()}.`, 'bad'); }
};
$('copy-server').onclick = copy('live-server', 'Server');
$('copy-key').onclick = copy('live-key', 'Key');

// ---- Moderators: a private link each. The server keeps only a hash of each key, so the links are kept in this
// browser to show again; on another browser, cancel the link and make a new one.
const MOD_KEYS = 'nutpub-mod-keys';
const modKeys = () => { try { return JSON.parse(localStorage.getItem(MOD_KEYS) || '{}'); } catch { return {}; } };
const keepModKey = (id, k) => { const all = modKeys(); if (k) all[id] = k; else delete all[id]; try { localStorage.setItem(MOD_KEYS, JSON.stringify(all)); } catch {} };
const modLink = (k) => `${site}${show?.page ? `/${show.page}` : ''}?as=home#mod=${k}`;
const iconPicker = (icons, value) => {
  const sel = document.createElement('select');
  sel.append(...icons.map((i) => Object.assign(document.createElement('option'), { value: i, textContent: i, selected: i === value })));
  return sel;
};
let pinShown = null;
async function drawMods() {
  const { mods: list, icons, pin } = await api('GET', '/api/admin/mods');
  const keys = modKeys();
  if (pinShown === null || document.activeElement !== $('pin-text')) { $('pin-text').value = pin; pinShown = pin; }
  if (!$('mod-icon').options.length) $('mod-icon').replaceWith(Object.assign(iconPicker(icons, icons[0]), { id: 'mod-icon' }));
  const used = list.map((m) => m.icon);
  if (!$('mod-name').value) $('mod-icon').value = icons.find((i) => !used.includes(i)) || icons[0]; // a new icon for each new mod
  $('mod-rows').replaceChildren(...list.map((m) => {
    const row = Object.assign(document.createElement('div'), { className: 'mod-row' });
    const icon = iconPicker(icons, m.icon);
    icon.setAttribute('aria-label', `${m.name}'s icon`);
    icon.onchange = async () => { await api('POST', `/api/admin/mods/${m.id}`, { icon: icon.value }); status(`${m.name}'s icon changed.`, 'ok'); };
    const main = Object.assign(document.createElement('label'), { className: 'mod-main', title: 'The main mod can also change the pinned message' });
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'mod-main', checked: !!m.main });
    radio.onchange = async () => { await api('POST', `/api/admin/mods/${m.id}`, { main: true }); status(`${m.name} is the main mod.`, 'ok'); drawMods(); };
    main.append(radio, 'Main');
    main.hidden = list.length < 2; // one mod is the main mod anyway
    const link = Object.assign(document.createElement('input'), { readOnly: true, value: keys[m.id] ? modLink(keys[m.id]) : 'Made on another browser: cancel it and make a new one to see the link.' });
    link.setAttribute('aria-label', `${m.name}'s moderator link`);
    const copyBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'btn quiet', textContent: 'Copy', disabled: !keys[m.id] });
    copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(link.value); status(`${m.name}'s link copied. Send it to them privately.`, 'ok'); } catch { link.select(); } };
    const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'btn quiet', textContent: 'Cancel' });
    cancel.onclick = async () => {
      if (!confirm(`Cancel ${m.name}'s link? It stops working at once.`)) return;
      await api('DELETE', `/api/admin/mods/${m.id}`);
      keepModKey(m.id, null);
      status(`${m.name}'s link is cancelled.`, 'ok');
      drawMods();
    };
    row.append(icon, Object.assign(document.createElement('b'), { textContent: m.name }), link, main, copyBtn, cancel);
    return row;
  }));
  $('mod-make').disabled = list.length >= 5;
}
// Scan at the door needs the venue's yes: turning it on asks first (a click that's cancelled leaves it off, unsaved).
$('door-on').addEventListener('click', (e) => {
  if ($('door-on').checked && !confirm('Has the venue agreed to scan tickets at the door?\n\nEach venue ticket gets a QR on the gig day, and whoever is on the door scans it once with a phone.')) e.preventDefault();
});

// ---- The door link: a key of its own, which opens the door page only. Kept in this browser, like the mod links.
const DOOR_KEY = 'nutpub-door-link';
function doorLink(made) {
  let k = null;
  try { k = localStorage.getItem(DOOR_KEY); } catch {}
  $('door-link').value = k ? `${site}/door.html#k=${k}` : made ? 'Made on another browser: make a new one to see it here.' : 'No door scanner yet.';
  $('copy-door').disabled = $('qr-door').disabled = !k;
  if (!k || !$('door-link-qr').hidden) drawDoorQr(); // a new link redraws an open QR
  $('new-door').textContent = made ? 'New one' : 'Make it';
}
// The door link as a QR, for the door phone's camera: drawn here, hidden until asked for (it carries the key).
async function drawDoorQr(show = !$('door-link-qr').hidden) {
  const link = $('copy-door').disabled ? '' : $('door-link').value;
  $('door-link-qr').hidden = !(show && link);
  $('qr-door').setAttribute('aria-expanded', String(show && !!link));
  $('qr-door').textContent = show && link ? 'Hide QR' : 'Show QR';
  if (show && link) {
    const { qrSvg } = await import('/js/qr.js');
    $('door-link-qr').src = `data:image/svg+xml,${encodeURIComponent(await qrSvg(link))}`;
  }
}
$('qr-door').onclick = () => drawDoorQr($('door-link-qr').hidden);
$('copy-door').onclick = async () => { try { await navigator.clipboard.writeText($('door-link').value); status('Door scanner link copied. Send it to the door privately.', 'ok'); } catch { $('door-link').select(); } };
$('new-door').onclick = async () => {
  const made = $('new-door').textContent === 'New one';
  if (made && !confirm('Make a new door scanner? The old one stops working at once.')) return;
  const { key: k } = await api('POST', '/api/admin/door-link');
  try { localStorage.setItem(DOOR_KEY, k); } catch {}
  doorLink(true);
  status('The door scanner is ready: press Show QR for the door phone, or copy the link.', 'ok');
};

// The pinned message: saved on its own as you type, like the rest of the page.
let pinTimer = null;
$('pin-text').addEventListener('input', () => {
  clearTimeout(pinTimer);
  status('Saving…', 'todo');
  pinTimer = setTimeout(async () => {
    try { pinShown = (await api('PUT', '/api/admin/pin', { text: $('pin-text').value })).pin; status('Pinned message saved.', 'ok'); }
    catch (err) { status(`Not saved: ${err.message}`, 'bad'); }
  }, 700);
});
// Inside the gig's own form (which saves as you type), so it's a button, not a form of its own.
$('mod-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('mod-make').click(); } });
$('mod-make').onclick = async () => {
  const name = $('mod-name').value.trim();
  if (!name) return $('mod-name').focus();
  try {
    const m = await api('POST', '/api/admin/mods', { name, icon: $('mod-icon').value });
    keepModKey(m.id, m.key);
    $('mod-name').value = '';
    status(`${m.name}'s link is ready: copy it and send it to them privately.`, 'ok');
    drawMods();
  } catch (err) { status(err.message === 'too_many' ? '5 moderators at most.' : `Not made: ${err.message}`, 'bad'); }
};

// ---- The show: page 2 (a plain link). Inside the old demo page it switches the tab instead.
$('doors-open').onclick = (e) => {
  if (top === self) return;
  e.preventDefault();
  parent.postMessage({ nutpub: 'tab', tab: '2' }, location.origin);
};

// ---- Start: the key must work, or the page stays locked.
try {
  site = (await fetch('/api/health').then((r) => r.json())).site || location.origin;
  await templates();
  const first = await api('GET', '/api/show');
  saved(first);
  photos(first.photos);
  const sold = await api('GET', '/api/admin/sold');
  fixAfterSale((sold.room || 0) + (sold.home || 0));
  $('next-gig').hidden = !sold.over;
  $('mini-photo').style.backgroundImage = `url("${first.photo || '/img/fp-32.jpg'}")`;
  $('takings-link').href = '/takings'; // 3 · Takings (the old artist-only page forwards there)
  $('bar-link').href = `/bar.html#k=${encodeURIComponent(key)}`;
  form.hidden = false;
  // The phone beside the form: the real show page. Not inside the demo page, which has its own phone.
  // The phone beside the form: the real show page. Inside the demo page, the demo's own phone is beside it instead.
  if (top === self) { $('preview-frame').src = `${first.path}?view=ticket`; $('preview').hidden = false; }
  else document.querySelector('.board-head')?.remove(); // inside the old demo page, which has its own tabs
  goalPreview();
  setInterval(goalPreview, 5000);
  $('phone-in-row').hidden = false;
  drawMods().catch(() => {});
  api('GET', '/api/admin/door-link').then((d) => doorLink(d.made)).catch(() => {});
} catch (err) {
  $('locked').hidden = false;
  if (err.status !== 403) $('signin-note').textContent = `Couldn't reach the server: ${err.message}`;
  else if (key) $('signin-note').textContent = 'That link didn’t work. Check it and try again.';
}
// Sign in: the private link (or just its key), kept in this browser like the link itself would be.
$('locked').onsubmit = (e) => {
  e.preventDefault();
  const v = $('signin-link').value.trim();
  const k = new URLSearchParams(v.split('#')[1] || '').get('k') || v;
  try { localStorage.setItem('nutpub-admin', k); } catch {}
  location.reload();
};

// ---- Sign in on your phone: a QR with a one-time code, made on tap and gone after 5 minutes or Done.
let phoneInTimer = null;
$('phone-in-btn').onclick = async () => {
  $('phone-in-btn').disabled = true;
  try {
    const { code, ms } = await api('POST', '/api/admin/handoff');
    const { qrSvg } = await import('/js/qr.js');
    $('phone-in-qr').src = `data:image/svg+xml,${encodeURIComponent(await qrSvg(`${location.origin}/setup#h=${code}`))}`;
    $('phone-in').hidden = false;
    $('phone-in-row').hidden = true;
    clearTimeout(phoneInTimer);
    phoneInTimer = setTimeout(() => $('phone-in-close').onclick(), ms);
  } catch (e) { alert(`Couldn\u2019t make the QR: ${e.message}`); }
  $('phone-in-btn').disabled = false;
};
$('phone-in-close').onclick = () => {
  clearTimeout(phoneInTimer);
  $('phone-in').hidden = true;
  $('phone-in-qr').removeAttribute('src');
  $('phone-in-row').hidden = false;
};
