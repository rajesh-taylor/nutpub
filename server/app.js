// The NutPub's pages and API, for one stage at a time: index.js (the Worker) picks the stage and its database, then
// hands the request here (straight away for Longy's on D1, through the stage's Durable Object for the others).
// Static files (CSS, JS, fonts, photos) are served by Cloudflare straight from the assets; this answers the pages
// (to add the TEST banner and fresh ?v= links), the show's own address (/longy) and /api/*.
import QRCode from 'qrcode';
import { configure, MINT_URL, MINT_TEST, VERSION, ASSETS } from './config.js';
import { kv, stageDb, adminKey, siteUrl } from './db.js';
import { json, chain, body } from './http.js';
import { mountSet } from './set.js';
import { mountDoor, barKey } from './door.js';
import { mountTakings, artistKey } from './takings.js';
import { mountPhoto, photoUrl, photoUrls } from './photo.js';
import { mountLive, useStream } from './live.js';
import { mountRate } from './rate.js';
import { mountMods } from './mods.js';
import { mountWallet } from './wallet.js';
import { mountGoogleWallet } from './gwallet.js';
import { mountPasskeys } from './passkey.js';
import { mountHandoff } from './handoff.js';
import { mountNostr } from './nostr.js';
import { mountNutzaps, nutzapInfo } from './nutzap.js';
import { mountStageDoor } from './stages.js';
import { current, publicShow, saveShow, nextGig, listTemplates, saveTemplate, loadTemplate, deleteTemplate } from './shows.js';

const routes = [];
// route(method, '/exact/path' or /regex with (?<named>) groups/, ...steps)
const route = (method, path, ...steps) => routes.push({ method, path, run: chain(...steps) });
const redirect = (to) => (c) => Response.redirect(new URL(to, c.url), 301);

// ---- Pages. Every page links its CSS and JS with ?v=<this deploy>, so a new deploy is a new URL and phones fetch
// it at once; on the test mint every page says so, first thing.
const page = (file) => async (c) => {
  const res = await ASSETS.fetch(new URL(`/${file}`, c.url));
  if (!res.ok) return null;
  let html = await res.text();
  html = html.replace(/(["'])(\/(?:app\.css|(?:js\/)?[a-z-]+\.js))\1/g, `$1$2?v=${VERSION}$1`);
  // The gig page's strip carries the name too (its masthead has only the artist and the date).
  const strip = file === 'index.html' ? '<b>The NutPu<span class="nb" aria-hidden="true">₿</span><span class="sr">B</span></b> · Test mint · no real value' : 'Test mint · no real value';
  if (MINT_TEST) html = html.replace(/<body[^>]*>/, `$&\n  <div class="test-banner" role="note" data-t="test.banner">${strip}</div>`
    // Inside the setup page's frames the page already says so: only the phone keeps its own.
    + '<script>if (top !== self && !/^\\/[a-z0-9-]+$/.test(location.pathname)) document.currentScript.previousElementSibling.remove();</script>');
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
};
route('GET', '/pocket.html', redirect('/wallet.html')); // its name before 6 Oct
route('GET', '/takings.html', redirect('/takings')); // the artist-only page, before 3 · Takings
// The home page; on an artist's own stage (<id>.thenutpub.com) its setlist, the stage's home.
route('GET', '/', (c) => page(stageDb().id ? 'stage.html' : 'home.html')(c));
route('GET', /^\/(?<file>[a-z-]+\.html)$/, (c) => page(c.params.file)(c));
route('GET', '/demo', redirect('/setup')); // the four-tab demo page, before the three pages
// The night's pages: 1 Show setup, 2 Doors, 3 The show, 4 End night (/takings).
route('GET', '/setup', page('setup.html'));
route('GET', '/menu', page('menu.html')); // Pub Menu: what each part of the night is made of, for judges and the curious
route('GET', '/doors', redirect('/show')); // its own page for a day, 9 Nov
route('GET', '/show', page('show.html'));
route('GET', '/takings', page('night-takings.html'));
route('GET', '/last-orders', redirect('/takings')); // its name before 29 Oct

// Is everything up? The server and the mint.
route('GET', '/api/health', async (c) => {
  let mint;
  try {
    const info = await fetch(`${MINT_URL}/v1/info`, { signal: AbortSignal.timeout(3000), cf: { cacheTtl: 300 } }).then((r) => r.json());
    mint = { ok: true, url: MINT_URL, name: info.name, description: info.description, version: info.version };
  } catch (e) {
    mint = { ok: false, url: MINT_URL, error: String(e.message || e) };
  }
  return json({ ok: mint.ok, firstBoot: await kv.get('firstBoot'), mint: { ...mint, test: MINT_TEST }, site: siteUrl(c) });
});

// ---- The host's pages (/setup.html#k=<admin key>): the account holder's settings for the show.
const isAdmin = (c) => !!adminKey() && c.req.headers.get('X-Admin') === adminKey();
const admin = (c) => (isAdmin(c) ? null : json({ error: 'forbidden' }, 403));
const attempt = (fn) => async (c) => {
  try { return json(await fn(c)); } catch (e) { return json({ error: String(e.message || e) }, 400); }
};

// What every viewer page reads: the show's settings, the photo and the owners' public keys (every payment is locked
// to one). The artist's Lightning address and the stream's server and key go to the host's pages only.
route('GET', '/api/show', async (c) => {
  const now = await current(c);
  const [photo, photos, artist, bar] = await Promise.all([photoUrl(), photoUrls(), artistKey(), barKey()]);
  return json({ ...now, show: isAdmin(c) ? now.show : publicShow(now.show), photo, photos, artistKey: artist, barKey: bar, nutzap: await nutzapInfo(artist) });
});
// The show page's link as a QR code (posters, the screen in the room). Public: so is the link.
route('GET', '/api/show/qr.svg', async (c) => {
  const link = `${siteUrl(c)}${(await current(c)).path}`;
  const svg = await QRCode.toString(link, { type: 'svg', margin: 2, color: { dark: '#050914', light: '#efe3c8' } });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' } });
});
route('PUT', '/api/admin/show', admin, attempt(async (c) => saveShow(await body(c))));
route('POST', '/api/admin/next-gig', admin, attempt(() => nextGig()));
mountHandoff(route, admin); // Sign in on your phone: a one-time QR on Plan gig
route('GET', '/api/admin/templates', admin, attempt(() => listTemplates()));
route('POST', '/api/admin/templates', admin, attempt(async (c) => { const b = await body(c); return saveTemplate(b?.name, b?.show); }));
route('POST', '/api/admin/templates/load', admin, attempt(async (c) => loadTemplate((await body(c))?.name)));
route('POST', '/api/admin/templates/delete', admin, attempt(async (c) => deleteTemplate((await body(c))?.name)));

let PHOTOS;
const pass = mountSet(route);
mountDoor(route, admin, pass);
mountTakings(route, admin);
mountPhoto(route, admin, () => PHOTOS);
mountLive(route, admin, pass);
mountRate(route);
mountMods(route, admin);
mountWallet(route);
mountGoogleWallet(route);
mountPasskeys(route, pass);
mountNostr(route, pass);
mountNutzaps(route, admin, artistKey);
mountStageDoor(route); // Put on a gig, and Back to your stage (thenutpub.com only)

// A page per artist: the show page at /<page> (e.g. /longy), the link the artist shares, and its poster.
async function showPage(c) {
  const { path } = await current(c);
  if (c.url.pathname === path) return page('index.html')(c);
  if (c.url.pathname === `${path}/poster`) return page('poster.html')(c);
  if (c.url.pathname === `${path}/screen`) return page('screen.html')(c); // the room's tippers screen, for the venue
  return null;
}

const notFound = (c) => (c.url.pathname.startsWith('/api/') ? json({ error: 'not_found' }, 404)
  : new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));

// One request, on the stage index.js picked (withStage). env: the Worker's settings and bindings.
export async function serve(req, env) {
  configure(env);
  PHOTOS = env.PHOTOS;
  useStream(env);
  const url = new URL(req.url);
  if (url.protocol === 'http:' && req.headers.get('x-forwarded-proto') === 'http') { // the visitor's own connection; not local dev
    url.protocol = 'https:'; return Response.redirect(url.toString(), 301); }
  const c = { req, url, params: {}, env };
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    for (const r of routes) {
      if (r.method !== method) continue;
      if (typeof r.path === 'string' ? r.path !== url.pathname : !(c.params = url.pathname.match(r.path)?.groups ?? (r.path.test(url.pathname) ? {} : null))) continue;
      return await r.run(c);
    }
    if (method === 'GET' && /^\/[a-z0-9-]+(\/poster|\/screen)?$/.test(url.pathname)) {
      const res = await showPage(c);
      if (res) return res;
    }
    // The set's files are served only through /api/set/*, to a pass that may play them.
    if (url.pathname.startsWith('/set-media/')) return notFound(c);
    if (method === 'GET') {
      const res = await ASSETS.fetch(req);
      if (res.status !== 404) return res;
    }
    return notFound(c);
  } catch (e) {
    if (e.status === 413) return json({ error: 'too_big' }, 413);
    console.log(`${req.method} ${url.pathname} 500 ${String(e.stack || e).slice(0, 300)}`);
    return json({ error: 'server_error' }, 500);
  }
}
