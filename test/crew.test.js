// Show producers (session 55): the artist invites one from Cellar with a link that works once, for 7 days; the invitee
// makes their own passkey on thenutpub.com, and their browser gets a key of its own, never the setup key. That key opens
// the producer's list of routes only: Plan gig (the artist's splits, Lightning address, name and page kept as stored),
// Show Time, the stream; never the takings (not even the totals, Rajesh 22 Nov), Move, Finish gig, invites or the 12 words.
// Remove, or the 12 words' lock-out, signs them out at once. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { sqliteStage, withStage, useDb, kv, one } from '../server/db.js';
import { serve } from '../server/app.js';
import { inviteInfo, joinCrew, crewCode, clearCrew, INVITE_MS } from '../server/crew.js';
import { mountStageDoor } from '../server/stages.js';
import { b64u, makeChallenge } from '../server/passkey.js';

const schema = readFileSync('schema.sql', 'utf8');
const utf8 = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', utf8.encode(t)));
const SETUP = 'a'.repeat(64);
const STAGE = 'k3f9x2';

// A Durable Object's storage, on node's SQLite (as test/stage.test.js has it).
function fakeStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    sql: { exec: (text, ...args) => {
      if (!args.length && text.trim().replace(/;\s*$/, '').includes(';')) { db.exec(text); return { toArray: () => [] }; }
      const st = db.prepare(text);
      const rows = st.columns().length ? st.all(...args) : (st.run(...args), []);
      return { toArray: () => rows.map((r) => ({ ...r })) };
    } },
    transactionSync: (fn) => { db.exec('BEGIN'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
// D1 (thenutpub.com's front door), on node's SQLite.
let front;
function d1() {
  const statement = (text, args = []) => ({
    text, args, bind: (...a) => statement(text, a),
    first: async () => front.prepare(text).get(...args) ?? null,
    all: async () => ({ results: front.prepare(text).all(...args) }),
    run: async () => { const r = front.prepare(text).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (text) => statement(text), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

let stage; let env; let door;
beforeEach(() => {
  configure({ MINT_URL: 'https://mint.test', SITE_URL: 'https://thenutpub.com', ADMIN_KEY: 'longys-key' });
  const storage = fakeStorage();
  storage.sql.exec(schema);
  stage = sqliteStage(storage, { id: STAGE, adminKey: SETUP });
  front = new DatabaseSync(':memory:');
  front.exec(schema);
  const D1 = d1();
  // The stage's Durable Object, as the front door calls it (stage.js), on the stage above.
  const stub = {
    invite: (code) => withStage(stage, () => inviteInfo(code)),
    joinCrew: (code, who) => withStage(stage, () => joinCrew(code, who)),
    welcome: (who) => withStage(stage, async () => { const c = await crewCode(who); return c ? { gig: null, artist: 'Longy', venue: 'Peggy Sue’s', state: 'soon', crew: c.code, role: c.role } : null; }),
  };
  env = { DB: D1, STAGES: { idFromName: (id) => id, get: () => stub }, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  front.prepare('INSERT INTO stages (id, created) VALUES (?, ?)').run(STAGE, new Date().toISOString());
  useDb(D1);
  const table = {};
  mountStageDoor((method, path, ...steps) => { table[`${method} ${path}`] = async (c) => { for (const s of steps) { const r = await s(c); if (r) return r; } }; });
  door = async (method, path, data) => {
    const req = new Request(`https://thenutpub.com${path}`, { method, headers: { Origin: 'https://thenutpub.com' }, body: data ? JSON.stringify(data) : undefined });
    const res = await table[`${method} ${path}`]({ req, url: new URL(req.url), params: {}, env });
    return { status: res.status, ...(await res.json()) };
  };
});
// The stage's own API (app.js), as <id>.thenutpub.com.
async function call(method, path, data, key = SETUP) {
  const req = new Request(`https://${STAGE}.thenutpub.com${path}`, { method, headers: { 'X-Admin': key || '', 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const res = await withStage(stage, () => serve(req, env));
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
// A phone's password manager, ES256, for thenutpub.com (as test/artist-passkey.test.js).
const cat = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
const rawToDer = (raw) => {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = cat([0], b); return cat([0x02, b.length], b); };
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return cat([0x30, body.length], body);
};
async function phone() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const credId = crypto.getRandomValues(new Uint8Array(20));
  const publicKey = b64u.enc(await crypto.subtle.exportKey('spki', keys.publicKey));
  const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
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
const invite = async (name = 'Jo') => call('POST', '/api/admin/crew', { role: 'producer', name });
// The invitee says yes with a new passkey, then trades the sign-in code on the gig's address: a producer's key.
async function producer(name = 'Jo') {
  const inv = await invite(name);
  const p = await phone();
  const yes = await door('POST', '/api/crew', { stage: STAGE, code: inv.code, ...(await p.create(await makeChallenge())), name: 'The NutPub · Producer · 22 Nov ’26' });
  assert.equal(yes.status, 200, JSON.stringify(yes));
  const code = new URL(yes.url).hash.match(/^#c=([0-9a-f]{32})$/)[1];
  const { key, role } = await call('POST', '/api/crew/handoff', { code }, '');
  return { inv, p, yes, key, role, code };
}

test('an invite: the code leaves the server once, its SHA-256 is kept, and it works for 7 days', async () => {
  const inv = await invite();
  assert.equal(inv.status, 200);
  assert.match(inv.code, /^[0-9a-f]{32}$/);
  assert.equal(inv.stage, STAGE);
  const row = await withStage(stage, () => one('SELECT invite, until, who FROM crew WHERE id = ?', inv.id));
  assert.equal(row.invite, await sha(inv.code));
  assert.equal(row.who, null);
  assert.ok(Math.abs(row.until - (Date.now() + INVITE_MS)) < 5000);
  assert.deepEqual((await door('POST', '/api/crew/invite', { stage: STAGE, code: inv.code })).role, 'producer');
  assert.equal((await withStage(stage, () => inviteInfo(inv.code, Date.now() + INVITE_MS + 1000))), null); // 7 days on: gone
  assert.equal((await door('POST', '/api/crew/invite', { stage: STAGE, code: '0'.repeat(32) })).status, 403);
  assert.equal((await invite('')).status, 400);
});

test('two producers at most; Cellar lists them, invited or signed in', async () => {
  await invite('Jo');
  await invite('Sam');
  assert.equal((await invite('Kat')).status, 409);
  const { crew } = await call('GET', '/api/admin/crew');
  assert.deepEqual(crew.map((m) => [m.name, m.joined]), [['Jo', false], ['Sam', false]]);
});

test('yes with a new passkey: the invite is spent once, the passkey opens the gig as producer, the key is its own', async () => {
  const { inv, p, yes, key, role, code } = await producer();
  assert.equal(role, 'producer');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, SETUP);
  assert.equal(yes.role, 'producer');
  assert.deepEqual(front.prepare('SELECT key, role FROM key_stages WHERE stage = ?').all(STAGE).map((r) => ({ ...r })), [{ key: p.id, role: 'producer' }]);
  // Spent: a second browser with the same link, and the same sign-in code again, get nothing.
  const q = await phone();
  assert.equal((await door('POST', '/api/crew', { stage: STAGE, code: inv.code, ...(await q.create(await makeChallenge())) })).status, 403);
  assert.equal((await call('POST', '/api/crew/handoff', { code }, '')).status, 403);
  // The server keeps the key's SHA-256, never the key.
  assert.equal(await withStage(stage, () => one('SELECT COUNT(*) AS n FROM crew_keys WHERE hash = ?', key).then((r) => r.n)), 0);
  assert.equal(await withStage(stage, () => one('SELECT COUNT(*) AS n FROM crew_keys WHERE hash = ?', 'x').then(() => 1)), 1);
});

test('Back to your gigs lists the gig with its role, and signs the producer in with a fresh code', async () => {
  const { p } = await producer();
  const r = await door('POST', '/api/stages/back', await p.get(await makeChallenge()));
  assert.equal(r.status, 200);
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].role, 'producer');
  const code = new URL(r.stages[0].url).hash.match(/^#c=([0-9a-f]{32})$/)[1];
  const again = await call('POST', '/api/crew/handoff', { code }, '');
  assert.equal(again.role, 'producer');
});

test('a producer’s key opens the producer’s list, and nothing of the artist’s own', async () => {
  const { key } = await producer();
  for (const [m, path, data] of [['GET', '/api/admin/setlist'], ['GET', '/api/admin/sold'], ['GET', '/api/admin/door'],
    ['GET', '/api/admin/drinks'], ['GET', '/api/admin/templates'], ['GET', '/api/admin/mods'], ['PUT', '/api/admin/pin', { text: 'Merch at the bar' }],
    ['POST', '/api/admin/stage', { stage: 'doors' }], ['GET', '/api/admin/door-link']]) {
    { const r = await call(m, path, data, key); assert.equal(r.status, 200, `${m} ${path} ${JSON.stringify(r)}`); }
  }
  for (const [m, path, data] of [['PUT', '/api/admin/artist-key', { pubkey: `02${'b'.repeat(64)}` }], ['GET', '/api/admin/locked'], ['GET', '/api/admin/takings'],
    ['POST', '/api/admin/locked/collected', { ids: [1] }], ['POST', '/api/admin/next-gig', {}], ['POST', '/api/admin/handoff'],
    ['GET', '/api/admin/crew'], ['POST', '/api/admin/crew', { role: 'producer', name: 'Me' }], ['DELETE', '/api/admin/crew/1'],
    ['GET', '/api/admin/recover-key'], ['PUT', '/api/admin/recover-key', { pubkey: 'c'.repeat(64) }], ['POST', '/api/admin/mods', { name: 'Me' }],
    ['PUT', '/api/admin/bar-key', { pubkey: `02${'b'.repeat(64)}` }], ['GET', '/api/admin/gigs'], ['POST', '/api/admin/gigs/delete', { id: 'x' }],
    ['GET', '/api/admin/recordings'], ['PUT', '/api/admin/nutzap-info', {}], ['GET', '/api/admin/free-stream/pay']]) {
    assert.equal((await call(m, path, data, key)).status, 403, `${m} ${path}`);
  }
  const me = await call('GET', '/api/admin/setlist', null, key);
  assert.equal(me.role, 'producer');
  assert.equal(me.crew, 'Jo');
  assert.equal('passkey' in me, false); // Cellar's passkey row is the artist's
  assert.equal((await call('GET', '/api/admin/setlist')).role, 'artist');
});

test('a producer’s Plan gig: the splits and Lightning address never reach them, and their save keeps the artist’s', async () => {
  const mine = (await call('GET', '/api/show')).show;
  const set = { ...mine, artist: 'Longy', page: 'longy', lightning: 'longy@wallet.example', splits: [{ name: 'Sam', percent: 10, lightning: 'sam@wallet.example' }], live: { server: 'rtmps://live.example/x/', key: 'sk', playback: '' } };
  assert.equal((await call('PUT', '/api/admin/show', set)).status, 200);
  const { key } = await producer();
  const theirs = await call('GET', '/api/show', null, key);
  assert.equal(theirs.role, 'producer');
  assert.deepEqual(theirs.show.splits, []);
  assert.equal(theirs.show.lightning, '');
  assert.equal(theirs.show.live.key, 'sk'); // a producer sees the stream key
  const saved = await call('PUT', '/api/admin/show', { ...theirs.show, venue: 'The Peggy', artist: 'Not Longy', page: 'notlongy', lightning: 'thief@wallet.example', splits: [{ name: 'Thief', percent: 90, lightning: 'thief@wallet.example' }] }, key);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.show.splits, []); // what comes back to them has none either
  const now = (await call('GET', '/api/show')).show;
  assert.equal(now.venue, 'The Peggy');
  assert.equal(now.artist, 'Longy');
  assert.equal(now.page, 'longy');
  assert.equal(now.lightning, 'longy@wallet.example');
  assert.deepEqual(now.splits.map((s) => s.name), ['Sam']);
  // A template a producer saves keeps the artist's splits, so loading it later loses nothing.
  await call('POST', '/api/admin/templates', { name: 'Fridays', show: theirs.show }, key);
  await call('PUT', '/api/admin/show', { ...now, splits: [] });
  await call('POST', '/api/admin/templates/load', { name: 'Fridays' });
  assert.deepEqual((await call('GET', '/api/show')).show.splits.map((s) => s.name), ['Sam']);
});

test('Remove signs the producer out at once, and their passkey stops opening the gig', async () => {
  const { key, inv, p } = await producer();
  assert.equal((await call('DELETE', `/api/admin/crew/${inv.id}`)).status, 200);
  assert.equal((await call('GET', '/api/admin/sold', null, key)).status, 403);
  assert.equal(front.prepare('SELECT COUNT(*) AS n FROM key_stages WHERE stage = ?').get(STAGE).n, 0);
  const r = await door('POST', '/api/stages/back', await p.get(await makeChallenge()));
  assert.deepEqual(r.stages, []);
});

test('a passkey that already opens the gig can’t take its invite; a removed one drops off Back to your gigs', async () => {
  const { p } = await producer();
  const inv = await invite('Jo again');
  const yes = await door('POST', '/api/crew', { stage: STAGE, code: inv.code, how: 'use', ...(await p.get(await makeChallenge())) });
  assert.equal(yes.status, 409);
  assert.equal((await door('POST', '/api/crew/invite', { stage: STAGE, code: inv.code })).status, 200); // still good for someone else
  // Removed on the stage while D1 still lists it (as if the stage's note to D1 was lost): Back to your gigs tidies it.
  await withStage(stage, () => clearCrew());
  const r = await door('POST', '/api/stages/back', await p.get(await makeChallenge()));
  assert.deepEqual(r.stages, []);
  assert.equal(front.prepare('SELECT COUNT(*) AS n FROM key_stages WHERE stage = ?').get(STAGE).n, 0);
});

test('the 12 words’ lock-out signs every producer and moderator out; the example gig’s scripted mod stays', async () => {
  const { key } = await producer();
  await withStage(stage, async () => {
    const { run } = await import('../server/db.js');
    await run("INSERT INTO mods (name, key_hash, created) VALUES ('Sam', 'h', 'now'), ('Aaron of Essex', 'seed:x', 'now')");
    await clearCrew();
    assert.equal((await one('SELECT COUNT(*) AS n FROM crew')).n, 0);
    assert.equal((await one('SELECT COUNT(*) AS n FROM crew_keys')).n, 0);
    assert.equal((await one("SELECT name FROM mods")).name, 'Aaron of Essex');
    await kv.set('x', 1);
  });
  assert.equal((await call('GET', '/api/admin/sold', null, key)).status, 403);
});

test('a producer’s key is nothing on another stage, and Longy’s own stage has no crew', async () => {
  const { key } = await producer();
  const storage = fakeStorage();
  storage.sql.exec(schema);
  const other = sqliteStage(storage, { id: 'p7q2m4', adminKey: 'b'.repeat(64) });
  const req = new Request('https://p7q2m4.thenutpub.com/api/admin/sold', { headers: { 'X-Admin': key } });
  assert.equal((await withStage(other, () => serve(req, env))).status, 403);
});
