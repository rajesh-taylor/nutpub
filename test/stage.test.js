// A stage per artist: each stage's SQLite (a Durable Object's, here node's own SQLite in its place) answers as D1 does,
// two stages never see each other's rows, and only <id>.thenutpub.com is a stage. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { sqliteStage, withStage, useDb, kv, one, run, sql, batch, adminKey, siteUrl } from '../server/db.js';
import { makeHandoff, takeHandoff } from '../server/handoff.js';
import { stageIdOf, newStageId, STAGE_ID } from '../server/stages.js';

// What a Durable Object's ctx.storage offers, on node's SQLite: sql.exec (one statement with bindings, or several
// without) giving a cursor, and transactionSync.
function fakeStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    sql: { exec: (text, ...args) => {
      if (!args.length && text.trim().replace(/;\s*$/, '').includes(';')) { db.exec(text); return { toArray: () => [] }; }
      const st = db.prepare(text);
      const rows = st.columns().length ? st.all(...args) : (st.run(...args), []);
      return { toArray: () => rows.map((r) => ({ ...r })) };
    } },
    transactionSync: (fn) => {
      db.exec('BEGIN');
      try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const schema = readFileSync('schema.sql', 'utf8');
const makeStage = (id, key) => {
  const storage = fakeStorage();
  storage.sql.exec(schema);
  return sqliteStage(storage, { id, adminKey: key });
};

let a; let b;
beforeEach(() => {
  configure({ MINT_URL: 'https://mint.test', SITE_URL: 'https://thenutpub.com', ADMIN_KEY: 'longys-key' });
  useDb(null); // nothing outside a stage
  a = makeStage('k3f9x2', 'key-a');
  b = makeStage('p7q2m4', 'key-b');
});

test('a stage answers as D1 does: first, all, run, kv', async () => {
  await withStage(a, async () => {
    assert.equal(await one('SELECT value FROM kv WHERE key = ?', 'nope'), null);
    await kv.set('gigs', [{ sats: 21 }]);
    assert.deepEqual(await kv.get('gigs'), [{ sats: 21 }]);
    const r = await run('INSERT INTO mods (name, key_hash, created) VALUES (?, ?, ?)', 'Ann', 'h1', 'now');
    assert.equal(r.meta.last_row_id, 1);
    assert.equal(r.meta.changes, 1);
    assert.equal((await run("INSERT OR IGNORE INTO challenges (value, at) VALUES ('c', 1)")).meta.changes, 1);
    assert.equal((await run("INSERT OR IGNORE INTO challenges (value, at) VALUES ('c', 2)")).meta.changes, 0);
    const [first] = await batch([sql('INSERT INTO locked (token, sats, kind, pubkey, at) VALUES (?, ?, ?, ?, ?) RETURNING id', 't', 5, 'tip', 'pk', 'now')]);
    assert.equal(first.results[0].id, 1);
    assert.equal(await one('SELECT COUNT(*) AS n FROM locked WHERE kind = ?', 'tip').then((x) => x.n), 1);
  });
});

test('a batch is all or nothing', async () => {
  await withStage(a, async () => {
    await assert.rejects(batch([sql("INSERT INTO seen (secret, at) VALUES ('s1', 'now')"), sql("INSERT INTO seen (secret, at) VALUES ('s1', 'again')")]));
    assert.equal((await one('SELECT COUNT(*) AS n FROM seen')).n, 0);
  });
});

test('two stages at once never see each other’s rows', async () => {
  const write = (s, n) => withStage(s, async () => {
    for (let i = 0; i < n; i++) { await kv.set(`k${i}`, s.id); await new Promise((r) => setTimeout(r, 1)); }
    return (await one("SELECT COUNT(*) AS n FROM kv WHERE value = ?", JSON.stringify(s.id))).n;
  });
  const [na, nb] = await Promise.all([write(a, 5), write(b, 3)]);
  assert.equal(na, 5);
  assert.equal(nb, 3);
  await withStage(b, async () => assert.equal(await kv.get('k4'), null));
});

test('each stage signs in with its own key, never Longy’s', async () => {
  const code = await withStage(a, () => makeHandoff());
  assert.equal(await withStage(b, () => takeHandoff(code)), null); // another stage's code opens nothing
  assert.equal(await withStage(a, () => takeHandoff(code)), 'key-a');
  assert.equal(await withStage(b, () => adminKey()), 'key-b');
  assert.equal(await withStage(makeStage('z9z9z9', ''), () => adminKey()), ''); // no key: nobody's admin
});

test('each stage’s links carry its own address', async () => {
  const c = { url: new URL('https://k3f9x2.thenutpub.com/setup') };
  assert.equal(await withStage(a, () => siteUrl(c)), 'https://k3f9x2.thenutpub.com');
});

test('only <id>.thenutpub.com is a stage', () => {
  assert.equal(stageIdOf('k3f9x2.thenutpub.com'), 'k3f9x2');
  assert.equal(stageIdOf('k3f9x2.localhost'), 'k3f9x2');
  for (const host of ['thenutpub.com', 'www.thenutpub.com', 'stream.thenutpub.com', 'k3f9x2.evil.com', 'a.k3f9x2.thenutpub.com', 'K3F9X2.thenutpub.com', '3k3f9x.thenutpub.com']) {
    assert.equal(stageIdOf(host), null, host);
  }
  for (let i = 0; i < 200; i++) assert.match(newStageId(), STAGE_ID);
});
