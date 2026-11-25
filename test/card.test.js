// Card tips with words (session 62b): the chat's new pence column reaches databases made before it, a card tip's line
// goes in the chat with its pounds (words or none), and Finish gig's line keeps the card money. Nothing here calls
// Stripe. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { useDb, d1Stage, addColumns, kv, run, one, all } from '../server/db.js';
import { addMessage } from '../server/door.js';
import { keepGigLine } from '../server/closing.js';
import { clearGig } from '../server/shows.js';
import { cardState, tipPence, fee, fees, stripeOn } from '../server/stripe.js';

let db;
const asD1 = (d) => ({ batch: (list) => Promise.all(list.map((st) => st.run())), prepare: (text) => {
  const bound = (...args) => {
    const st = d.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: { ...st.run(...args) } }) };
  };
  return { bind: bound, ...bound() };
} });
const meta = (r) => ({ meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } });
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  useDb({ batch: (list) => Promise.all(list.map((st) => st.run())), prepare: (text) => ({ bind: (...args) => {
    const st = db.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => meta(st.run(...args)) };
  } }) });
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1' }); // no Stripe keys: nothing asks Stripe
});

test('the pence column is added once to a chat made before it', async () => {
  const old = new DatabaseSync(':memory:');
  old.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, at TEXT NOT NULL, pass TEXT, sats INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, mod TEXT, mod_icon TEXT, nostr TEXT)');
  old.exec("INSERT INTO messages (at, pass, text) VALUES ('2026-11-20', 'p1', 'before')");
  const st = d1Stage(asD1(old));
  await addColumns(st);
  await addColumns(st); // a second Worker start: nothing to add
  const cols = old.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  assert.equal(cols.filter((c) => c === 'pence').length, 1);
  assert.equal(old.prepare('SELECT pence FROM messages').get().pence, 0);
});

test('a card tip goes in the chat with its pounds, with words or none', async () => {
  const withWords = await addMessage('p1', 'Great set!', 0, null, null, 500);
  const without = await addMessage('p1', '', 0, null, null, 1000);
  assert.ok(withWords && without);
  assert.equal(await addMessage('p1', '', 0, null, null, 0), null); // no words, no money: no line
  assert.deepEqual((await all('SELECT sats, pence, text FROM messages ORDER BY id')).map((r) => ({ ...r })), [
    { sats: 0, pence: 500, text: 'Great set!' }, { sats: 0, pence: 1000, text: '' }]);
});

test('Finish gig keeps the card money in the gig line, and clears the words waiting for Stripe', async () => {
  await kv.set('nightStart', '2026-11-25T00:00:00.000Z');
  await kv.set('cardTips', [
    { id: 'pi_a', pence: 500, fee: 25, stripeFee: 36, net: 439 },
    { id: 'pi_b', pence: 1000, fee: 50, stripeFee: 22, net: 928 },
  ]);
  await kv.set('cardSaid:pi_c', { pass: 'p1', text: 'never paid' });
  await clearGig();
  const [gig] = await kv.get('gigs');
  assert.equal(gig.sats, 0);
  assert.deepEqual(gig.card, { count: 2, pence: 1500, nutpub: 75, stripeFee: 58, net: 1367 });
  assert.equal(await one("SELECT key FROM kv WHERE key LIKE 'cardSaid:%'"), null);
  assert.equal(await kv.get('cardTips'), null);
});

test('a gig with no card tips keeps its line as before', async () => {
  await kv.set('nightStart', '2026-11-25T00:00:00.000Z');
  await run("INSERT INTO locked (token, sats, kind, pubkey, at) VALUES ('t', 21, 'tip', 'a', '2026-11-25T20:00:00.000Z')");
  const line = await keepGigLine();
  assert.equal(line.sats, 21);
  assert.equal('card' in line, false);
});

// The card code's plain parts (session 62c): nothing here calls Stripe.
test("Cellar reads where the artist's Stripe account stands", () => {
  const acct = (status, due = false) => ({ configuration: { merchant: { capabilities: { card_payments: status && { status } } } },
    requirements: { entries: due ? [{ awaiting_action_from: 'user' }] : [] } });
  assert.equal(cardState(acct('active')), 'on');
  assert.equal(cardState(acct('active', true)), 'on'); // cards already taken: on, whatever Stripe asks next
  assert.equal(cardState(acct('pending')), 'checking'); // Stripe looking at the details (it lags 15 s or more)
  assert.equal(cardState(acct('pending', true)), 'unfinished'); // the artist still has pages to fill in
  assert.equal(cardState(acct('restricted')), 'unfinished');
  assert.equal(cardState(acct(null)), 'unfinished'); // no card payments asked for yet
  assert.equal(cardState(null), 'unfinished');
});

test('a card tip is £1 to £100, in whole pence', () => {
  assert.equal(tipPence(100), 100);
  assert.equal(tipPence(500), 500);
  assert.equal(tipPence(10000), 10000);
  for (const bad of [99, 10001, 0, -500, 250.5, '500', null, undefined, NaN, Infinity]) assert.equal(tipPence(bad), null, String(bad));
});

test("the NutPub's 5% of a card tip, rounded to the penny", () => {
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1', FEE_PERCENT: '5' });
  assert.equal(fee(500), 25); // £5 → 25p, as in session 62's premise
  assert.equal(fee(1000), 50);
  assert.equal(fee(110), 6); // 5.5p rounds up
  assert.equal(fee(130), 7); // 6.5p rounds up
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1', FEE_PERCENT: '0' });
  assert.equal(fee(500), 0); // the rate is changeable: none taken at 0
});

test("Stripe's fee and what it pays the artist, from Stripe's own record of the charge", () => {
  // Session 62's premise: £5, Stripe's fee 36p, the NutPub's 25p application fee, £4.39 to the artist.
  const pi = { latest_charge: { balance_transaction: { net: 439, fee: 61, fee_details: [
    { type: 'stripe_fee', amount: 36 }, { type: 'application_fee', amount: 25 }] } } };
  assert.deepEqual(fees(pi), { stripeFee: 36, net: 439 }); // the NutPub's share isn't Stripe's fee
  const split = { latest_charge: { balance_transaction: { net: 900, fee_details: [{ type: 'stripe_fee', amount: 20 }, { type: 'stripe_fee', amount: 5 }] } } };
  assert.deepEqual(fees(split), { stripeFee: 25, net: 900 });
  assert.deepEqual(fees({ latest_charge: { balance_transaction: 'txn_123' } }), {}); // not expanded: asked again later
  assert.deepEqual(fees({ latest_charge: null }), {}); // not settled yet
  assert.deepEqual(fees({}), {});
});

test('cards stay off without both keys, and with a live key', () => {
  const keys = (sk, pk) => configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1', STRIPE_SECRET_KEY: sk, STRIPE_PUBLISHABLE_KEY: pk });
  keys('sk_test_x', 'pk_test_x'); assert.equal(stripeOn(), true);
  keys('rk_test_x', 'pk_test_x'); assert.equal(stripeOn(), true); // a restricted test key works too
  keys('sk_test_x', undefined); assert.equal(stripeOn(), false); // tonight's deploy: no secrets, no cards
  keys(undefined, undefined); assert.equal(stripeOn(), false);
  keys('sk_live_x', 'pk_live_x'); assert.equal(stripeOn(), false); // test mode only
  keys('sk_test_x', 'pk_live_x'); assert.equal(stripeOn(), false);
  keys(undefined, undefined);
});
