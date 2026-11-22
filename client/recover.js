// The 12 words win the gig back (session 54, 22 Nov): when every device is lost, or one is stolen, a gig's 12 words open
// it again in any browser, sign every other browser out of it, take it off every passkey, and give it new 12 words, so
// the old ones (and a stolen browser) open nothing. Checked by the gig itself (server/recover.js).
//
// The words get a key of their own for this job (the global rule: one key per job). The takings key only ever signs
// payments; the key that opens the gig is Ed25519, its 32-byte seed made from the words' own 16 bytes (not the wallet's
// seed, so a browser that has forgotten the words can't make it):
//   seed = HKDF-SHA256(ikm = the words' entropy, salt = none, info = utf8("refueler.nutpub.recover.v1") ‖ 0x00, 32 bytes)
// The gig keeps only the public half. It signs, once, a one-time challenge from the gig, the gig's id and the two keys
// the gig is to lock to next (the new words' takings key and their recovery key). No encryption here, so no nonces.
// Signed with @noble/curves (already in the wallet); checked with WebCrypto. Known answers: test/recover.test.js.
import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { ed25519 } from '@noble/curves/ed25519.js';

export const RECOVER_INFO = 'refueler.nutpub.recover.v1';
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ZERO = Uint8Array.of(0);

// The words' recovery seed and public key (hex, 32 bytes).
export async function recoverSeed(words) {
  const ikm = mnemonicToEntropy(words, wordlist);
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: cat(utf8(RECOVER_INFO), ZERO) }, base, 256));
}
export const recoverPublic = async (words) => hex(ed25519.getPublicKey(await recoverSeed(words)));

// What the words sign: "refueler.nutpub.recover.v1" ‖ 0 ‖ gig id ‖ 0 ‖ challenge ‖ 0 ‖ next recovery key ‖ 0 ‖ next takings key.
// server/recover.js builds the same bytes; the tests check the two agree.
export const recoverMessage = ({ stage, challenge, recoverKey, artistKey }) =>
  cat(utf8(RECOVER_INFO), ZERO, utf8(stage), ZERO, utf8(challenge), ZERO, utf8(recoverKey), ZERO, utf8(artistKey));
export async function signRecover(words, fields) {
  return hex(ed25519.sign(recoverMessage(fields), await recoverSeed(words)));
}

// ---- The page's side: typed words → the gig open in this browser, with new words. Used by the gig's signed-out page
// (stage.html: "Lost every device? Use your 12 words") and Cellar ("Lost or stolen device?"). Returns { found } (sats
// collected before, brought back) or throws with the page's own words.
// This browser keeps: the new setup key; the old takings key (payments already waiting are locked to it, so Move takes
// them); the new words' takings key and the new words, unchecked, so Cellar asks to write them down; a claim code for
// thenutpub.com, so the next passkey adds the gig again.
export async function openWithWords(text, { say = () => {} } = {}) {
  const { checkWords, seedOf, findKey, keyAt, newWords } = await import('./words.js');
  const { openWallet, keepWords, ensureSeed, TAKINGS } = await import('./wallet.js');
  const typed = checkWords(text);
  if (typed.error) throw new Error(typed.error);
  const stage = location.hostname.split('.')[0];
  const [health, show] = await Promise.all([fetch('/api/health').then((r) => r.json()), fetch('/api/show').then((r) => r.json())]);
  say('Checking your words…');
  const wallet = await openWallet(health.mint.url, TAKINGS);
  await ensureSeed(TAKINGS); // this browser's own seed made first, so making it later can't touch the words kept below
  const oldSeed = seedOf(typed.words);
  const at = show.artistKey ? findKey(oldSeed, show.artistKey) : -1;
  const next = newWords();
  const nextKey = keyAt(seedOf(next), 0);
  const fields = { stage, recoverKey: await recoverPublic(next), artistKey: nextKey.publicKeyHex };
  // Both keys go into this browser's keyring first (harmless if the gig says no), so a payment locked to either can't
  // arrive before its key is here.
  if (at >= 0) await wallet.coco.keyring.addKeyPair(keyAt(oldSeed, at).secretKey);
  await wallet.coco.keyring.addKeyPair(nextKey.secretKey);
  const { challenge } = await fetch('/api/passkey/challenge', { method: 'POST' }).then((r) => r.json());
  const sig = await signRecover(typed.words, { ...fields, challenge });
  const r = await fetch('/api/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, challenge, sig }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.detail || (out.error === 'old_challenge' ? 'That took a while: press again.' : 'That didn’t work: try again.'));
  keepWords(next, nextKey.publicKeyHex);
  try {
    localStorage.setItem('nutpub-admin', out.key);
    localStorage.setItem('nutpub-claim', JSON.stringify({ stage, claim: out.claim }));
    sessionStorage.setItem('nutpub-recovered', '1');
  } catch {}
  // Sats the lost browser collected but never moved were made from the old words: brought here first, before anyone else.
  say('Your gig is open. Looking for sats collected before…');
  const before = await wallet.balance();
  await Promise.race([wallet.coco.wallet.sweep(health.mint.url, oldSeed, { units: ['sat'] }).catch(() => {}), new Promise((ok) => setTimeout(ok, 20000))]);
  return { found: Math.max(0, (await wallet.balance()) - before) };
}

// The words' key, put on record with the gig (once; the gig refuses a different one). True once it's on record.
export async function recordWords(words, adminKey) {
  const r = await fetch('/api/admin/recover-key', { method: 'PUT', headers: { 'X-Admin': adminKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ pubkey: await recoverPublic(words) }) }).catch(() => null);
  return !!r?.ok;
}
