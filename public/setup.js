// The setup page: read the show, edit it, save it to the server. Templates save and load whole shows.
const LANGS = { en: 'English', de: 'Deutsch', es: 'Español*', fr: 'Français*', pt: 'Português*' };
const PROBLEMS = {
  title: 'show name', artist: 'artist', 'stream.price': 'price per 10 s', 'tip.label': 'tip label',
  'tip.price': 'tip price', 'goal.amount': 'goal', 'ticket.price': 'ticket price',
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
    const v = get(show, el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === v;
    else if (el.tagName !== 'SELECT') el.value = v ?? '';
  }
  $('langs').innerHTML = Object.entries(LANGS).map(([code, name]) =>
    `<label class="choice inline"><input type="checkbox" data-lang="${code}"${show.languages.includes(code) ? ' checked' : ''}> ${name}</label>`).join('');
  languageChoices();
  refresh();
}

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
  const label = show.tip.label || 'Tip';
  $('tip-preview').textContent = show.tip.price ? `${label} · ${show.tip.price} sats` : label;
}

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = kind;
}

// ---- Share the show: its public address (the tunnel's, not this page's, when there is one).
let site = location.origin;
function shareLink(path) {
  const link = `${site}${path}`;
  $('show-link').textContent = link.replace(/^https?:\/\//, '');
  $('show-link').href = $('open-show').href = link;
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
  dirty = false;
  const at = res.updated ? new Date(res.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const todo = res.problems.map((p) => PROBLEMS[p] || p);
  const head = res.updated ? `Saved ${at}.` : 'A new show.';
  status(todo.length ? `${head} Still to fill in before going live: ${todo.join(', ')}.` : `${head} Ready to go live.`,
    todo.length ? 'todo' : 'ok');
}

form.addEventListener('input', (e) => {
  read();
  if (e.target.dataset.lang) languageChoices();
  refresh();
  dirty = true;
  status('Not saved yet.', 'todo');
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  read();
  try { saved(await api('PUT', '/api/admin/show', show)); } catch (err) { status(`Not saved: ${err.message}`, 'bad'); }
});
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

// ---- Templates
async function templates(list) {
  list ??= await api('GET', '/api/admin/templates');
  $('tpl-list').innerHTML = list.length
    ? list.map((t) => `<option>${t.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}</option>`).join('')
    : '<option value="">No templates yet</option>';
  $('tpl-load').disabled = $('tpl-delete').disabled = !list.length;
}
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

// ---- Start: the key must work, or the page stays locked.
try {
  site = (await fetch('/api/health').then((r) => r.json())).site || location.origin;
  await templates();
  saved(await api('GET', '/api/show'));
  form.hidden = false;
} catch (err) {
  $('locked').hidden = false;
  if (err.status !== 403) $('locked').textContent = `Couldn't reach the server: ${err.message}`;
}
