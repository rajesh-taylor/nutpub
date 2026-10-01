import express from 'express';
import { fileURLToPath } from 'node:url';
import { KITTY_URL, PORT, ADMIN_KEY, TIERS } from './config.js';
import { initHouse, balance, take, give, kittyKeysetIds, fundQuote, fundClaim } from './house.js';
import { getDecodedToken } from '@cashu/cashu-ts';
import { cashuGate } from './gate.js';
import { printSuitCoin, suitToken, relabel } from './rupert.js';

const app = express();
app.disable('x-powered-by');
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

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

const tierOf =(req) => (TIERS[req.query.tier] ? req.query.tier : 'pleb');
const admin = (req, res, next) =>
  req.get('X-Admin') === ADMIN_KEY ? next() : res.status(403).json({ error: 'forbidden' });

app.get('/api/health', async (_req, res) => {
  const info = await fetch(`${KITTY_URL}/v1/info`).then((r) => r.json());
  res.json({ ok: true, kitty: KITTY_URL, mint: info.name, version: info.version, nuts: Object.keys(info.nuts) });
});

app.get('/api/config', (_req, res) => res.json({ kitty: KITTY_URL, tiers: TIERS }));

// A gift: live ecash from the house float, shown as a QR on the stage screen (admin only).
app.post('/api/gift', admin, async (req, res) => {
  const amount = Math.min(Math.max(Number(req.query.amount) || 21, 1), 210);
  try {
    res.json({ token: await give(amount), balance: balance() });
  } catch (e) {
    res.status(409).json({ error: String(e.message || e), balance: balance() });
  }
});

// The door. "If your sats ain't signed, you ain't coming in!"
app.get('/api/door', cashuGate((req) => TIERS[tierOf(req)].door, 'The NutPub door'), (req, res) => {
  const tier = tierOf(req);
  res.json({ in: true, tier, name: TIERS[tier].name, paid: req.paid });
});

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
