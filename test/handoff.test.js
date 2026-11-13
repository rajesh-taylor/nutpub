// Sign in on your phone: the QR's code works once, for 5 minutes, and only the newest one. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { useDb } from '../server/db.js';
import { makeHandoff, takeHandoff, HANDOFF_MS } from '../server/handoff.js';

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  useDb({ batch: (list) => Promise.all(list.map((st) => st.run())), prepare: (text) => ({ bind: (...args) => {
    const st = db.prepare(text);
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => st.run(...args) };
  } }) });
  configure({ MINT_URL: 'https://mint.test', ADMIN_KEY: 'the-key' });
});

const T0 = Date.parse('2026-11-13T15:00:00Z');

test('the code gives the key once', async () => {
  const code = await makeHandoff(T0);
  assert.equal(await takeHandoff(code, T0 + 1000), 'the-key');
  assert.equal(await takeHandoff(code, T0 + 2000), null);
});

test('after 5 minutes the code opens nothing', async () => {
  const code = await makeHandoff(T0);
  assert.equal(await takeHandoff(code, T0 + HANDOFF_MS + 1), null);
});

test('a wrong code opens nothing and leaves the right one working', async () => {
  const code = await makeHandoff(T0);
  assert.equal(await takeHandoff('0'.repeat(32), T0), null);
  assert.equal(await takeHandoff('not hex', T0), null);
  assert.equal(await takeHandoff(code, T0), 'the-key');
});

test('a new QR replaces the old one', async () => {
  const first = await makeHandoff(T0);
  const second = await makeHandoff(T0);
  assert.equal(await takeHandoff(first, T0), null);
  assert.equal(await takeHandoff(second, T0), 'the-key');
});
