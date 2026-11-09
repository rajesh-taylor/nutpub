// The live picture's seats and how often pages ask. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { useDb, kv, run } from '../server/db.js';
import { takeSeat, VIEWER_LIMIT } from '../server/live.js';
import { pollEvery, saveShow, currentShow } from '../server/shows.js';

// D1's few calls, over an in-memory SQLite with the real tables.
beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  useDb({ batch: (list) => Promise.all(list.map((st) => st.run())), prepare: (text) => ({ bind: (...args) => {
    const st = db.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => st.run(...args) };
  } }) });
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '1' });
});

const asks = (pass, screen, start) => ({ pass, req: { headers: new Headers({ 'X-Screen': screen }) }, url: new URL(`https://x/api/live/token${start ? '?start=1' : ''}`) });
const FREE = { stream: { mode: 'free' } };
const PAY = { stream: { mode: 'pay' } };
const error = async (res) => (res ? (await res.json()).error : null);
const fill = async (show, n) => { for (let i = 0; i < n; i += 1) assert.equal(await takeSeat(asks(`p${i}`, 'a'), show, false), null); };

test('the viewer past the limit is told; those watching are not', async () => {
  await fill(FREE, VIEWER_LIMIT);
  assert.equal(await error(await takeSeat(asks('late', 'a'), FREE, false)), 'full');
  assert.equal(await takeSeat(asks('p0', 'a'), FREE, false), null);
});

test('a seat left empty frees up', async () => {
  await fill(FREE, VIEWER_LIMIT);
  await run('UPDATE watchers SET until = 1 WHERE pass = ?', 'p0');
  assert.equal(await takeSeat(asks('late', 'a'), FREE, false), null);
});

test('paid watching counts on the test mint, not on a real one', async () => {
  await fill(PAY, VIEWER_LIMIT);
  assert.equal(await error(await takeSeat(asks('late', 'a'), PAY, false)), 'full');
  configure({ MINT_URL: 'https://mint.test', MINT_TEST: '0' });
  assert.equal(await takeSeat(asks('late', 'a'), PAY, false), null);
});

test('one screen per ticket: the newest takes over', async () => {
  const show = { stream: { mode: 'ticket' } };
  assert.equal(await takeSeat(asks('t', 'phone', true), show, true), null);
  assert.equal(await takeSeat(asks('t', 'phone'), show, true), null);
  assert.equal(await takeSeat(asks('t', 'laptop', true), show, true), null);
  assert.equal(await error(await takeSeat(asks('t', 'phone'), show, true)), 'moved');
  assert.equal(await takeSeat(asks('t', 'laptop'), show, true), null);
});

test('a free stream stops three hours after its first viewer', async () => {
  assert.equal(await takeSeat(asks('a', 'a'), FREE, false), null);
  await kv.set('freeFrom', Math.floor(Date.now() / 1000) - 3 * 3600 - 1);
  assert.equal(await error(await takeSeat(asks('a', 'a'), FREE, false)), 'free_over');
});

test('how often pages ask', () => {
  const at = Date.parse('2026-11-20T21:00:00Z');
  assert.equal(pollEvery({ date: '2026-12-25' }, at), 60);            // weeks ahead
  assert.equal(pollEvery({ date: '' }, at), 60);
  assert.equal(pollEvery({ date: '2026-11-20' }, at), 2);             // gig day
  assert.equal(pollEvery({ date: '2026-11-20' }, Date.parse('2026-11-21T05:00:00Z')), 2); // the small hours after
  assert.equal(pollEvery({ date: '2026-11-20' }, Date.parse('2026-11-21T07:00:00Z')), 60);
  assert.equal(pollEvery({ date: '2026-12-25', live: true }, at), 2);  // on air
  assert.equal(pollEvery({ date: '2026-12-25', stageAt: new Date(at - 60_000).toISOString() }, at), 2); // rehearsal
  assert.equal(pollEvery({ date: '2026-12-25', stageAt: new Date(at - 31 * 60_000).toISOString() }, at), 60);
});

test('a new date clears a finished gig, and only a finished one', async () => {
  const later = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  await saveShow({ artist: 'A', date: later(10) });
  await run("INSERT INTO tickets (pass, sats, at) VALUES ('t', 1, 'x')");
  await saveShow({ artist: 'A', date: later(20) }); // postponed
  assert.equal((await currentShow()).show.date, later(20));
  assert.ok(await kv.get('stage') !== 'closed');
  const { one } = await import('../server/db.js');
  assert.equal((await one('SELECT COUNT(*) AS n FROM tickets')).n, 1);
  await kv.set('stage', 'closed');
  await saveShow({ artist: 'B', date: later(30) }); // the next gig
  assert.equal((await one('SELECT COUNT(*) AS n FROM tickets')).n, 0);
  assert.equal(await kv.get('stage'), 'doors');
  assert.equal((await currentShow()).show.artist, 'B'); // the lock has gone with the tickets
});
