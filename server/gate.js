// The NUT-24 gate: 402 with a NUT-18 payment request (creqA) in X-Cashu; the retry carries a cashuB token in X-Cashu.
// Checks, cheapest first: token parses -> mint -> unit -> amount (no mint call) -> keyset -> already used here
// -> DLEQ, NUT-12, required (offline) -> swap, NUT-03 (the mint). Each refusal has its own error code.
import { randomBytes } from 'node:crypto';
import { PaymentRequest, getTokenMetadata, getDecodedToken, hasValidDleq, sumProofs } from '@cashu/cashu-ts';
import { MINT_URL } from './config.js';
import { db } from './db.js';
import { mint, keysetIds, take } from './purse.js';

// Secrets this gate has accepted. On disk: after a restart a replayed token still gets `reused`
// without a mint call (and the mint's own "already spent" would catch it anyway).
db.exec('CREATE TABLE IF NOT EXISTS seen (secret TEXT PRIMARY KEY, at TEXT NOT NULL)');
const isSeen = db.prepare('SELECT 1 FROM seen WHERE secret = ?');
const markSeen = db.prepare('INSERT OR IGNORE INTO seen (secret, at) VALUES (?, ?)');

const norm = (url) => String(url || '').replace(/\/+$/, '');
const refuse = (res, status, error, detail) => res.status(status).json({ error, detail });

// price(req) -> sats; label(req) -> the request's description. On success: req.paid = sats taken.
export function cashuGate(price, label) {
  return async (req, res, next) => {
    const amount = price(req);
    const token = req.get('X-Cashu')?.trim();

    if (!token) {
      const pr = new PaymentRequest(undefined, randomBytes(8).toString('hex'), amount, 'sat', [MINT_URL], label(req), true);
      res.set('X-Cashu', pr.toEncodedCreqA());
      res.set('Access-Control-Expose-Headers', 'X-Cashu');
      return res.status(402).json({ error: 'payment_required', amount, unit: 'sat', mints: [MINT_URL] });
    }

    let meta;
    try { meta = getTokenMetadata(token); } catch (e) { return refuse(res, 400, 'bad_token', e.message); }
    if (norm(meta.mint) !== MINT_URL) return refuse(res, 400, 'wrong_mint', `${meta.mint} is not this show's mint`);
    if ((meta.unit || 'sat') !== 'sat') return refuse(res, 400, 'wrong_unit', meta.unit);
    if (Number(meta.amount) < amount) return refuse(res, 400, 'too_little', `${meta.amount} < ${amount} sats`);

    let proofs;
    try { proofs = getDecodedToken(token, keysetIds).proofs; } catch (e) {
      return refuse(res, 400, 'unknown_keyset', e.message);
    }
    if (proofs.some((p) => isSeen.get(p.secret))) return refuse(res, 400, 'reused', 'token already used here');

    if (proofs.some((p) => !p.dleq)) return refuse(res, 400, 'no_dleq', 'token carries no DLEQ proofs');
    for (const p of proofs) {
      let ok = false;
      try { ok = hasValidDleq(p, mint.getKeyset(p.id), { require: true }); } catch {}
      if (!ok) return refuse(res, 400, 'bad_dleq', 'signature does not match the mint’s keys');
    }

    try {
      await take(proofs);
    } catch (e) {
      const msg = String(e.message || e);
      if (/spent/i.test(msg)) return refuse(res, 400, 'reused', msg);
      if (e.status || e.code) return refuse(res, 400, 'mint_refused', msg);
      return refuse(res, 502, 'mint_unreachable', msg);
    }
    const at = new Date().toISOString();
    for (const p of proofs) markSeen.run(p.secret, at);
    req.paid = Number(sumProofs(proofs));
    next();
  };
}
