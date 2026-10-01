// The free pint: 21 sats locked (NUT-11 P2PK) to the bar's key, locktime = last orders, refund = the house.
// Whoever scans it at the bar pours it; the bar's key signs and the house swaps it. It only pours once.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  P2PKBuilder, createRandomSecretKey, getPubKeyFromPrivKey, getDecodedToken, getTokenMetadata, parseP2PKSecret,
} from '@cashu/cashu-ts';
import { KITTY_URL } from './config.js';
import { kitty, kittyKeysetIds, give, take } from './house.js';
import { show } from './show.js';

const hex = (b) => Buffer.from(b).toString('hex');
const KEYS = fileURLToPath(new URL('../data/keys.json', import.meta.url));

// Tonight's keys: the bar's (pours pints) and the house's (gets unclaimed pints back after last orders).
function loadKeys() {
  try { return JSON.parse(readFileSync(KEYS, 'utf8')); } catch {}
  const make = () => { const sk = createRandomSecretKey(); return { sk: hex(sk), pk: hex(getPubKeyFromPrivKey(sk)) }; };
  const keys = { bar: make(), house: make() };
  writeFileSync(KEYS, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}
export const keys = loadKeys();
// Longy's key for tonight (our server signs for him: the takings screen is a private link, not a login).
if (!keys.artist) {
  const sk = createRandomSecretKey();
  keys.artist = { sk: hex(sk), pk: hex(getPubKeyFromPrivKey(sk)) };
  writeFileSync(KEYS, JSON.stringify(keys), { mode: 0o600 });
}

export const PINT = 21;
// Last orders: LAST_ORDERS_MIN after curtains up (before curtains, counted from now). Unix seconds.
const LAST_ORDERS_MIN = Number(process.env.LAST_ORDERS_MIN || 4);
export const lastOrdersAt = () =>
  Math.floor((show.t0 ?? Date.now() + 60_000) / 1000) + LAST_ORDERS_MIN * 60;

export function pintLock() {
  return new P2PKBuilder()
    .addLockPubkey(keys.bar.pk)
    .lockUntil(lastOrdersAt())
    .addRefundPubkey(keys.house.pk)
    .toOptions();
}

export const lastPint = { token: null }; // for testing the bar without a camera (admin only)
const issued = new Set(); // pass ids that already have their free pint
export async function freePint(passId) {
  if (issued.has(passId)) throw Object.assign(new Error('one free pint per phone'), { code: 'already_given' });
  issued.add(passId);
  try {
    return (lastPint.token = await give(PINT, pintLock()));
  } catch (e) {
    issued.delete(passId);
    throw e;
  }
}
export const resetPints = () => issued.clear();

// The bar pours: check it really is a pint for this bar, then sign with the bar's key and swap.
export async function pour(token) {
  const meta = getTokenMetadata(token);
  if (meta.mint.replace(/\/+$/, '') !== KITTY_URL) throw Object.assign(new Error('not NutPub Mint ecash'), { code: 'wrong_mint' });
  const { proofs } = getDecodedToken(token, kittyKeysetIds);
  for (const p of proofs) {
    let s;
    try { s = parseP2PKSecret(p.secret); } catch {}
    const lockedTo = s?.[1]?.data?.toLowerCase();
    if (!lockedTo || lockedTo !== keys.bar.pk) throw Object.assign(new Error('not a pint for this bar'), { code: 'not_a_pint' });
  }
  try {
    await take(proofs, keys.bar.sk);
  } catch (e) {
    if (/spent/i.test(String(e.message))) throw Object.assign(new Error('already poured'), { code: 'already_poured' });
    throw e;
  }
  return { poured: Number(meta.amount) };
}
