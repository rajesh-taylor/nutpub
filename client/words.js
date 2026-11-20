// The artist's 12 words (session 42, 20 Nov): the backup of the key Takings uses. New stages make the words first
// (BIP-39, 128 bits, English list, no passphrase, as Bitcoin and Cashu wallets do) and the wallet's 64-byte seed from
// them, so the same words bring the key back on another browser. The key comes from the seed by Coco's own path
// for P2PK keys, m/129373'/10'/0'/0'/i, so nothing about how payments are locked changes. The words never leave the
// browser: the server only knows the public key.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { schnorr } from '@noble/curves/secp256k1.js';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export const newWords = () => generateMnemonic(wordlist, 128);
export const seedOf = (words) => mnemonicToSeedSync(words);

// Typed words, tidied: lower case, single spaces. { words } or { error } in the page's own words.
export function checkWords(text) {
  const list = String(text || '').toLowerCase().normalize('NFKD').split(/[^a-z]+/).filter(Boolean);
  if (list.length !== 12) return { error: `That's ${list.length} word${list.length === 1 ? '' : 's'}: it needs 12.` };
  const odd = list.find((w) => !wordlist.includes(w));
  if (odd) return { error: `“${odd}” isn't one of the words: check its spelling.` };
  const words = list.join(' ');
  if (!validateMnemonic(words, wordlist)) return { error: 'One of the words is wrong: check them against your paper.' };
  return { words };
}

// The i-th P2PK key from a seed, as Coco's keyring makes it (KeyRingService: x-only key with 02 in front).
export function keyAt(seed, i) {
  const { privateKey } = HDKey.fromMasterSeed(seed).derive(`m/129373'/10'/0'/0'/${i}`);
  return { secretKey: privateKey, publicKeyHex: '02' + hex(schnorr.getPublicKey(privateKey)) };
}

// Which of the first `max` keys is the stage's: -1 if none (words for another stage).
export function findKey(seed, pubkey, max = 20) {
  const root = HDKey.fromMasterSeed(seed);
  for (let i = 0; i < max; i++) {
    const { privateKey } = root.derive(`m/129373'/10'/0'/0'/${i}`);
    if ('02' + hex(schnorr.getPublicKey(privateKey)) === pubkey) return i;
  }
  return -1;
}

// Two different word numbers (1 to 12) for the check, in order.
export function twoToCheck() {
  const [a, b] = crypto.getRandomValues(new Uint32Array(2));
  const first = a % 12;
  const second = (first + 1 + (b % 11)) % 12;
  return [first, second].sort((x, y) => x - y).map((i) => i + 1);
}
