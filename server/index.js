import express from 'express';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PORT, ROOT, MINT_URL, MINT_API, SITE_URL } from './config.js';
import { kv } from './db.js';

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
  return ['app.css', ...js];
};
const version = () => Math.max(...assets().map((f) => { try { return Math.floor(statSync(`${PUBLIC}/${f}`).mtimeMs); } catch { return 0; } }))
  .toString(36);
app.get(/^\/(?:[a-z-]+\.html)?$/, (req, res, next) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  let html;
  try { html = readFileSync(`${PUBLIC}/${file}`, 'utf8'); } catch { return next(); }
  const v = version();
  res.set('Cache-Control', 'no-cache').type('html')
    .send(html.replace(/(["'])(\/(?:app\.css|js\/[a-z-]+\.js))\1/g, `$1$2?v=${v}$1`));
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
  res.json({ ok: mint.ok, boots, firstBoot, mint, site: SITE_URL });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`NutPub on http://localhost:${PORT}  mint: ${MINT_URL}  boot #${boots}`);
  console.log(`ADMIN_KEY=${ADMIN_KEY}`);
});
