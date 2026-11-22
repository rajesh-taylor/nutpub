// The artist's passkey (session 53): one passkey on thenutpub.com opens every stage it starts. A link code kept in the
// browser adds the stage it starts, and nothing else; a claim code lets a passkey made later add a stage started
// before it; Back to your gigs lists only this passkey's open stages; closing a stage takes it off. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { useDb } from '../server/db.js';
import { b64u } from '../server/passkey.js';
import { mountStageDoor, closeOldStages, makeRoom, newAddCode, tidyAddCode } from '../server/stages.js';

const utf8 = new TextEncoder();
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
const rawToDer = (raw) => {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = cat([0], b); return cat([0x02, b.length], b); };
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return cat([0x30, body.length], body);
};
// A phone's password manager, ES256, for thenutpub.com.
async function phone() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const credId = crypto.getRandomValues(new Uint8Array(20));
  const publicKey = b64u.enc(await crypto.subtle.exportKey('spki', keys.publicKey));
  const auth = async (withId) => {
    const head = cat(await sha256(utf8.encode('thenutpub.com')), [0x01 | 0x04 | 0x08 | 0x10 | (withId ? 0x40 : 0)], [0, 0, 0, 0]);
    return withId ? cat(head, new Uint8Array(16), [0, credId.length], credId, [0xa0]) : head;
  };
  const cd = (type, challenge) => b64u.enc(utf8.encode(JSON.stringify({ type, challenge, origin: 'https://thenutpub.com', crossOrigin: false })));
  return {
    id: b64u.enc(credId),
    create: async (challenge) => ({ challenge, id: b64u.enc(credId), alg: -7, publicKey, clientDataJSON: cd('webauthn.create', challenge), authenticatorData: b64u.enc(await auth(true)) }),
    get: async (challenge) => {
      const ad = await auth(false);
      const c = cd('webauthn.get', challenge);
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, cat(ad, await sha256(b64u.dec(c)))));
      return { challenge, id: b64u.enc(credId), clientDataJSON: c, authenticatorData: b64u.enc(ad), signature: b64u.enc(rawToDer(sig)) };
    },
  };
}

// D1 on node's SQLite (first/all/run/batch), and stages that answer as the Durable Object does.
let db; let env; let told; let call;
function d1() {
  const statement = (text, args = []) => {
    const st = () => db.prepare(text);
    return {
      text, args, bind: (...a) => statement(text, a),
      first: async () => st().get(...args) ?? null,
      all: async () => ({ results: st().all(...args) }),
      run: async () => { const r = st().run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
  };
  return { prepare: (text) => statement(text), batch: async (list) => { db.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
const stubs = new Map();
const stub = (id) => {
  if (!stubs.has(id)) stubs.set(id, {
    shut: async () => {}, setup: async () => `code-${id}`, passkey: async (name) => { told.push([id, name]); },
    welcome: async () => ({ gig: 'longy', artist: 'Longy', venue: 'Peggy Sue’s Music Bar', state: 'soon', code: 'c'.repeat(32) }),
  });
  return stubs.get(id);
};
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('schema.sql', 'utf8'));
  const D1 = d1();
  env = { DB: D1, STAGES: { idFromName: (id) => id, get: (id) => stub(id) } };
  useDb(D1);
  told = [];
  stubs.clear();
  const table = {};
  mountStageDoor((method, path, ...steps) => { table[`${method} ${path}`] = async (c) => { for (const s of steps) { const r = await s(c); if (r) return r; } }; });
  call = async (method, path, data, headers = {}) => {
    const req = new Request(`https://thenutpub.com${path}`, { method, headers: { Origin: 'https://thenutpub.com', ...headers }, body: data ? JSON.stringify(data) : undefined });
    const res = await table[`${method} ${path}`]({ req, url: new URL(req.url), params: {}, env });
    return { status: res.status, ...(await res.json()) };
  };
});
const { makeChallenge } = await import('../server/passkey.js');
const judge = (gig, link) => call('POST', '/api/stages/judge', { gig }, link ? { 'X-Artist-Link': link } : {});
const make = async (p, claims = []) => call('POST', '/api/artist', { ...(await p.create(await makeChallenge())), name: 'My NutPub gigs · 22 Nov', claims });
const back = async (p) => call('POST', '/api/stages/back', await p.get(await makeChallenge()));
const opens = (key) => db.prepare('SELECT stage FROM key_stages WHERE key = ? ORDER BY stage').all(key).map((r) => r.stage);

test('a link code adds the stage this browser starts to its passkey', async () => {
  const p = await phone();
  const made = await make(p);
  assert.equal(made.status, 200);
  assert.match(made.link, /^[0-9a-f]{32}$/);
  assert.equal(made.name, 'My NutPub gigs · 22 Nov');
  const g = await judge('longy', made.link);
  assert.equal(g.linked, true);
  assert.equal(g.claim, undefined);
  assert.deepEqual(opens(p.id), [g.stage]);
  assert.deepEqual(told, [[g.stage, 'My NutPub gigs · 22 Nov']]); // Cellar can say so
  // The server keeps the link's SHA-256, never the link.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_links WHERE hash = ?').get(made.link).n, 0);
});

test('a wrong or old link adds nothing, and the stage is still made', async () => {
  const p = await phone();
  await make(p);
  for (const link of ['0'.repeat(32), 'not-a-link']) {
    const g = await judge('frankie', link);
    assert.equal(g.status, 200);
    assert.equal(g.linked, false);
    assert.equal(g.link, 'unknown'); // the page forgets it
    assert.match(g.claim, /^[0-9a-f]{32}$/);
  }
  assert.deepEqual(opens(p.id), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stages').get().n, 2);
});

test('made later, the passkey adds the stages this browser started, only with their claim codes', async () => {
  const a = await judge('longy');
  const b = await judge('frankie');
  const other = await judge('pickle'); // someone else's stage: its id is public, its claim isn't
  const p = await phone();
  const made = await make(p, [{ stage: a.stage, claim: a.claim }, { stage: b.stage, claim: b.claim }, { stage: other.stage, claim: '1'.repeat(32) }]);
  assert.deepEqual(made.linked, [a.stage, b.stage]);
  assert.deepEqual(opens(p.id), [a.stage, b.stage].sort());
  // A claim is spent once used: a second passkey can't take the same stages.
  const q = await phone();
  assert.deepEqual((await make(q, [{ stage: a.stage, claim: a.claim }])).linked, []);
  // The other stage's own claim still works for its own browser.
  assert.deepEqual((await make(q, [{ stage: other.stage, claim: other.claim }])).linked, [other.stage]);
});

test('Back to your gigs lists only this passkey’s open stages, newest first, and gives this browser a link', async () => {
  const p = await phone();
  const { link } = await make(p);
  const a = await judge('longy', link);
  db.prepare("UPDATE stages SET created = '2026-11-22T10:00:00Z' WHERE id = ?").run(a.stage);
  const b = await judge('frankie', link);
  db.prepare("UPDATE stages SET created = '2026-11-22T11:00:00Z' WHERE id = ?").run(b.stage);
  const q = await phone();
  const { link: theirs } = await make(q);
  await judge('pickle', theirs); // another artist's
  const r = await back(p);
  assert.equal(r.status, 200);
  assert.deepEqual(r.stages.map((s) => s.stage), [b.stage, a.stage]);
  assert.match(r.stages[0].url, new RegExp(`^https://${b.stage}\\.thenutpub\\.com/#h=c{32}$`));
  assert.deepEqual(Object.keys(r.stages[0]).sort(), ['artist', 'gig', 'stage', 'state', 'url', 'venue']);
  assert.match(r.link, /^[0-9a-f]{32}$/);
  assert.notEqual(r.link, link);
  // Both browsers' links still add stages.
  assert.equal((await judge('pickle', link)).linked, true);
  assert.equal((await judge('pickle', r.link)).linked, true);
  // An unknown passkey: plainly not an artist's.
  const z = await back(await phone());
  assert.equal(z.status, 404);
  assert.equal(z.error, 'no_stage');
});

test('a closed stage drops off: closing and making room clear its links and claims', async () => {
  const p = await phone();
  const { link } = await make(p);
  const a = await judge('longy', link);
  const b = await judge('frankie'); // no passkey yet: a claim
  const at = Date.parse('2026-11-30T12:00:00Z');
  db.prepare("UPDATE stages SET created = '2026-11-22T10:00:00Z'").run();
  assert.deepEqual((await closeOldStages(env, at, (e, id) => stub(id))).sort(), [a.stage, b.stage].sort());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM key_stages').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stage_claims').get().n, 0);
  // Making room, the same.
  const q = await phone();
  const c = await judge('pickle', (await make(q)).link);
  db.prepare("UPDATE stages SET created = '2026-11-30T09:00:00Z'").run();
  assert.equal(await makeRoom(env, at, (e, id) => stub(id)), true);
  assert.deepEqual(opens(q.id), []);
  assert.deepEqual((await back(q)).stages, []); // the passkey's still known (used today), with no gigs left
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stages WHERE id = ?').get(c.stage).n, 0);
});

test('a passkey with no stage left is forgotten 7 days after it was last used', async () => {
  const idle = await phone();
  await make(idle);
  const busy = await phone();
  const { link } = await make(busy);
  await judge('longy', link);
  db.prepare("UPDATE artist_keys SET created = '2026-11-01T00:00:00Z'").run();
  await closeOldStages(env, Date.parse('2026-11-12T00:00:00Z'), (e, id) => stub(id)); // the stage itself is new
  const left = db.prepare('SELECT id FROM artist_keys').all().map((r) => r.id);
  assert.deepEqual(left, [busy.id]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_links WHERE key = ?').get(idle.id).n, 0);
});

test('the old stage passkeys move across: each opens its one stage', async () => {
  db.exec("INSERT INTO stages (id, created) VALUES ('aw57e9', '2026-11-22T09:00:00Z')");
  db.exec("INSERT INTO stage_keys (id, stage, pubkey, alg, count, synced, created) VALUES ('old-key', 'aw57e9', 'pk', -7, 0, 1, '2026-11-22T09:00:00Z')");
  db.exec(readFileSync('scripts/artist-keys-migration.sql', 'utf8'));
  db.exec(readFileSync('scripts/artist-keys-migration.sql', 'utf8')); // twice is harmless
  assert.deepEqual(db.prepare('SELECT id, name, synced FROM artist_keys').all().map((r) => ({ ...r })), [{ id: 'old-key', name: 'My NutPub stage', synced: 1 }]);
  assert.deepEqual(opens('old-key'), ['aw57e9']);
});

test('a gig opened with its 12 words joins the passkey used next, by its claim code (session 54)', async () => {
  const p = await phone();
  await make(p);
  const g = await judge('pickle'); // no link: a claim comes back, as the 12 words give one
  assert.match(g.claim, /^[0-9a-f]{32}$/);
  const wrong = await call('POST', '/api/stages/back', { ...(await p.get(await makeChallenge())), claims: [{ stage: g.stage, claim: '0'.repeat(32) }] });
  assert.deepEqual(wrong.linked, []);
  const r = await call('POST', '/api/stages/back', { ...(await p.get(await makeChallenge())), claims: [{ stage: g.stage, claim: g.claim }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.linked, [g.stage]);
  assert.deepEqual(opens(p.id), [g.stage]);
  assert.deepEqual(r.stages.map((s) => s.stage), [g.stage]);
  // Spent once used.
  const again = await call('POST', '/api/stages/back', { ...(await p.get(await makeChallenge())), claims: [{ stage: g.stage, claim: g.claim }] });
  assert.deepEqual(again.linked, []);
});

// ---- Session 54b: a passkey added from another device.
const addCode = async (p) => call('POST', '/api/artist/add', await p.get(await makeChallenge()));
const addWith = async (p, code, claims = []) => call('POST', '/api/artist', { ...(await p.create(await makeChallenge())), name: 'NutPub · Artist · 23 Nov', claims, add: code });

test('the add code: 8 characters of Crockford base32, typed any way', () => {
  assert.equal(newAddCode(Uint8Array.of(0, 0, 0, 0, 0)), '00000000');
  assert.equal(newAddCode(Uint8Array.of(255, 255, 255, 255, 255)), 'ZZZZZZZZ');
  assert.equal(newAddCode(Uint8Array.of(0x01, 0x23, 0x45, 0x67, 0x89)), '04HMASW9');
  assert.equal(newAddCode(Uint8Array.of(0x9c, 0x3d, 0x6f, 0x23, 0x45)), 'KGYPY8T5');
  for (let i = 0; i < 50; i++) assert.match(newAddCode(), /^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(tidyAddCode(' k7qx-3mpa '), 'K7QX3MPA');
  assert.equal(tidyAddCode('o1lI-ab cd'), '0111ABCD');
});

test('another device: the passkey once, a code, and both passkeys open the same gigs', async () => {
  const p = await phone();
  const { link } = await make(p);
  const a = await judge('longy', link);
  const got = await addCode(p);
  assert.equal(got.status, 200);
  assert.match(got.code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(got.ms, 5 * 60 * 1000);
  // The server keeps the code's SHA-256, never the code.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_adds WHERE hash = ?').get(got.code).n, 0);
  // The new device checks the code (as typed, with a dash) before its sheet, then makes its own passkey with it.
  const shown = `${got.code.slice(0, 4)}-${got.code.slice(4).toLowerCase()}`;
  const checked = await call('POST', '/api/artist/add/check', { code: shown });
  assert.equal(checked.ok, true);
  assert.equal(checked.n, 2); // its name ends · 2
  const q = await phone();
  const added = await addWith(q, shown);
  assert.equal(added.status, 200);
  assert.equal(added.name, 'NutPub · Artist · 23 Nov');
  assert.match(added.link, /^[0-9a-f]{32}$/);
  assert.deepEqual(added.stages.map((s) => s.stage), [a.stage]); // its gigs, ready to open
  assert.equal(db.prepare('SELECT artist FROM artist_keys WHERE id = ?').get(q.id).artist, p.id);
  // A gig started on either joins both.
  const b = await judge('frankie', added.link);
  assert.equal(b.linked, true);
  const c = await judge('pickle', link);
  assert.deepEqual(opens(p.id), [a.stage, b.stage, c.stage].sort());
  assert.deepEqual((await back(p)).stages.map((s) => s.stage).sort(), [a.stage, b.stage, c.stage].sort());
  assert.deepEqual((await back(q)).stages.map((s) => s.stage).sort(), [a.stage, b.stage, c.stage].sort());
  // Once: the same code makes nothing more, and leaves no passkey on record.
  const r = await phone();
  assert.equal((await call('POST', '/api/artist/add/check', { code: got.code })).status, 403);
  const again = await addWith(r, got.code);
  assert.equal(again.status, 403);
  assert.equal(again.error, 'add');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_keys WHERE id = ?').get(r.id).n, 0);
});

test('a link code alone never makes an add code; an unknown passkey neither', async () => {
  const p = await phone();
  const { link } = await make(p);
  const noKey = await call('POST', '/api/artist/add', { link }, { 'X-Artist-Link': link });
  assert.equal(noKey.status, 400);
  const stranger = await addCode(await phone());
  assert.equal(stranger.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_adds').get().n, 0);
});

test('an add code runs out after 5 minutes, and a new one replaces the last', async () => {
  const p = await phone();
  await make(p);
  const first = await addCode(p);
  const second = await addCode(p);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_adds').get().n, 1);
  assert.equal((await addWith(await phone(), first.code)).status, 403);
  db.prepare('UPDATE artist_adds SET until = ?').run(Date.now() - 1);
  assert.equal((await call('POST', '/api/artist/add/check', { code: second.code })).status, 403);
  const late = await phone();
  assert.equal((await addWith(late, second.code)).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_keys WHERE id = ?').get(late.id).n, 0);
  // The daily clean-up takes it off.
  await closeOldStages(env, Date.now(), (e, id) => stub(id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_adds').get().n, 0);
});

test('a passkey added later keeps the gigs its browser started before (claim codes), on the same artist', async () => {
  const p = await phone();
  await make(p);
  const here = await judge('longy'); // started on the new device before the passkey
  const q = await phone();
  const added = await addWith(q, (await addCode(p)).code, [{ stage: here.stage, claim: here.claim }]);
  assert.deepEqual(added.linked, [here.stage]);
  assert.deepEqual(opens(p.id), [here.stage]);
});

test('an artist with gigs keeps every passkey; one with none forgets each 7 days after its own last use', async () => {
  const p = await phone();
  const { link } = await make(p);
  const q = await phone();
  await addWith(q, (await addCode(p)).code);
  await judge('longy', link);
  db.prepare("UPDATE artist_keys SET created = '2026-11-01T00:00:00Z', used = NULL").run();
  await closeOldStages(env, Date.parse('2026-11-12T00:00:00Z'), (e, id) => stub(id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_keys').get().n, 2);
  db.exec('DELETE FROM key_stages');
  await closeOldStages(env, Date.parse('2026-11-12T00:00:00Z'), (e, id) => stub(id));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artist_keys').get().n, 0);
});

test('the migration gives every passkey its own artist, and they keep their gigs', async () => {
  const old = new DatabaseSync(':memory:');
  old.exec('CREATE TABLE stage_keys (id TEXT PRIMARY KEY, stage TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT)');
  old.exec(readFileSync('scripts/artist-keys-migration.sql', 'utf8')); // the tables as session 53 made them
  old.exec("INSERT INTO artist_keys (id, name, pubkey, alg, created) VALUES ('k1', 'NutPub · Artist · 22 Nov', 'pk', -7, '2026-11-22')");
  old.exec("INSERT INTO key_stages (key, stage, role, created) VALUES ('k1', 'x7k2p9', 'artist', '2026-11-22')");
  old.exec(readFileSync('scripts/add-device-migration.sql', 'utf8'));
  assert.deepEqual({ ...old.prepare('SELECT id, artist FROM artist_keys').get() }, { id: 'k1', artist: 'k1' });
  assert.equal(old.prepare('SELECT COUNT(*) AS n FROM artist_adds').get().n, 0);
  // And schema.sql still runs on a stage made before the column (every statement IF NOT EXISTS, no index on it).
  const stage = new DatabaseSync(':memory:');
  stage.exec('CREATE TABLE stage_keys (id TEXT PRIMARY KEY, stage TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT)');
  stage.exec(readFileSync('scripts/artist-keys-migration.sql', 'utf8'));
  stage.exec(readFileSync('schema.sql', 'utf8'));
  assert.equal(stage.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('artist_keys') WHERE name = 'artist'").get().n, 0);
});
