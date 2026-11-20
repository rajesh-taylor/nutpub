// The artist's 12 words (client/words.js): BIP-39's official test vectors (the 12-word English ones, from
// github.com/trezor/python-mnemonic vectors.json, passphrase "TREZOR"), the seed checked again by Node's own PBKDF2,
// a frozen known answer for the artist's key, and Coco's own keyring making the same keys from the same words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { initializeCoco, MemoryRepositories } from '@cashu/coco-core';
import { newWords, seedOf, checkWords, keyAt, findKey, twoToCheck } from '../client/words.js';

const hex = (b) => Buffer.from(b).toString('hex');
const unhex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));

const VECTORS = [
  ['00000000000000000000000000000000', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    'xprv9s21ZrQH143K3h3fDYiay8mocZ3afhfULfb5GX8kCBdno77K4HiA15Tg23wpbeF1pLfs1c5SPmYHrEpTuuRhxMwvKDwqdKiGJS9XFKzUsAF'],
  ['7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    '2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6fa457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607',
    'xprv9s21ZrQH143K2gA81bYFHqU68xz1cX2APaSq5tt6MFSLeXnCKV1RVUJt9FWNTbrrryem4ZckN8k4Ls1H6nwdvDTvnV7zEXs2HgPezuVccsq'],
  ['80808080808080808080808080808080', 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
    'd71de856f81a8acc65e6fc851a38d4d7ec216fd0796d0a6827a3ad6ed5511a30fa280f12eb2e47ed2ac03b5c462a0358d18d69fe4f985ec81778c1b370b652a8',
    'xprv9s21ZrQH143K2shfP28KM3nr5Ap1SXjz8gc2rAqqMEynmjt6o1qboCDpxckqXavCwdnYds6yBHZGKHv7ef2eTXy461PXUjBFQg6PrwY4Gzq'],
  ['ffffffffffffffffffffffffffffffff', 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
    'ac27495480225222079d7be181583751e86f571027b0497b5b5d11218e0a8a13332572917f0f8e5a589620c6f15b11c61dee327651a14c34e18231052e48c069',
    'xprv9s21ZrQH143K2V4oox4M8Zmhi2Fjx5XK4Lf7GKRvPSgydU3mjZuKGCTg7UPiBUD7ydVPvSLtg9hjp7MQTYsW67rZHAXeccqYqrsx8LcXnyd'],
];

test('BIP-39 official vectors: entropy to words, words to seed, seed to master key', () => {
  for (const [entropy, words, seed, xprv] of VECTORS) {
    assert.equal(entropyToMnemonic(unhex(entropy), wordlist), words);
    assert.equal(hex(mnemonicToSeedSync(words, 'TREZOR')), seed);
    assert.equal(HDKey.fromMasterSeed(unhex(seed)).privateExtendedKey, xprv);
    assert.equal(checkWords(words).words, words);
  }
});

test('the seed is plain BIP-39 with no passphrase (checked by Node’s own PBKDF2)', () => {
  for (const [, words] of VECTORS) {
    const node = pbkdf2Sync(Buffer.from(words.normalize('NFKD')), Buffer.from('mnemonic'), 2048, 64, 'sha512');
    assert.equal(hex(seedOf(words)), node.toString('hex'));
  }
});

test('the artist’s key from the words: a frozen known answer', () => {
  const seed = seedOf(VECTORS[0][1]);
  const k0 = keyAt(seed, 0);
  assert.equal(k0.publicKeyHex, KAT0);
  assert.equal(keyAt(seed, 1).publicKeyHex, KAT1);
  assert.equal(findKey(seed, KAT1), 1);
  assert.equal(findKey(seedOf(VECTORS[1][1]), KAT0), -1, 'words for another stage find nothing');
});

test('Coco makes the same keys from the same words, so the words bring back what Takings locked to', async () => {
  const words = newWords();
  assert.equal(words.split(' ').length, 12);
  const seed = seedOf(words);
  const coco = await initializeCoco({ repo: new MemoryRepositories(), seedGetter: async () => seed });
  const made = [];
  for (let i = 0; i < 3; i++) made.push((await coco.keyring.generateKeyPair()).publicKeyHex);
  made.forEach((pub, i) => {
    assert.equal(keyAt(seed, i).publicKeyHex, pub);
    assert.equal(findKey(seed, pub), i);
  });
  // A new browser: the same words, an empty keyring; Coco's next keys are the same, in the same order.
  const again = await initializeCoco({ repo: new MemoryRepositories(), seedGetter: async () => seedOf(checkWords(words.toUpperCase().replace(/ /g, '  ')).words) });
  assert.equal((await again.keyring.generateKeyPair()).publicKeyHex, made[0]);
  // A browser with keys of its own takes the key as it is.
  const other = await initializeCoco({ repo: new MemoryRepositories(), seedGetter: async () => seedOf(newWords()) });
  await other.keyring.generateKeyPair();
  await other.keyring.addKeyPair(keyAt(seed, 2).secretKey);
  assert.ok(await other.keyring.getKeyPair(made[2]));
  for (const c of [coco, again, other]) await c.dispose(); // Coco's watchers keep a test running otherwise
});

test('typed words: the page’s own error lines', () => {
  const [, words] = VECTORS[1];
  assert.equal(checkWords(words.split(' ').slice(0, 11).join(' ')).error, "That's 11 words: it needs 12.");
  assert.equal(checkWords(words.replace('winner', 'winnar')).error, '“winnar” isn\'t one of the words: check its spelling.');
  assert.equal(checkWords(words.replace('yellow', 'year')).error, 'One of the words is wrong: check them against your paper.');
  assert.equal(checkWords(`  ${words.toUpperCase().replace(/ /g, ',\n')} `).words, words);
});

test('two different words to check, in order', () => {
  for (let i = 0; i < 200; i++) {
    const [a, b] = twoToCheck();
    assert.ok(a >= 1 && b <= 12 && a < b);
  }
});

const KAT0 = '02d5e349add0f7c450d20e0968ecdb9e5e4b64ceecfd1a5c8c90664b482ab37649'; // 'abandon … about', key 0
const KAT1 = '027db85d2a01d197b59a906526300d675f9b46700106282ee55b2a414f25a7e618'; // key 1
