// The setup page: read the show, edit it, save it to the server. Templates save and load whole shows.
const LANGS = { en: 'English', de: 'Deutsch', es: 'Español*', fr: 'Français*', pt: 'Português*' };
const PROBLEMS = {
  artist: 'artist', 'stream.perMinute': 'price a minute', 'goal.amount': 'goal', 'ticket.price': 'ticket price',
  'drink.price': 'drink price', lastOrders: 'date and last orders',
};

// The admin key comes after the # (so it never reaches a server log), then is kept on this computer only.
let key = new URLSearchParams(location.hash.slice(1)).get('k');
try {
  if (key) localStorage.setItem('nutpub-admin', key);
  else key = localStorage.getItem('nutpub-admin');
} catch {}
if (location.hash) history.replaceState(null, '', location.pathname);

const $ = (id) => document.getElementById(id);
const form = $('form');
const fields = [...form.querySelectorAll('[data-path]')];
let show = null;
let dirty = false;

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
    else if (el.tagName !== 'SELECT') el.value = v ?? '';
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
  const ours = make('span', { className: 'head', textContent: 'Fixed' });
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
function refresh() {
  for (const el of form.querySelectorAll('[data-when]')) {
    const [path, want] = el.dataset.when.split('=');
    const v = get(show, path);
    el.hidden = want ? v !== want : !v;
  }
  $('split-artist').textContent = show.artist || 'The artist';
  $('split-artist-pct').textContent = `${artistShare()}%`;
  $('takings-link').textContent = `${show.artist || 'The artist'}’s takings`;
  // The small poster follows the form, like the A4 one.
  $('mini-artist').textContent = show.artist || '';
  $('mini-title').textContent = (show.title || '').replace(show.artist || '\u0000', '').replace(/^\s*[·-]?\s*/, '');
  const d = show.date ? new Date(`${show.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  $('mini-when').textContent = [d, show.starts].filter(Boolean).join(' · ');
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

function saved(res) {
  fill(res.show);
  shareLink(res.path);
  larix();
  dirty = false;
  const at = res.updated ? new Date(res.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const todo = res.problems.map((p) => PROBLEMS[p] || p);
  const head = res.updated ? `Saved ${at}.` : 'A new show.';
  status(todo.length ? `${head} Still to fill in before going live: ${todo.join(', ')}.` : `${head} Ready to go live.`,
    todo.length ? 'todo' : 'ok');
}

form.addEventListener('input', (e) => {
  if (e.target.type === 'file') return; // saved on its own, not with the form
  read();
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
  try { saved(await api('PUT', '/api/admin/show', show)); } catch (err) { status(`Not saved: ${err.message}`, 'bad'); }
});
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

// ---- Templates
async function templates(list) {
  list ??= await api('GET', '/api/admin/templates');
  // The word Template until there are two saved shows; then the word heads a drop-down, and choosing one loads it.
  $('tpl-list').innerHTML = `<option value="">Template</option>${list.map((t) => `<option>${t.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</option>`).join('')}`;
  $('tpl-list').hidden = list.length < 2;
  $('tpl-word').hidden = list.length >= 2;
  $('tpl-box').hidden = false;
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
  document.getElementById('goal-note').textContent = g ? `${g.label}: ${n(tipped)} of ${n(g.at)} sats` : `Tips so far: ${n(tipped)} sats`;
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
