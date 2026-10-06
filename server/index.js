import express from 'express';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PORT, ROOT, MINT_URL, MINT_API, SITE_URL, MINT_TEST } from './config.js';
import { kv } from './db.js';
import { initPurse } from './purse.js';
import { mountSet } from './set.js';
import { currentShow, saveShow, listTemplates, saveTemplate, loadTemplate, deleteTemplate } from './shows.js';

// Private links carry the admin key. Kept on disk, so they keep working across restarts.
const ADMIN_KEY = process.env.ADMIN_KEY || kv.get('adminKey') || kv.set('adminKey', randomBytes(12).toString('hex'));
const boots = kv.set('boots', kv.get('boots', 0) + 1);
const firstBoot = kv.get('firstBoot') ?? kv.set('firstBoot', new Date().toISOString());

const app = express();
app.disable('x-powered-by');
const PUBLIC = `${ROOT}public`;

// Cloudflare can tell browsers to keep CSS and JS for hours whatever we send, so every page links its CSS and JS
// with ?v=<newest file time>: a new build is a new URL, and phones fetch it at once.
const assets = () => {
  const js = (() => { try { return readdirSync(`${PUBLIC}/js`).map((f) => `js/${f}`); } catch { return []; } })();
  const root = readdirSync(PUBLIC).filter((f) => f.endsWith('.js'));
  return ['app.css', ...root, ...js];
};
const version = () => Math.max(...assets().map((f) => { try { return Math.floor(statSync(`${PUBLIC}/${f}`).mtimeMs); } catch { return 0; } }))
  .toString(36);
app.get('/pocket.html', (_req, res) => res.redirect(301, '/wallet.html')); // its name before 6 Oct
app.get(/^\/(?:[a-z-]+\.html)?$/, (req, res, next) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  let html;
  try { html = readFileSync(`${PUBLIC}/${file}`, 'utf8'); } catch { return next(); }
  const v = version();
  html = html.replace(/(["'])(\/(?:app\.css|(?:js\/)?[a-z-]+\.js))\1/g, `$1$2?v=${v}$1`);
  // On the test mint, every page says so, first thing.
  if (MINT_TEST) html = html.replace(/<body[^>]*>/, '$&\n  <div class="test-banner" role="note" data-t="test.banner">Test mint · no real value</div>');
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});
app.use(express.static(PUBLIC, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// Is everything up? The server, its state on disk, and the mint.
app.get('/api/health', async (_req, res) => {
  let mint;
  try {
    const info = await fetch(`${MINT_API}/v1/info`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json());
    mint = { ok: true, url: MINT_URL, name: info.name, description: info.description, version: info.version };
  } catch (e) {
    mint = { ok: false, url: MINT_URL, error: String(e.message || e) };
  }
  res.json({ ok: mint.ok, boots, firstBoot, mint: { ...mint, test: MINT_TEST }, site: SITE_URL });
});

// ---- The setup page (/setup.html#k=<admin key>): the account holder's settings for the show.
const admin = (req, res, next) =>
  req.get('X-Admin') === ADMIN_KEY ? next() : res.status(403).json({ error: 'forbidden' });
const json = express.json({ limit: '16kb' });
const attempt = (fn) => (req, res) => {
  try { res.json(fn(req)); } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
};

// What every viewer page reads: the show's settings (nothing secret in them).
app.get('/api/show', (_req, res) => res.json(currentShow()));
app.put('/api/admin/show', admin, json, attempt((req) => saveShow(req.body)));
app.get('/api/admin/templates', admin, attempt(() => listTemplates()));
app.post('/api/admin/templates', admin, json, attempt((req) => saveTemplate(req.body?.name, req.body?.show)));
app.post('/api/admin/templates/load', admin, json, attempt((req) => loadTemplate(req.body?.name)));
app.post('/api/admin/templates/delete', admin, json, attempt((req) => deleteTemplate(req.body?.name)));

mountSet(app, admin);

await initPurse();
app.listen(PORT, '127.0.0.1', () => {
  console.log(`NutPub on http://localhost:${PORT}  mint: ${MINT_URL}  start #${boots}`);
  // The key itself is never printed (this terminal may be on a shared screen): npm run setup opens the link.
  console.log(`Setup page: npm run setup (admin key ${ADMIN_KEY.slice(0, 4)}…)`);
});
