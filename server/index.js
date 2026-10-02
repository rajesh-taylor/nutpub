import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
const TUNNEL_FILE = fileURLToPath(new URL('../data/tunnel.url', import.meta.url));
import { KITTY_URL, PORT, ADMIN_KEY, TIERS, CURTAINS_AT } from './config.js';
import { initHouse, balance, take, give, kittyKeysetIds, fundQuote, fundClaim } from './house.js';
import { getDecodedToken } from '@cashu/cashu-ts';
import { cashuGate } from './gate.js';
import { printSuitCoin, suitToken, relabel } from './rupert.js';
import { freePint, pour, resetPints, lastPint, keys as nightKeys } from './pint.js';
import { pledgeGate, finaleState, resetRound, sendToLongy, tipLongy } from './finale.js';
import {
  SEGMENT_DIR, segmentCount, issuePass, getPass, liveSegment, curtainsUp, newShow, lightsDown, events, snapshot, addToState, broadcast,
} from './show.js';

const app = express();
app.disable('x-powered-by');
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
// Cloudflare (our zone's Browser Cache TTL) tells browsers to keep CSS and JS for 4 hours, whatever we send.
// So every page links its CSS and JS with ?v=<last build time>: a new build is a new URL, and phones get it at once.
const version = () => Math.max(...['pub.css', 'nav.js', ...readdirSync(`${PUBLIC}/js`).map((f) => `js/${f}`)]
  .map((f) => statSync(`${PUBLIC}/${f}`).mtimeMs)).toString(36);
app.get(/^\/(?:[a-z]+\.html)?$/, (req, res, next) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  let html;
  try { html = readFileSync(`${PUBLIC}/${file}`, 'utf8'); } catch { return next(); }
  const v = version();
  res.set('Cache-Control', 'no-cache').type('html')
    .send(html.replace(/(["'])(\/(?:pub\.css|nav\.js|js\/[a-z]+\.js))\1/g, `$1$2?v=${v}$1`));
});
app.use(express.static(PUBLIC, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// The Kitty, relayed: phones that can only reach us (USB, locked-down wifi) still reach the mint.
// The page keeps the real mint URL in its tokens and only rewrites where it sends the request.
app.use('/kitty', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const r = await fetch(KITTY_URL + req.url, {
      method: req.method,
      headers: { 'content-type': req.get('content-type') || 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    });
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ detail: `relay to the Kitty failed: ${e.message}` });
  }
});

// One line per money event, with the time, so the float can be accounted for afterwards.
const log = (msg) => console.log(`${new Date().toTimeString().slice(0, 8)} ${msg}`);

const tierOf = (req) => (TIERS[req.query.tier] ? req.query.tier : 'ticket');
const admin = (req, res, next) =>
  req.get('X-Admin') === ADMIN_KEY ? next() : res.status(403).json({ error: 'forbidden' });

app.get('/api/health', async (_req, res) => {
  const info = await fetch(`${KITTY_URL}/v1/info`).then((r) => r.json());
  res.json({ ok: true, kitty: KITTY_URL, mint: info.name, version: info.version, nuts: Object.keys(info.nuts) });
});

// The public address for QR codes: the tunnel URL if one is running, else whatever the page was loaded from.
const publicUrl = () => { try { return readFileSync(TUNNEL_FILE, 'utf8').trim() || null; } catch { return null; } };
// The hero photos for the door, as picked on /pick.html (files under public/img, which stays out of git).
const PICKS_FILE = fileURLToPath(new URL('../data/picks.json', import.meta.url));
const HEROES_FILE = fileURLToPath(new URL('../data/heroes.json', import.meta.url));
const heroes = () => {
  try { return JSON.parse(readFileSync(HEROES_FILE, 'utf8')); } catch {}
  try { return { door: JSON.parse(readFileSync(PICKS_FILE, 'utf8')).files || [] }; } catch { return {}; }
};
app.post('/api/picks', express.json({ limit: '4kb' }), (req, res) => {
  const files = (req.body?.files || []).filter((f) => /^[a-z0-9/-]+$/i.test(f)).slice(0, 12);
  writeFileSync(PICKS_FILE, JSON.stringify({ picks: req.body?.picks || [], files, at: new Date().toISOString() }));
  log(`hero picks: ${(req.body?.picks || []).join(', ')}`);
  res.json({ ok: true, files });
});

app.get('/api/config', (_req, res) => res.json({ kitty: KITTY_URL, tiers: TIERS, publicUrl: publicUrl(), curtainsAt: CURTAINS_AT, heroes: heroes() }));

// A gift: live ecash from the house float, shown as a QR on the stage screen (admin only).
app.post('/api/gift', admin, async (req, res) => {
  const amount = Math.min(Math.max(Number(req.query.amount) || 21, 1), 210);
  try {
    const token = await give(amount);
    log(`gift ${amount}, house ${balance()}`);
    res.json({ token, balance: balance() });
  } catch (e) {
    res.status(409).json({ error: String(e.message || e), balance: balance() });
  }
});

// The door. "If your sats ain't signed, you ain't coming in!"
app.get('/api/door', cashuGate((req) => TIERS[tierOf(req)].door, 'The NutPub door'), (req, res) => {
  const tier = tierOf(req);
  const pass = issuePass(tier);
  log(`door ${tier} +${req.paid}, house ${balance()}`);
  // Plebs pay per 10 s from the start: their door payment is the segment that's live (or the first one).
  if (tier === 'stream') getPass(pass).paid.add(liveSegment() ?? 0); // the pass's first 10 s
  res.json({ in: true, tier, name: TIERS[tier].name, paid: req.paid, pass });
});

// The stream: every 10-second segment is its own 402. Stop paying and the music stops.
const passOf = (req) => getPass(req.get('X-Pass') || '');
app.get(
  '/api/segment/:n',
  (req, res, next) => {
    const pass = passOf(req);
    if (!pass) return res.status(403).json({ error: 'no_pass', detail: 'Pay at the door first.' });
    const n = Number(req.params.n);
    req.segment = n;
    // Already paid for this one: the same segment again, charged once (Basement58: a retry after a lost reply,
    // even if the show has moved on while the phone was out of signal).
    if (pass.paid.has(n)) return sendSegment(req, res);
    const live = liveSegment();
    if (live == null) return res.status(409).json({ error: 'curtains_down' });
    if (!Number.isInteger(n) || n < live || n > live + 1) return res.status(409).json({ error: 'not_live', live });
    next();
  },
  cashuGate((req) => TIERS[passOf(req).tier].segment, 'The NutPub stream, 10 s'),
  async (req, res) => {
    passOf(req).paid.add(req.segment);
    // Basement58 (presenter's phone only): paid, but the reply is held long enough for the phone to lose it.
    if (req.get('X-Basement')) {
      console.log(`basement: segment ${req.segment} paid; holding the reply 5 s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    sendSegment(req, res);
  },
);
function sendSegment(req, res) {
  const file = `seg-${String(req.segment % segmentCount()).padStart(3, '0')}.wav`;
  res.set('Cache-Control', 'no-store');
  res.sendFile(file, { root: SEGMENT_DIR });
}

// First pint's on the house: a 21-sat token only the bar's key can pour. One per phone.
app.post('/api/pint', async (req, res) => {
  const id = req.get('X-Pass') || '';
  if (!getPass(id)) return res.status(403).json({ error: 'no_pass', detail: 'Pay at the door first.' });
  if (getPass(id).tier !== 'ticket') return res.status(409).json({ error: 'not_in_room', detail: 'Free pints are for people in the room.' });
  try { res.json({ token: await freePint(id) }); log(`pint issued, house ${balance()}`); }
  catch (e) { res.status(e.code ? 409 : 502).json({ error: e.code || 'house_dry', detail: e.message }); }
});
// The bar page posts what it scanned. "Already poured, mate." if it's been poured before.
app.post('/api/bar/pour', express.text({ type: '*/*', limit: '16kb' }), async (req, res) => {
  try { res.json(await pour(String(req.body || '').trim())); log(`pint poured, house ${balance()}`); }
  catch (e) { res.status(e.code ? 400 : 502).json({ error: e.code || 'mint_refused', detail: e.message }); }
});
app.get('/api/pint/last', admin, (_req, res) => res.json(lastPint));
app.get('/api/bar', (_req, res) => res.json({ pubkey: nightKeys.bar.pk }));

app.get('/api/pass', (req, res) => {
  const p = passOf(req);
  if (!p) return res.status(403).json({ error: 'no_pass' });
  res.json({ tier: p.tier, name: TIERS[p.tier].name });
});

// The finale: a round for the band. The 402 asks for a locked token (nut10); the gate holds it, never swaps it.
addToState((phones) => ({ finale: finaleState(phones) }));
app.get('/api/pledge', (req, res, next) => (passOf(req) ? next() : res.status(403).json({ error: 'no_pass' })),
  pledgeGate(() => snapshot().phones, broadcast));

// A tip for Longy from the livestream: its own 402, then the amount moves to his takings.
const TIP = 21;
app.get('/api/tip', cashuGate(() => TIP, 'A tip for Longy'),
  async (req, res) => {
    try {
      const tips = await tipLongy(req.paid);
      log(`tip +${req.paid} to Longy (tips ${tips}), house ${balance()}`);
      res.json({ tipped: req.paid, tips });
    } catch (e) {
      res.status(502).json({ error: 'tip_failed', detail: String(e.message || e) });
    }
  });

// Retry the Lightning leg by hand (e.g. Longy's address was down).
app.post('/api/payout', admin, async (_req, res) => res.json(await sendToLongy()));

app.get('/api/events', events);
app.get('/api/show', (_req, res) => res.json(snapshot()));
app.post('/api/curtains', admin, (_req, res) => { curtainsUp(); res.json(snapshot()); });
app.post('/api/rehearse', admin, (_req, res) => { lightsDown(); resetRound(); res.json(snapshot()); });
app.post('/api/new-show', admin, (_req, res) => { newShow(); resetPints(); resetRound(); res.json(snapshot()); });

// Rupert's printing press. kind=suit: SuitCoin as printed; kind=relabel: the same notes relabelled as the Kitty.
app.get('/api/rupert/print', async (req, res) => {
  try {
    const t = await printSuitCoin(21);
    res.json({ token: req.query.kind === 'relabel' ? relabel(t) : suitToken(t) });
  } catch (e) {
    res.status(502).json({ error: 'suitcoin_mint_down', detail: String(e.message || e) });
  }
});

// Top up the house float with any Kitty token (admin only).
app.post('/api/house/fund', admin, async (req, res) => {
  try {
    await take(getDecodedToken(req.get('X-Cashu').trim(), kittyKeysetIds).proofs);
    res.json({ balance: balance() });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
// Top up over Lightning: a bolt11 to pay from any wallet, then claim the ecash into the house.
app.post('/api/house/invoice', admin, async (req, res) => {
  try { res.json(await fundQuote(Math.min(Number(req.query.amount) || 3000, 10000))); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});
app.post('/api/house/claim', admin, async (req, res) => {
  try { res.json({ ...(await fundClaim(req.query.quote, Number(req.query.amount))), balance: balance() }); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
app.get('/api/house', admin, (_req, res) => res.json({ balance: balance() }));

await initHouse();
app.listen(PORT, () => {
  console.log(`NutPub on http://localhost:${PORT}  Kitty: ${KITTY_URL}  house: ${balance()} sats`);
  console.log(`ADMIN_KEY=${ADMIN_KEY}`);
});
