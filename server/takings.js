// The artist's takings: every payment the gate accepted, locked to the artist's key and kept here as the token
// itself. Only the takings page (/takings.html#k=<admin key>), in the browser that holds the key, can collect them.
// The server only ever learns the public key, and marks a payment collected only when the mint says it's spent.
import { getDecodedToken, CheckStateEnum } from '@cashu/cashu-ts';
import { db, kv } from './db.js';
import { mint, keysetIds, balance } from './purse.js';
import './gate.js'; // creates the `locked` table this module reads

export const artistKey = () => kv.get('artistKey');
const COMPRESSED = /^0[23][0-9a-f]{64}$/; // a 33-byte compressed secp256k1 public key, in hex

const waiting = db.prepare('SELECT id, token, sats, kind, pubkey, at FROM locked WHERE collected_at IS NULL ORDER BY id');
const byKind = db.prepare(`SELECT kind, collected_at IS NOT NULL AS collected, COALESCE(SUM(sats), 0) AS sats, COUNT(*) AS n
                           FROM locked GROUP BY kind, collected`);
const markCollected = db.prepare('UPDATE locked SET collected_at = ? WHERE id = ? AND collected_at IS NULL');
const getLocked = db.prepare('SELECT token FROM locked WHERE id = ? AND collected_at IS NULL');

const totals = (list) => ({ sats: list.reduce((s, p) => s + p.sats, 0), count: list.length });

export function mountTakings(app, admin, json) {
  // The takings page sends the public key it made. The private key never leaves that browser.
  app.put('/api/admin/artist-key', admin, json, (req, res) => {
    const pubkey = String(req.body?.pubkey || '').toLowerCase();
    if (!COMPRESSED.test(pubkey)) return res.status(400).json({ error: 'bad_key', detail: 'a 33-byte compressed public key, in hex' });
    kv.set('artistKey', pubkey);
    res.json({ pubkey });
  });

  // Payments not collected yet. `here`: locked to the current key (the rest wait for the browser with the old one).
  app.get('/api/admin/locked', admin, (_req, res) => {
    const list = waiting.all().map((r) => ({ ...r }));
    const key = artistKey();
    res.json({ pubkey: key, waiting: list, totals: { all: totals(list), here: totals(list.filter((p) => p.pubkey === key)) } });
  });

  // The page says it collected these. Never taken on its word: each must be spent at the mint (NUT-07),
  // which, locked to the artist, only the artist's key can have done.
  app.post('/api/admin/locked/collected', admin, json, async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))].slice(0, 500);
    const collected = [];
    const notYet = [];
    for (const id of ids) {
      const row = getLocked.get(id);
      if (!row) continue;
      let states;
      try {
        states = await mint.checkProofsStates(getDecodedToken(row.token, keysetIds).proofs);
      } catch (e) {
        return res.status(502).json({ error: 'mint_unreachable', detail: String(e.message || e), collected });
      }
      if (states.every((s) => s.state === CheckStateEnum.SPENT)) {
        markCollected.run(new Date().toISOString(), id);
        collected.push(id);
      } else notYet.push(id);
    }
    res.json({ collected, notYet });
  });

  // The night's takings by kind. `before`: the purse from before Sat 10 Oct, when the gate still swapped payments
  // into the server's own wallet. Shown, so nothing silently vanishes.
  app.get('/api/admin/takings', admin, (_req, res) => {
    const kinds = { piece: { waiting: 0, collected: 0, count: 0 }, tip: { waiting: 0, collected: 0, count: 0 } };
    for (const r of byKind.all()) {
      const k = (kinds[r.kind] ??= { waiting: 0, collected: 0, count: 0 });
      k[r.collected ? 'collected' : 'waiting'] += r.sats;
      k.count += r.n;
    }
    const stream = db.prepare('SELECT COALESCE(SUM(sats), 0) AS s, COUNT(*) AS n FROM paid').get();
    const tips = db.prepare('SELECT COALESCE(SUM(sats), 0) AS s, COUNT(*) AS n FROM tips').get();
    res.json({
      locked: kinds,
      before: balance(),
      stream: { sats: stream.s, pieces: stream.n },
      tips: { sats: tips.s, count: tips.n },
    });
  });
}
