// Closing the gig: the night's records go 7 days after it ends; uncollected sats stay. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { useDb, kv, run, one } from '../server/db.js';
import { closeNights } from '../server/closing.js';
import { nextGig } from '../server/shows.js';

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  useDb({ batch: (list) => Promise.all(list.map((st) => st.run())), prepare: (text) => ({ bind: (...args) => {
    const st = db.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => st.run(...args) };
  } }) });
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1' });
});

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-20T23:00:00Z');
const count = async (t) => (await one(`SELECT COUNT(*) AS n FROM ${t}`)).n;
const night = async () => {
  await kv.set('nightStart', '2026-11-01T00:00:00.000Z');
  await run("INSERT INTO tickets (pass, sats, at) VALUES ('p1', 100, '2026-11-02T00:00:00.000Z')");
  await run("INSERT INTO passkeys (id, pass, pubkey, alg, created) VALUES ('k1', 'p1', 'x', -7, '2026-11-02')");
  await run("INSERT INTO messages (at, pass, text) VALUES ('2026-11-20T22:00:00.000Z', 'p1', 'great set')");
  await run("INSERT INTO tips (pass, sats, at) VALUES ('p1', 21, '2026-11-20T22:00:00.000Z')");
  await run("INSERT INTO locked (token, sats, kind, pubkey, at) VALUES ('open', 21, 'tip', 'a', '2026-11-20T22:00:00.000Z')");
  await run("INSERT INTO locked (token, sats, kind, pubkey, at, collected_at, collected_by) VALUES ('taken', 100, 'ticket', 'a', '2026-11-02T00:00:00.000Z', '2026-11-21', 'artist')");
  await kv.set('stage', 'closed');
};

test('a gig still on keeps everything', async () => {
  await night();
  await kv.set('stage', 'on');
  await closeNights(T0 + 30 * DAY);
  assert.equal(await count('tickets'), 1);
  assert.equal(await count('messages'), 1);
  assert.equal(await kv.get('endedAt'), null);
});

test('kept for 7 days after the night ends, then deleted; uncollected sats stay', async () => {
  await night();
  await kv.set('endedAt', new Date(T0).toISOString());
  await closeNights(T0 + 6 * DAY);
  assert.equal(await count('tickets'), 1);
  assert.equal(await count('passkeys'), 1);
  await closeNights(T0 + 7 * DAY + 1);
  for (const t of ['tickets', 'passkeys', 'messages', 'tips']) assert.equal(await count(t), 0, t);
  assert.equal((await one('SELECT token FROM locked')).token, 'open');
  const [gig] = await kv.get('gigs');
  await closeNights(T0 + 9 * DAY);
  assert.equal((await kv.get('gigs')).length, 1); // once per gig
  assert.deepEqual({ room: gig.tickets.room, sats: gig.sats, tips: gig.tips, start: gig.start }, { room: 1, sats: 121, tips: 21, start: '2026-11-01T00:00:00.000Z' });
});

test('a gig whose date has gone gets its 7 days from the first clean-up', async () => {
  await night();
  await closeNights(T0);
  assert.equal(await kv.get('endedAt'), new Date(T0).toISOString());
  await kv.set('stage', 'doors'); // opened again: the clock stops
  await closeNights(T0 + DAY);
  assert.equal(await kv.get('endedAt'), null);
});

test('an earlier night’s chat and tips go 7 days on; tonight’s stay', async () => {
  await kv.set('nightStart', '2026-11-20T00:00:00.000Z');
  await run("INSERT INTO messages (at, pass, text, deleted) VALUES ('2026-11-10T22:00:00.000Z', 'p1', 'last week', 1)");
  await run("INSERT INTO messages (at, pass, text) VALUES ('2026-11-20T09:00:00.000Z', 'p2', 'see you tonight')");
  await run("INSERT INTO tips (pass, sats, at) VALUES ('p1', 21, '2026-11-10T22:00:00.000Z')");
  await closeNights(T0);
  assert.equal((await one('SELECT text FROM messages')).text, 'see you tonight');
  assert.equal(await count('tips'), 0);
});

test('Finish gig keeps the one-line totals first, once, then clears the gig', async () => {
  await night();
  await nextGig();
  const gigs = await kv.get('gigs');
  assert.equal(gigs.length, 1);
  assert.deepEqual({ sats: gigs[0].sats, tickets: gigs[0].tickets.sats, tips: gigs[0].tips, tipsN: gigs[0].tipsN }, { sats: 121, tickets: 100, tips: 21, tipsN: 1 });
  assert.equal(await count('tickets'), 0);
  assert.notEqual(await kv.get('nightStart'), '2026-11-01T00:00:00.000Z');
  assert.equal((await one("SELECT COUNT(*) AS n FROM locked WHERE collected_at IS NULL")).n, 1); // the money stays
  await closeNights(T0 + 30 * DAY);
  assert.equal((await kv.get('gigs')).length, 1); // nothing new: the next gig hasn't happened
});

test('a gig where nothing happened leaves no line', async () => {
  await kv.set('stage', 'closed');
  await nextGig();
  assert.equal(await kv.get('gigs'), null);
});
