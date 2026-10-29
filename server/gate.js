// The NUT-24 gate: 402 with a NUT-18 payment request (creqA) in X-Cashu; the retry carries a cashuB token in X-Cashu.
// Every payment is locked to its owner's key (NUT-11 P2PK). The gate checks it and never swaps it: this server
// can't spend a sat. The owner collects on Takings, the one place the key is.
// Checks, cheapest first: token parses -> mint -> unit -> amount -> keyset (no mint call) -> locked -> to the owner
// -> exactly the conditions asked for -> not used here -> unspent at the mint, NUT-07. Each refusal has its own code.
// No DLEQ check (NUT-12) since 29 Oct: at ~10 ms of CPU per note it doesn't fit Cloudflare's free plan. A forged
// note gets no further than Collect, where the mint refuses it, and nothing is marked collected until it's spent.
import { PaymentRequest, getTokenMetadata, getDecodedToken, hashToCurve, sumProofs } from '@cashu/cashu-ts';
import { MINT_URL } from './config.js';
import { one, sql, batch } from './db.js';
import { showOf } from './shows.js';
import { json, randomHex, now } from './http.js';

const norm = (url) => String(url || '').replace(/\/+$/, '');

// The mint's keyset ids (token v4 carries short ids), kept for 10 minutes per Worker.
let keysets = { ids: [], at: 0 };
export async function keysetIds() {
  if (Date.now() - keysets.at > 600_000) {
    const { keysets: list } = await fetch(`${MINT_URL}/v1/keysets`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
    keysets = { ids: list.map((k) => k.id), at: Date.now() };
  }
  return keysets.ids;
}

// The mint's word on each proof (NUT-07): 'UNSPENT' | 'PENDING' | 'SPENT', in the proofs' order.
const utf8 = new TextEncoder();
export async function proofStates(proofs) {
  const Ys = proofs.map((p) => hashToCurve(utf8.encode(p.secret)).toHex(true));
  const res = await fetch(`${MINT_URL}/v1/checkstate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Ys }), signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.detail || `mint said ${res.status}`), { status: res.status });
  return Ys.map((Y) => data.states?.find((s) => s.Y === Y)?.state);
}

// One line per 402, refusal and payment, so a phone that "didn't pay" can be traced. Never the token itself.
const log = (c, what) => console.log(`${c.req.method} ${c.url.pathname} ${what}`);
const refuse = (c, status, error, detail) => {
  log(c, `${status} ${error}${detail ? `: ${String(detail).slice(0, 120)}` : ''}`);
  return json({ error, detail }, status);
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

// One transaction, so two requests carrying the same token can't both pass: a secret seen before fails the whole
// batch. Returns the payment's id, or false.
async function record(token, proofs, sats, kind, pubkey) {
  const at = now();
  try {
    const [first] = await batch([
      sql('INSERT INTO locked (token, sats, kind, pubkey, at) VALUES (?, ?, ?, ?, ?) RETURNING id', token, sats, kind, pubkey, at),
      ...proofs.map((p) => sql('INSERT INTO seen (secret, at) VALUES (?, ?)', p.secret, at)),
    ]);
    return first.results[0].id;
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e.message))) return false;
    throw e;
  }
}

// price(c) -> sats; label(c) -> the request's description; lockTo(c) -> the owner's pubkey (null until their
// takings page has been opened once); tags(c) -> extra NUT-11 tags the lock must carry (default none); kind: 'piece' |
// 'tip' | 'ticket' | 'drink'. On success: c.paid = sats locked to the owner, c.lockedId = the payment's id.
export function cashuGate(price, label, { lockTo, kind, tags = () => [], owner = async (c) => (await showOf(c)).artist || 'the artist' }) {
  return async (c) => {
    const amount = await price(c);
    const pubkey = await lockTo(c);
    const want = await tags(c);
    if (!pubkey || want.some((t) => t.some((v) => v == null))) {
      return refuse(c, 409, 'not_ready', `Open ${await owner(c)}’s takings page once first.`);
    }
    const token = c.req.headers.get('X-Cashu')?.trim();

    if (!token) {
      const lock = { kind: 'P2PK', data: pubkey, tags: want }; // no tags: the owner's for good
      const pr = new PaymentRequest(undefined, randomHex(8), amount, 'sat', [MINT_URL], await label(c), true, lock);
      log(c, `402 ${amount} sats`);
      return json({ error: 'payment_required', amount, unit: 'sat', mints: [MINT_URL] }, 402,
        { 'X-Cashu': pr.toEncodedCreqA(), 'Access-Control-Expose-Headers': 'X-Cashu' });
    }

    let meta;
    try { meta = getTokenMetadata(token); } catch (e) { return refuse(c, 400, 'bad_token', e.message); }
    if (norm(meta.mint) !== MINT_URL) return refuse(c, 400, 'wrong_mint', `${meta.mint} is not this show's mint`);
    if ((meta.unit || 'sat') !== 'sat') return refuse(c, 400, 'wrong_unit', meta.unit);
    if (Number(meta.amount) < amount) return refuse(c, 400, 'too_little', `${meta.amount} < ${amount} sats`);

    let proofs;
    try { proofs = getDecodedToken(token, await keysetIds()).proofs; } catch (e) {
      return refuse(c, 400, 'unknown_keyset', e.message);
    }
    for (const p of proofs) {
      const why = lockProblem(p.secret, pubkey, want);
      if (why) return refuse(c, 400, why, LOCK[why]);
    }
    if (await one(`SELECT 1 AS x FROM seen WHERE secret IN (${proofs.map(() => '?').join(',')})`, ...proofs.map((p) => p.secret))) {
      return refuse(c, 400, 'reused', 'token already used here');
    }

    // The mint's word that none of it is spent (or mid-spend) yet. Locked to its owner alone, the payer can't
    // spend it after this, so unspent now means the owner's to collect.
    let states;
    try {
      states = await proofStates(proofs);
    } catch (e) {
      const msg = String(e.message || e);
      if (e.status) return refuse(c, 400, 'mint_refused', msg);
      return refuse(c, 502, 'mint_unreachable', msg);
    }
    if (states.some((s) => s !== 'UNSPENT')) return refuse(c, 400, 'reused', 'spent (or being spent) at the mint');

    const sats = Number(sumProofs(proofs));
    const id = await record(token, proofs, sats, kind, pubkey);
    if (!id) return refuse(c, 400, 'reused', 'token already used here');
    log(c, `paid ${sats} sats (${kind})`);
    c.paid = sats;
    c.lockedId = id;
    return null;
  };
}
