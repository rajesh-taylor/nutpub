// Show Time: sign-in, the two views, and the two big buttons. Only the next step is lit.
const $ = (id) => document.getElementById(id);
let key = null;
try { key = localStorage.getItem('nutpub-admin'); } catch {}
const api = (method, url, body) => fetch(url, { method, headers: { 'X-Admin': key || '', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  .then(async (r) => { if (!r.ok) throw Object.assign(new Error(r.statusText), { status: r.status }); return r.json(); });

try { await api('GET', '/api/admin/drinks'); } catch { $('locked').hidden = false; throw new Error('signed out'); }
$('page').hidden = false;
if ($('home')) {
  const { path } = await fetch('/api/show').then((r) => r.json());
  $('home').src = `${path}?as=home`;
  $('phone').src = path;
}

const buttons = [...document.querySelectorAll('[data-stage]')];
async function stage(next) {
  const { stage: now } = next ? await api('POST', '/api/admin/stage', { stage: next }) : await fetch('/api/stage').then((r) => r.json());
  for (const b of buttons) b.disabled = b.dataset.stage === 'on' ? now === 'on' : now !== 'on';
  $('after').hidden = now !== 'closed';
  document.body.dataset.stage = now;
}
for (const b of buttons) {
  b.onclick = () => {
    if (b.dataset.stage === 'closed' && !confirm('End the night? Every phone goes to Cheers and everyone watching stops.')) return;
    stage(b.dataset.stage);
  };
}
stage();
setInterval(() => { if (!document.hidden) stage().catch(() => {}); }, 30_000);
