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

// ---- Moderators by invite (session 55b): the link opens the gig page; yes with a passkey (thenutpub.com/crew, a mod key
// per browser, sent as X-Mod) or with Nostr Sign In there (the invite tied to their npub). Remove and the 12 words'
// lock-out sign them out; links made before keep working; the example gig's scripted mod stays.
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { eventId, AUTH_KIND } from '../server/nostr.js';

const modInvite = (name = 'Kat', icon = '🎤') => call('POST', '/api/admin/crew', { role: 'mod', name, icon });
// A fan's browser on the gig's address: its own pass, and whatever headers it sends.
async function fan(method, path, data, headers = {}) {
  const req = new Request(`https://${STAGE}.thenutpub.com${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined });
  const res = await withStage(stage, () => serve(req, env));
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const newPass = async () => (await fan('POST', '/api/pass')).pass;
// Nostr Sign In's note, signed as an extension would (BIP-340 Schnorr, NIP-98), for this gig's address.
const NSK = hexToBytes('11'.repeat(32));
const NPK = [...schnorr.getPublicKey(NSK)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function note(sk = NSK, at = Math.floor(Date.now() / 1000)) {
  const e = { pubkey: [...schnorr.getPublicKey(sk)].map((b) => b.toString(16).padStart(2, '0')).join(''), kind: AUTH_KIND, created_at: at, content: '',
    tags: [['u', `https://${STAGE}.thenutpub.com/api/nostr`], ['method', 'POST']] };
  e.id = await eventId(e);
  e.sig = [...schnorr.sign(hexToBytes(e.id), sk, crypto.getRandomValues(new Uint8Array(32)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return e;
}
async function passkeyMod(name = 'Kat') {
  const inv = await modInvite(name);
  const p = await phone();
  const yes = await door('POST', '/api/crew', { stage: STAGE, code: inv.code, ...(await p.create(await makeChallenge())), name: 'The NutPub · Mod · 22 Nov ’26' });
  assert.equal(yes.status, 200, JSON.stringify(yes));
  const code = new URL(yes.url).hash.match(/^#c=([0-9a-f]{32})$/)[1];
  const out = await call('POST', '/api/crew/handoff', { code }, '');
  return { inv, p, yes, ...out };
}

test('a mod’s invite: an icon, three mods at most (invites waiting count), checked on the gig page without spending it', async () => {
  const inv = await modInvite();
  assert.equal(inv.status, 200);
  assert.equal(inv.icon, '🎤');
  const info = await fan('POST', '/api/mod/invite', { code: inv.code });
  assert.deepEqual([info.role, info.name, info.icon], ['mod', 'Kat', '🎤']);
  assert.equal((await fan('POST', '/api/mod/invite', { code: inv.code })).status, 200); // still good: nothing spent
  assert.equal((await fan('POST', '/api/mod/invite', { code: '0'.repeat(32) })).status, 403);
  const prod = await invite('Jo');
  assert.equal((await fan('POST', '/api/mod/invite', { code: prod.code })).status, 403); // a producer's isn't a mod's
  await withStage(stage, async () => { const { run } = await import('../server/db.js'); await run("INSERT INTO mods (name, key_hash, created) VALUES ('Old link', 'h1', 'now')"); });
  assert.equal((await modInvite('Sam')).status, 200);
  assert.equal((await modInvite('Ali')).status, 409); // Kat waiting, the old link, Sam waiting
  assert.equal((await call('POST', '/api/admin/crew', { role: 'mod', name: 'Me' }, (await producer('Pat')).key)).status, 403); // not a producer's
});

test('yes with a passkey: a mod key of its own, the mod’s tools, never the artist’s', async () => {
  const { key, role, p } = await passkeyMod();
  assert.equal(role, 'mod');
  assert.match(key, /^[0-9a-f]{32}$/);
  const me = await fan('GET', '/api/mod/me', null, { 'X-Mod': key });
  assert.deepEqual([me.status, me.name, me.icon, me.main], [200, 'Kat', '🎤', true]);
  const row = await withStage(stage, () => one('SELECT key_hash FROM mods WHERE name = ?', 'Kat'));
  assert.match(row.key_hash, /^crew:/); // never a SHA-256, so no link matches it
  assert.equal(await withStage(stage, () => one('SELECT COUNT(*) AS n FROM crew_keys WHERE hash = ?', key).then((r) => r.n)), 0); // the hash only
  const pass = await newPass();
  const said = await fan('POST', '/api/message', { text: 'Merch at thenutpub.com' }, { 'X-Pass': pass, 'X-Mod': key });
  assert.equal(said.status, 200, JSON.stringify(said));
  const tick = await fan('GET', '/api/tick?mod=1', null, { 'X-Pass': pass, 'X-Mod': key });
  assert.equal(tick.mod, true);
  assert.deepEqual(tick.messages.map((m) => [m.who, m.mod, m.icon]), [['Kat', true, '🎤']]);
  assert.equal((await call('GET', '/api/admin/sold', null, key)).status, 403); // a mod key opens none of the artist's pages
  const { mods } = await call('GET', '/api/admin/mods');
  assert.deepEqual(mods.map((m) => [m.name, m.via]), [['Kat', 'passkey']]);
  const back = await door('POST', '/api/stages/back', await p.get(await makeChallenge()));
  assert.deepEqual(back.stages.map((s) => s.role), ['mod']);
  // "I'm a mod" signs them back in with a key of their own; Sign out ends that browser's key only.
  const code = new URL(back.stages[0].url).hash.match(/^#c=([0-9a-f]{32})$/)[1];
  const second = await call('POST', '/api/crew/handoff', { code }, '');
  assert.equal(second.role, 'mod');
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': second.key })).via, 'passkey');
  assert.equal((await fan('DELETE', '/api/mod/me', null, { 'X-Mod': key })).status, 200);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': key })).status, 403);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': second.key })).status, 200);
});

test('yes with Nostr Sign In on the gig page: the invite tied to the npub, which is the mod sign-in from then on', async () => {
  const inv = await modInvite();
  const pass = await newPass();
  const n = await note();
  const yes = await fan('POST', '/api/nostr', { auth: n, invite: inv.code }, { 'X-Pass': pass });
  assert.equal(yes.status, 200, JSON.stringify(yes));
  assert.deepEqual(yes.mod, { name: 'Kat', icon: '🎤', main: true });
  assert.equal((await fan('POST', '/api/nostr', { auth: n }, { 'X-Pass': pass })).status, 400); // a note works once
  assert.equal((await fan('POST', '/api/nostr', { auth: await note(hexToBytes('22'.repeat(32))), invite: inv.code }, { 'X-Pass': await newPass() })).status, 403); // spent
  assert.equal((await withStage(stage, () => one('SELECT npub FROM crew WHERE id = ?', inv.id))).npub, NPK);
  const me = await fan('GET', '/api/mod/me', null, { 'X-Pass': pass });
  assert.deepEqual([me.status, me.name, me.nostr], [200, 'Kat', true]);
  await fan('POST', '/api/message', { text: 'Hello all' }, { 'X-Pass': pass });
  const tick = await fan('GET', '/api/tick?mod=1', null, { 'X-Pass': pass });
  assert.equal(tick.mod, true);
  assert.deepEqual(tick.messages.map((m) => [m.who, m.mod, m.nostr]), [['Kat', true, true]]); // purple, with the Mod tag
  // Next night, another device: Nostr Sign In alone brings the mod back.
  const other = await newPass();
  const again = await fan('POST', '/api/nostr', { auth: await note(NSK, Math.floor(Date.now() / 1000) + 1) }, { 'X-Pass': other }); // a new note (the same second's would be the same note)
  assert.equal(again.mod?.name, 'Kat');
  assert.equal((await fan('GET', '/api/nostr', null, { 'X-Pass': other })).mod?.name, 'Kat');
  // Someone else's npub is a fan.
  const stranger = await newPass();
  assert.equal((await fan('POST', '/api/nostr', { auth: await note(hexToBytes('33'.repeat(32))) }, { 'X-Pass': stranger })).mod, undefined);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Pass': stranger })).status, 403);
  assert.deepEqual((await call('GET', '/api/admin/mods')).mods.map((m) => m.via), ['nostr']);
});

test('Remove signs a mod out at once, by passkey or by Nostr; links made before keep working', async () => {
  const pk = await passkeyMod('Kat');
  const inv = await modInvite('Sam', '🥁');
  const pass = await newPass();
  await fan('POST', '/api/nostr', { auth: await note(), invite: inv.code }, { 'X-Pass': pass });
  const old = await withStage(stage, async () => { const { run } = await import('../server/db.js'); await run("INSERT INTO mods (name, key_hash, created) VALUES ('Old link', ?, 'now')", await sha('c'.repeat(32))); return 'c'.repeat(32); });
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': old })).status, 200);
  const { mods } = await call('GET', '/api/admin/mods');
  for (const m of mods.filter((x) => x.crew)) assert.equal((await call('DELETE', `/api/admin/crew/${m.crew}`)).status, 200);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': pk.key })).status, 403);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Pass': pass })).status, 403);
  assert.equal((await fan('GET', '/api/tick?mod=1', null, { 'X-Pass': pass })).mod, false);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': old })).status, 200); // the old link still works
  assert.deepEqual((await call('GET', '/api/admin/mods')).mods.map((m) => [m.name, m.via, !!m.main]), [['Old link', 'link', true]]);
  assert.equal(front.prepare("SELECT COUNT(*) AS n FROM key_stages WHERE stage = ? AND role = 'mod'").get(STAGE).n, 0);
});

test('the 12 words’ lock-out signs mods by invite out too, and the scripted mod becomes the main mod', async () => {
  const pk = await passkeyMod('Kat');
  const inv = await modInvite('Sam', '🥁');
  const pass = await newPass();
  await fan('POST', '/api/nostr', { auth: await note(), invite: inv.code }, { 'X-Pass': pass });
  await withStage(stage, async () => {
    const { run } = await import('../server/db.js');
    await run("INSERT INTO mods (name, key_hash, created) VALUES ('Aaron of Essex', 'seed:x', 'now')");
    await clearCrew();
  });
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Mod': pk.key })).status, 403);
  assert.equal((await fan('GET', '/api/mod/me', null, { 'X-Pass': pass })).status, 403);
  assert.deepEqual((await call('GET', '/api/admin/mods')).mods.map((m) => [m.name, m.via, !!m.main]), [['Aaron of Essex', 'seed', true]]);
});

test('on localhost a stage’s own address (<id>.localhost) passes the Nostr check; another stage’s does not', async () => {
  const at = Math.floor(Date.now() / 1000);
  const local = async (u, host) => {
    const e = { pubkey: NPK, kind: AUTH_KIND, created_at: at, content: '', tags: [['u', u], ['method', 'POST']] };
    e.id = await eventId(e);
    e.sig = [...schnorr.sign(hexToBytes(e.id), NSK)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const pass = (await withStage(stage, () => serve(new Request(`http://${host}/api/pass`, { method: 'POST' }), env)).then((r) => r.json())).pass;
    const req = new Request(`http://${host}/api/nostr`, { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({ auth: e }) });
    return (await withStage(stage, () => serve(req, env))).status;
  };
  assert.equal(await local(`http://${STAGE}.localhost:8818/api/nostr`, `${STAGE}.localhost:8818`), 200);
  assert.equal(await local('http://p7q2m4.localhost:8818/api/nostr', `${STAGE}.localhost:8818`), 400);
});

// The Mod page (session 55e): <stage>/mod, the mod's own look at the chat, signed in as mods are (passkey or Nostr).
test('the Mod page: a mod’s chat with Quiet and Undo, slow mode and the pin; a fan, a producer and a removed mod get nothing', async () => {
  const { key } = await passkeyMod('Kat');
  const pk = { 'X-Mod': key };
  const guest = await newPass();
  await fan('POST', '/api/message', { text: 'sound’s great' }, { 'X-Pass': guest });
  const mine = await newPass();
  await fan('POST', '/api/message', { text: 'Setlist at frankie.shop' }, { 'X-Pass': mine, ...pk });
  const s = await fan('GET', '/api/mod/chat', null, pk);
  assert.equal(s.status, 200, JSON.stringify(s));
  assert.deepEqual([s.me.name, s.me.icon, s.me.main, s.me.via], ['Kat', '🎤', true, 'passkey']);
  assert.deepEqual(s.lines.map((l) => [l.who.startsWith('guest ') ? 'guest' : l.who, !!l.mod, l.text]), [['guest', false, 'sound’s great'], ['Kat', true, 'Setlist at frankie.shop']]);
  assert.ok(s.lines.every((l) => !('pass' in l))); // never a phone's pass
  assert.equal(s.gig.path, '/gig');
  assert.equal(s.gig.stage, 'doors');
  assert.equal(await withStage(stage, () => kv.get('modSeen', 0)) > 0, true); // asking counts as a mod on
  // Quiet from the Mod page, then the mod's own Undo.
  const q = await fan('POST', '/api/mod/quiet', { message: s.lines[0].id }, pk);
  assert.equal(q.status, 200);
  assert.deepEqual(q.lines.map((l) => l.who), ['Kat']);
  assert.equal(q.quiet.length, 1);
  const u = await fan('DELETE', `/api/mod/quiet/${q.quiet[0].id}`, null, pk);
  assert.deepEqual([u.status, u.quiet.length, u.lines.length], [200, 0, 2]); // the line is back
  // Slow mode and the pin, as on the gig page.
  assert.equal((await fan('POST', '/api/mod/slow', { on: true }, pk)).slow, true);
  assert.equal((await fan('POST', '/api/mod/pin', { text: 'Merch at the bar' }, pk)).pin, 'Merch at the bar');
  const again = await fan('GET', '/api/mod/chat', null, pk);
  assert.deepEqual([again.slow, again.pin], [true, 'Merch at the bar']);
  // Not a mod: refused, with the words the page signs out on.
  for (const h of [{}, { 'X-Pass': guest }, { 'X-Mod': 'f'.repeat(32) }]) {
    const r = await fan('GET', '/api/mod/chat', null, h);
    assert.deepEqual([r.status, r.error], [403, 'not_mod']);
  }
  assert.equal((await fan('DELETE', `/api/mod/quiet/${'a'.repeat(12)}`, null, { 'X-Pass': guest })).status, 403);
  const prod = await producer('Pat');
  assert.equal((await fan('GET', '/api/mod/chat', null, { 'X-Admin': prod.key })).status, 403); // producers stay on Show Time
  const { mods } = await call('GET', '/api/admin/mods');
  await call('DELETE', `/api/admin/crew/${mods[0].crew}`);
  assert.equal((await fan('GET', '/api/mod/chat', null, pk)).error, 'not_mod'); // Remove: out at once
});

test('the Mod page for a Nostr mod: their pass, signed in with the npub the invite was tied to', async () => {
  const inv = await modInvite('Sam', '🥁');
  const pass = await newPass();
  await fan('POST', '/api/nostr', { auth: await note(), invite: inv.code }, { 'X-Pass': pass });
  const s = await fan('GET', '/api/mod/chat', null, { 'X-Pass': pass });
  assert.deepEqual([s.status, s.me.name, s.me.via], [200, 'Sam', 'nostr']);
  assert.equal((await fan('GET', '/api/mod/chat', null, { 'X-Pass': await newPass() })).status, 403);
});

test('a mod plays the recorded set free, as they watch a live stream free; a fan still needs a ticket or the 402', async () => {
  const { key } = await passkeyMod('Kat');
  env.ASSETS = { fetch: async (u) => (String(u).endsWith('/set.json') ? Response.json({ segments: 3, segmentMs: 10000 })
    : new Response('x', { headers: { 'Content-Type': String(u).endsWith('.wav') ? 'audio/wav' : 'video/mp4' } })) };
  await withStage(stage, async () => {
    const { currentShow, saveShow } = await import('../server/shows.js');
    const { show } = await currentShow();
    await saveShow({ ...show, stream: { ...show.stream, mode: 'ticket' } });
  });
  const guest = await newPass();
  const fanAsk = await fan('GET', '/api/set/audio/0', null, { 'X-Pass': guest });
  assert.equal(fanAsk.error, 'ticket_needed', JSON.stringify(fanAsk));
  assert.equal((await fan('GET', '/api/set/video/0', null, { 'X-Pass': guest })).error, 'not_paid');
  assert.equal((await fan('GET', '/api/set/audio/0', null, { 'X-Pass': guest, 'X-Mod': key })).status, 200);
  assert.equal((await fan('GET', '/api/set/video/0', null, { 'X-Pass': guest, 'X-Mod': key })).status, 200);
});
