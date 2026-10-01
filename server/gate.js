// NUT-24 gate: 402 with a creqA payment request in X-Cashu; the retry carries a cashuB token in X-Cashu.
// Order of checks: mint, unit, amount (no mint call) -> DLEQ, NUT-12 (offline) -> swap, NUT-03 (the mint).
import { randomBytes } from 'node:crypto';
import {
  PaymentRequest, getTokenMetadata, getDecodedToken, hasValidDleq, sumProofs,
} from '@cashu/cashu-ts';
import { KITTY_URL } from './config.js';
import { kitty, kittyKeysetIds, take } from './house.js';

const seen = new Set(); // secrets this gate has already accepted

const norm = (url) => String(url || '').replace(/\/+$/, '');

function refuse(res, status, code, detail) {
  res.status(status).json({ error: code, detail });
}

// priceOf(req) -> sats; label is the request's description.
export function cashuGate(priceOf, label) {
  return async (req, res, next) => {
    const price = priceOf(req);
    const token = req.get('X-Cashu');

    if (!token) {
      const id = randomBytes(8).toString('hex');
      const pr = new PaymentRequest(undefined, id, price, 'sat', [KITTY_URL], label, true);
      res.set('X-Cashu', pr.toEncodedCreqA());
      res.set('Access-Control-Expose-Headers', 'X-Cashu');
      return res.status(402).json({ error: 'payment_required', amount: price, unit: 'sat', mints: [KITTY_URL] });
    }

    let meta;
    try { meta = getTokenMetadata(token.trim()); } catch (e) {
      return refuse(res, 400, 'bad_token', e.message);
    }
    if (norm(meta.mint) !== KITTY_URL) return refuse(res, 400, 'wrong_mint', `${meta.mint} is not the Kitty`);
    if ((meta.unit || 'sat') !== 'sat') return refuse(res, 400, 'wrong_unit', meta.unit);
    if (Number(meta.amount) < price) return refuse(res, 400, 'too_little', `${meta.amount} < ${price} sats`);

    let proofs;
    try { proofs = getDecodedToken(token.trim(), kittyKeysetIds).proofs; } catch (e) {
      return refuse(res, 400, 'unknown_keyset', e.message);
    }
    if (proofs.some((p) => seen.has(p.secret))) return refuse(res, 400, 'reused', 'token already used here');

    // The hologram: each signature must carry a valid DLEQ proof against the Kitty's public keys.
    if (proofs.some((p) => !p.dleq)) return refuse(res, 400, 'no_dleq', 'token carries no DLEQ proofs');
    for (const p of proofs) {
      let ok = false;
      try { ok = hasValidDleq(p, kitty.getKeyset(p.id), { require: true }); } catch {}
      if (!ok) return refuse(res, 400, 'bad_dleq', 'signature does not check out against the Kitty’s keys');
    }

    try {
      await take(proofs);
    } catch (e) {
      const msg = String(e.message || e);
      if (/spent/i.test(msg)) return refuse(res, 400, 'reused', msg);
      if (e.status || e.code) return refuse(res, 400, 'mint_refused', msg);
      return refuse(res, 502, 'mint_unreachable', msg);
    }
    proofs.forEach((p) => seen.add(p.secret));
    req.paid = Number(sumProofs(proofs));
    next();
  };
}
