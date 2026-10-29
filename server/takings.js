// The artist's takings: every payment the gate accepted, locked to its owner's key and kept here as the token
// itself. Only Takings (/takings), in the browser that holds the key, can collect them. The server only ever learns
// the public key, and marks a payment collected only when the mint says it's spent.
import { getDecodedToken } from '@cashu/cashu-ts';
import { one, all, run, kv } from './db.js';
import { keysetIds, proofStates } from './gate.js';
import { showOf, lastOrdersAt } from './shows.js';
import { json, body, now } from './http.js';

export const artistKey = () => kv.get('artistKey');
const COMPRESSED = /^0[23][0-9a-f]{64}$/; // a 33-byte compressed secp256k1 public key, in hex

const totals = (list) => ({ sats: list.reduce((s, p) => s + p.sats, 0), count: list.length });

export function mountTakings(route, admin) {
  // The takings page sends the public key it made. The private key never leaves that browser.
  route('PUT', '/api/admin/artist-key', admin, async (c) => {
    const pubkey = String((await body(c))?.pubkey || '').toLowerCase();
    if (!COMPRESSED.test(pubkey)) return json({ error: 'bad_key', detail: 'a 33-byte compressed public key, in hex' }, 400);
    await kv.set('artistKey', pubkey);
    return json({ pubkey });
  });

  // Payments not collected yet. `here`: locked to the current key (the rest wait for the browser with the old one).
  route('GET', '/api/admin/locked', admin, async (c) => {
    const list = await all('SELECT id, token, sats, kind, pubkey, at FROM locked WHERE collected_at IS NULL ORDER BY id');
    const key = await artistKey();
    // Drinks are locked to the bar's key; after last orders the artist's key may take those still waiting (refund path).
    return json({ pubkey: key, lastOrdersAt: lastOrdersAt(await showOf(c)), waiting: list,
      totals: { all: totals(list), here: totals(list.filter((p) => p.pubkey === key)) } });
  });

  // The page says it collected these. Never taken on its word: each must be spent at the mint (NUT-07),
  // which, locked to its owner, only the owner's key can have done.
  route('POST', '/api/admin/locked/collected', admin, async (c) => {
    const b = await body(c);
    const by = ['artist', 'bar'].includes(b?.by) ? b.by : null;
    const ids = [...new Set((Array.isArray(b?.ids) ? b.ids : []).map(Number).filter(Number.isInteger))].slice(0, 500);
    const collected = [];
    const notYet = [];
    for (const id of ids) {
      const row = await one('SELECT token FROM locked WHERE id = ? AND collected_at IS NULL', id);
      if (!row) continue;
      let states;
      try {
        states = await proofStates(getDecodedToken(row.token, await keysetIds()).proofs);
      } catch (e) {
        return json({ error: 'mint_unreachable', detail: String(e.message || e), collected }, 502);
      }
      if (states.every((s) => s === 'SPENT')) {
        await run('UPDATE locked SET collected_at = ?, collected_by = ? WHERE id = ? AND collected_at IS NULL', now(), by, id);
        collected.push(id);
      } else notYet.push(id);
    }
    return json({ collected, notYet });
  });

  // The night's takings by kind, since the last New night.
  route('GET', '/api/admin/takings', admin, async () => {
    const kinds = Object.fromEntries(['piece', 'tip', 'ticket', 'drink'].map((k) => [k, { waiting: 0, collected: 0, count: 0 }]));
    const rows = await all(`SELECT kind, collected_at IS NOT NULL AS collected, COALESCE(SUM(sats), 0) AS sats, COUNT(*) AS n
                            FROM locked WHERE at >= ? GROUP BY kind, collected`, await kv.get('nightStart', ''));
    for (const r of rows) {
      const k = (kinds[r.kind] ??= { waiting: 0, collected: 0, count: 0 });
      k[r.collected ? 'collected' : 'waiting'] += r.sats;
      k.count += r.n;
    }
    const stream = await one('SELECT COALESCE(SUM(sats), 0) AS s, COUNT(*) AS n FROM paid');
    const tips = await one('SELECT COALESCE(SUM(sats), 0) AS s, COUNT(*) AS n FROM tips');
    return json({
      locked: kinds,
      before: 0, // the server's own purse, before Sat 10 Oct: emptied on 29 Oct
      stream: { sats: stream.s, pieces: stream.n },
      tips: { sats: tips.s, count: tips.n },
    });
  });
}
