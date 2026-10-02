// The finale: "A round for the band". Pledges of 21 sats, each locked (NUT-11 P2PK) to Longy's key, locktime =
// last orders, refund = a fresh key of the fan's own. The 402 *requires* the lock (NUT-24 nut10). The gate never
// swaps a pledge: it checks it and holds it. Goal hit → Longy's key claims them all. Missed → after last orders
// each phone takes its own back with its refund key. Nobody presses refund.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  PaymentRequest, getTokenMetadata, getDecodedToken, hasValidDleq, parseP2PKSecret, getTag, getTagInt, hashToCurve,
  sumProofs,
} from '@cashu/cashu-ts';
import { KITTY_URL } from './config.js';
import { kitty, kittyKeysetIds } from './house.js';
import { keys, lastOrdersAt } from './pint.js';
import { show } from './show.js';
import { payout, payLongy, resetPayout } from './payout.js';

export const PLEDGE = 21;
const ARTIST_FILE = fileURLToPath(new URL(`../data/artist-${KITTY_URL.replace(/\W+/g, '_')}.json`, import.meta.url));

export const round = { pledges: [], state: 'open', goal: null, paidAt: null };
let artistProofs = [];
try { artistProofs = JSON.parse(readFileSync(ARTIST_FILE, 'utf8')); } catch {}

const total = () => round.pledges.reduce((s, p) => s + p.amount, 0);
export const goalFor = (phones) => round.goal ?? PLEDGE * Math.max(phones, 1);

export function finaleState(phones) {
  const now = Math.floor(Date.now() / 1000);
  if (round.state === 'open' && show.t0 && now >= lastOrdersAt()) round.state = 'missed';
  return {
    state: round.state, total: total(), goal: goalFor(phones), pledges: round.pledges.length,
    lastOrders: lastOrdersAt(), artist: keys.artist.pk, artistTakings: Number(sumProofs(artistProofs)),
    payout: { state: payout.state, sats: payout.sats },
  };
}

export function resetRound() {
  round.pledges = [];
  round.state = 'open';
  round.goal = null;
  round.paidAt = null;
  resetPayout();
}

const refuse = (res, code, detail) => res.status(400).json({ error: code, detail });
const enc = new TextEncoder();

// GET /api/pledge: 402 asking for a *locked* token; the retry carries it.
export function pledgeGate(phonesIn, onChange) {
  return async (req, res) => {
    if (round.state !== 'open') return res.status(409).json({ error: `round_${round.state}` });
    const lock = { kind: 'P2PK', data: keys.artist.pk, tags: [['locktime', String(lastOrdersAt())]] };
    const token = req.get('X-Cashu');

    if (!token) {
      const pr = new PaymentRequest(undefined, randomBytes(8).toString('hex'), PLEDGE, 'sat', [KITTY_URL],
        'A round for the band (refund to you at last orders)', true, lock);
      res.set('X-Cashu', pr.toEncodedCreqA());
      res.set('Access-Control-Expose-Headers', 'X-Cashu');
      return res.status(402).json({ error: 'payment_required', amount: PLEDGE, unit: 'sat', mints: [KITTY_URL], nut10: lock });
    }

    let meta, proofs;
    try {
      meta = getTokenMetadata(token.trim());
      if (meta.mint.replace(/\/+$/, '') !== KITTY_URL) return refuse(res, 'wrong_mint', `${meta.mint} is not the NutPub Mint`);
      if ((meta.unit || 'sat') !== 'sat') return refuse(res, 'wrong_unit', meta.unit);
      if (Number(meta.amount) < PLEDGE) return refuse(res, 'too_little', `${meta.amount} < ${PLEDGE} sats`);
      proofs = getDecodedToken(token.trim(), kittyKeysetIds).proofs;
    } catch (e) {
      return refuse(res, 'bad_token', e.message);
    }

    // The lock this 402 asked for: to Longy, until last orders, with a refund path that isn't Longy's.
    for (const p of proofs) {
      let s;
      try { s = parseP2PKSecret(p.secret); } catch { return refuse(res, 'not_locked', 'a pledge must be locked to the artist'); }
      if (s[1].data.toLowerCase() !== keys.artist.pk) return refuse(res, 'wrong_lock', 'locked to someone other than the artist');
      const lt = getTagInt(s, 'locktime');
      if (!lt || lt < lastOrdersAt()) return refuse(res, 'wrong_locktime', 'locktime must be last orders');
      const refunds = getTag(s, 'refund') || [];
      if (!refunds.length) return refuse(res, 'no_refund', 'no refund key: after last orders anyone could spend it');
      if (refunds.some((k) => k.toLowerCase() === keys.artist.pk)) return refuse(res, 'bad_refund', 'refund must go back to you');
      if (round.pledges.some((pl) => pl.secrets.includes(p.secret))) return refuse(res, 'reused', 'already pledged');
      let ok = false;
      try { ok = hasValidDleq(p, kitty.getKeyset(p.id), { require: true }); } catch {}
      if (!ok) return refuse(res, 'bad_dleq', 'signature does not match the NutPub Mint’s keys');
    }

    // Not swapped, so ask the mint (NUT-07) that every proof is still unspent.
    try {
      const Ys = proofs.map((p) => hashToCurve(enc.encode(p.secret)).toHex(true));
      const { states } = await kitty.mint.check({ Ys });
      if (states.some((st) => st.state !== 'UNSPENT')) return refuse(res, 'reused', 'already spent');
    } catch (e) {
      return res.status(502).json({ error: 'mint_unreachable', detail: e.message });
    }

    const amount = Number(sumProofs(proofs));
    round.pledges.push({ proofs, amount, secrets: proofs.map((p) => p.secret) });
    const goal = goalFor(phonesIn());
    if (total() >= goal) {
      round.goal = goal;
      round.state = 'claiming';
      claim().then(onChange, onChange);
    }
    onChange();
    res.json({ pledged: amount, total: total(), goal });
  };
}

// Goal hit: Longy's key signs every pledge and the mint swaps them into his takings.
async function claim() {
  try {
    const all = round.pledges.flatMap((p) => p.proofs);
    const fresh = await kitty.receive(all, { privkey: keys.artist.sk });
    artistProofs.push(...fresh);
    writeFileSync(ARTIST_FILE, JSON.stringify(artistProofs));
    round.state = 'paid';
    round.paidAt = Date.now();
    console.log(`finale: Longy's paid, ${Number(sumProofs(fresh))} sats`);
  } catch (e) {
    round.state = 'open';
    console.error('finale: claim failed', e.message);
    return;
  }
  sendToLongy();
}

// Then over Lightning to his address (if one is set). What's left (change, or everything on failure) stays his.
// The pages see it on their next poll.
export async function sendToLongy() {
  if (payout.state === 'sending' || payout.state === 'off') return payout;
  artistProofs = await payLongy(artistProofs);
  writeFileSync(ARTIST_FILE, JSON.stringify(artistProofs));
  return payout;
}
