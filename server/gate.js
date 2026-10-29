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
// One line per 402, refusal and payment, so a phone that "didn't pay" can be traced. Never the token itself.
const log = (res, what) => console.log(`${new Date().toISOString().slice(11, 19)} ${res.req.method} ${res.req.path} ${what}`);
const refuse = (res, status, error, detail) => {
  log(res, `${status} ${error}${detail ? `: ${String(detail).slice(0, 120)}` : ''}`);
  return res.status(status).json({ error, detail });
};

const LOCK = {
  not_locked: 'not locked to the owner’s key (NUT-11 P2PK)',
  wrong_lock: 'locked to another key, or with extra conditions',
  has_refund: 'has a locktime or refund keys: it could go back to the payer',
};
const tagText = (tags) => tags.map((t) => t.map((v) => String(v).toLowerCase()).join(' ')).sort().join('|');
// What's wrong with one proof's lock, or null if it's locked to `pubkey` with exactly the tags asked for (none: the
// owner's for good; a drink: locktime at last orders and a refund to the artist). Anything else changes who can spend it.
function lockProblem(secret, pubkey, want) {
  try {
    const [kind, { data, tags = [] }] = JSON.parse(secret);
    if (kind !== 'P2PK') return 'not_locked';
    if (String(data).toLowerCase() !== pubkey) return 'wrong_lock';
    const rest = tags.filter(([k, v]) => !(k === 'sigflag' && v === 'SIG_INPUTS'));
    if (!want.length && rest.some(([k]) => k === 'locktime' || k === 'refund')) return 'has_refund';
    if (tagText(rest) !== tagText(want)) return 'wrong_lock';
    return null;
  } catch {
    return 'not_locked'; // a plain secret: anyone holding the token could spend it
  }
}

// One transaction, so two requests carrying the same token can't both pass. Returns the payment's id, or false:
// some proof was seen already.
function record(token, proofs, sats, kind, pubkey) {
  const at = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (proofs.some((p) => isSeen.get(p.secret))) { db.exec('ROLLBACK'); return false; }
    const id = Number(addLocked.run(token, sats, kind, pubkey, at).lastInsertRowid);
    for (const p of proofs) markSeen.run(p.secret, at);
    db.exec('COMMIT');
    return id;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// price(req) -> sats; label(req) -> the request's description; lockTo() -> the owner's pubkey (null until their
// takings page has been opened once); tags() -> extra NUT-11 tags the lock must carry (default none); kind: 'piece' |
// 'tip' | 'ticket' | 'drink'. On success: req.paid = sats locked to the owner, req.lockedId = the payment's id.
export function cashuGate(price, label, { lockTo, kind, tags = () => [], owner = () => currentShow().show.artist || 'the artist' }) {
  return async (req, res, next) => {
    const amount = price(req);
    const pubkey = lockTo();
    const want = tags();
    if (!pubkey || want.some((t) => t.some((v) => v == null))) {
      return refuse(res, 409, 'not_ready', `Open ${owner()}’s takings page once first.`);
    }
    const token = req.get('X-Cashu')?.trim();

    if (!token) {
      const lock = { kind: 'P2PK', data: pubkey, tags: want }; // no tags: the owner's for good
      const pr = new PaymentRequest(undefined, randomBytes(8).toString('hex'), amount, 'sat', [MINT_URL], label(req), true, lock);
      res.set('X-Cashu', pr.toEncodedCreqA());
      res.set('Access-Control-Expose-Headers', 'X-Cashu');
      log(res, `402 ${amount} sats`);
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
      const why = lockProblem(p.secret, pubkey, want);
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
    const id = record(token, proofs, sats, kind, pubkey);
    if (!id) return refuse(res, 400, 'reused', 'token already used here');
    log(res, `paid ${sats} sats (${kind})`);
    req.paid = sats;
    req.lockedId = id;
    next();
  };
}
