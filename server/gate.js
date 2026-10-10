// The NUT-24 gate: 402 with a NUT-18 payment request (creqA) in X-Cashu; the retry carries a cashuB token in X-Cashu.
// Every payment is locked to the artist's key (NUT-11 P2PK, no locktime, no refund). The gate checks it and never
// swaps it: this server can't spend a sat. The artist collects on the takings page, the one place the key is.
// Checks, cheapest first: token parses -> mint -> unit -> amount -> keyset (no mint call) -> locked -> to the artist
// -> no refund path -> not used here -> DLEQ, NUT-12, required (offline) -> unspent at the mint, NUT-07.
// Each refusal has its own error code.
import { randomBytes } from 'node:crypto';
import { PaymentRequest, CheckStateEnum, getTokenMetadata, getDecodedToken, hasValidDleq, sumProofs } from '@cashu/cashu-ts';
import { MINT_URL } from './config.js';
import { db } from './db.js';
import { mint, keysetIds } from './purse.js';
import { currentShow } from './shows.js';

// `seen`: secrets this gate has accepted, on disk, so a replay gets `reused` without a mint call, even after a restart.
// `locked`: each accepted payment, as the token itself: a sealed envelope only the artist's key opens.
db.exec(`
  CREATE TABLE IF NOT EXISTS seen (secret TEXT PRIMARY KEY, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS locked (
    id           INTEGER PRIMARY KEY,
    token        TEXT NOT NULL,
    sats         INTEGER NOT NULL,
    kind         TEXT NOT NULL,     -- 'piece' | 'tip'
    pubkey       TEXT NOT NULL,     -- the key it's locked to: it collects only where that key is
    at           TEXT NOT NULL,
    collected_at TEXT
  );
`);
const isSeen = db.prepare('SELECT 1 FROM seen WHERE secret = ?');
const markSeen = db.prepare('INSERT INTO seen (secret, at) VALUES (?, ?)');
const addLocked = db.prepare('INSERT INTO locked (token, sats, kind, pubkey, at) VALUES (?, ?, ?, ?, ?)');

const norm = (url) => String(url || '').replace(/\/+$/, '');
const refuse = (res, status, error, detail) => res.status(status).json({ error, detail });

const LOCK = {
  not_locked: 'not locked to the artist’s key (NUT-11 P2PK)',
  wrong_lock: 'locked to another key, or with extra conditions',
  has_refund: 'has a locktime or refund keys: it could go back to the payer',
};
// What's wrong with one proof's lock, or null if it's locked to the artist alone, for good.
function lockProblem(secret, pubkey) {
  try {
    const [kind, { data, tags = [] }] = JSON.parse(secret);
    if (kind !== 'P2PK') return 'not_locked';
    if (String(data).toLowerCase() !== pubkey) return 'wrong_lock';
    if (tags.some(([k]) => k === 'locktime' || k === 'refund')) return 'has_refund';
    // Anything else (more keys, n_sigs, SIG_ALL) changes who can spend it or how.
    if (tags.some(([k, v]) => !(k === 'sigflag' && v === 'SIG_INPUTS'))) return 'wrong_lock';
    return null;
  } catch {
    return 'not_locked'; // a plain secret: anyone holding the token could spend it
  }
}

// One transaction, so two requests carrying the same token can't both pass. False: some proof was seen already.
function record(token, proofs, sats, kind, pubkey) {
  const at = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (proofs.some((p) => isSeen.get(p.secret))) { db.exec('ROLLBACK'); return false; }
    addLocked.run(token, sats, kind, pubkey, at);
    for (const p of proofs) markSeen.run(p.secret, at);
    db.exec('COMMIT');
    return true;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// price(req) -> sats; label(req) -> the request's description; lockTo() -> the artist's pubkey (null until the
// takings page has been opened once); kind: 'piece' | 'tip'. On success: req.paid = sats locked to the artist.
export function cashuGate(price, label, { lockTo, kind }) {
  return async (req, res, next) => {
    const amount = price(req);
    const pubkey = lockTo();
    if (!pubkey) {
      return refuse(res, 409, 'not_ready', `Open ${currentShow().show.artist || 'the artist'}’s takings page once first.`);
    }
    const token = req.get('X-Cashu')?.trim();

    if (!token) {
      const lock = { kind: 'P2PK', data: pubkey, tags: [] }; // no locktime, no refund: the artist's for good
      const pr = new PaymentRequest(undefined, randomBytes(8).toString('hex'), amount, 'sat', [MINT_URL], label(req), true, lock);
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
    for (const p of proofs) {
      const why = lockProblem(p.secret, pubkey);
      if (why) return refuse(res, 400, why, LOCK[why]);
    }
    if (proofs.some((p) => isSeen.get(p.secret))) return refuse(res, 400, 'reused', 'token already used here');

    if (proofs.some((p) => !p.dleq)) return refuse(res, 400, 'no_dleq', 'token carries no DLEQ proofs');
    for (const p of proofs) {
      let ok = false;
      try { ok = hasValidDleq(p, mint.getKeyset(p.id), { require: true }); } catch {}
      if (!ok) return refuse(res, 400, 'bad_dleq', 'signature does not match the mint’s keys');
    }

    // The mint's word that none of it is spent (or mid-spend) yet. Locked to the artist alone, the payer can't
    // spend it after this, so unspent now means the artist's to collect.
    let states;
    try {
      states = await mint.checkProofsStates(proofs);
    } catch (e) {
      const msg = String(e.message || e);
      if (e.status || e.code) return refuse(res, 400, 'mint_refused', msg);
      return refuse(res, 502, 'mint_unreachable', msg);
    }
    if (states.length !== proofs.length || states.some((s) => s.state !== CheckStateEnum.UNSPENT)) {
      return refuse(res, 400, 'reused', 'spent (or being spent) at the mint');
    }

    const sats = Number(sumProofs(proofs));
    if (!record(token, proofs, sats, kind, pubkey)) return refuse(res, 400, 'reused', 'token already used here');
    req.paid = sats;
    next();
  };
}
