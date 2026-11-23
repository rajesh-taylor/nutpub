// A safer chat for a solo artist (session 55c): comments need a tip while no mod is on (the default for a free stream),
// every message is checked for slurs and the artist's own words first, a busy chat slows itself, Quiet keeps a phone's
// words to itself for the night, and the artist's Nostr mute list (NIP-51) is read with its signature checked (BIP-340).
// Nothing new is signed or encrypted by the NutPub: these tests sign notes only as a fan's or artist's Nostr app would.
// Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { configure } from '../server/config.js';
import { sqliteStage, withStage, useDb, kv, run } from '../server/db.js';
import { serve } from '../server/app.js';
import { caught, plain, tidyWords } from '../server/wordlist.js';
import { pubkeyOf, checkMuteList, readMuteList, MUTE_KIND } from '../server/chat.js';
import { BUSY, HELD_MS } from '../server/mods.js';
import { clean, clearGig } from '../server/shows.js';
import { eventId, AUTH_KIND, npub } from '../server/nostr.js';

const schema = readFileSync('schema.sql', 'utf8');
const SETUP = 'a'.repeat(64);
const STAGE = 'k3f9x2';
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
// The NutPub's list is ROT13 in the code, and so are the slurs in these tests.
const rot13 = (s) => s.replace(/[a-z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 84) % 26) + 97));

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
function d1(front) {
  const statement = (text, args = []) => ({
    text, args, bind: (...a) => statement(text, a),
    first: async () => front.prepare(text).get(...args) ?? null,
    all: async () => ({ results: front.prepare(text).all(...args) }),
    run: async () => { const r = front.prepare(text).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (text) => statement(text), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

let stage; let env;
beforeEach(() => {
  configure({ MINT_URL: 'https://mint.test', SITE_URL: 'https://thenutpub.com', ADMIN_KEY: 'longys-key' });
  const storage = fakeStorage();
  storage.sql.exec(schema);
  stage = sqliteStage(storage, { id: STAGE, adminKey: SETUP });
  const front = new DatabaseSync(':memory:');
  front.exec(schema);
  env = { DB: d1(front), STAGES: { idFromName: (id) => id, get: () => ({}) }, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  useDb(env.DB);
});
async function call(method, path, data, headers = { 'X-Admin': SETUP }) {
  const req = new Request(`https://${STAGE}.thenutpub.com${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined });
  const res = await withStage(stage, () => serve(req, env));
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const fan = (method, path, data, headers = {}) => call(method, path, data, headers);
const newPass = async () => (await fan('POST', '/api/pass')).pass;
const say = (pass, text, extra = {}) => fan('POST', '/api/message', { text }, { 'X-Pass': pass, ...extra });
const tick = (pass, q = '', extra = {}) => fan('GET', `/api/tick?after=0${q}`, null, { 'X-Pass': pass, ...extra });
const lines = async (pass) => (await tick(pass)).messages.map((m) => m.text);
const db = (fn) => withStage(stage, fn);
const setShow = async (change) => { const { show } = await call('GET', '/api/show'); assert.equal((await call('PUT', '/api/admin/show', { ...show, ...change })).status, 200); };
const linkMod = async (name = 'Sam') => (await call('POST', '/api/admin/mods', { name })).key;

// Nostr notes, signed as the fan's or the artist's own Nostr app would (BIP-340).
const key = (n) => { const sk = hexToBytes(n.repeat(32)); return { sk, pk: hex(schnorr.getPublicKey(sk)) }; };
async function signed(k, ev) {
  const e = { pubkey: k.pk, created_at: Math.floor(Date.now() / 1000), content: '', tags: [], ...ev };
  e.id = await eventId(e);
  e.sig = hex(schnorr.sign(hexToBytes(e.id), k.sk, new Uint8Array(32)));
  return e;
}
const signIn = async (k, pass, profile) => fan('POST', '/api/nostr', { auth: await signed(k, { kind: AUTH_KIND, tags: [['u', `https://${STAGE}.thenutpub.com/api/nostr`], ['method', 'POST']] }), profile }, { 'X-Pass': pass });
const ARTIST = key('a1');
const FAN = key('f2');
const muteList = (people = [FAN.pk], words = ['canal'], at) => signed(ARTIST, { kind: MUTE_KIND, ...(at ? { created_at: at } : {}), tags: [...people.map((p) => ['p', p]), ...words.map((w) => ['word', w])] });

test('the word check: slurs and their spellings, whole words only, and the artist’s own words and phrases', () => {
  for (const t of ['fyhg', 'n fyhg', 'f.y.h.g', 'f y h g', '5yhhhg', 'fyhgf', 'lbh ergneqrq pybja', 'xvyy lbhefrys']) assert.equal(caught(rot13(t)), true, t);
  assert.equal(caught(`${rot13('xvyy lbhefrys').toUpperCase()}!!`), true);
  for (const t of ['Lovely set!', 'Play the one about the canal', 'night out in Niger', 'fire retardant', 'raccoon', 'Scunthorpe', 'grapes', 'spick and span', '100 sats', 'wow!!']) assert.equal(caught(t), false, t);
  assert.equal(caught(rot13('ņvttre')), true); // an accent doesn't hide it
  assert.equal(caught(rot13('fyhg').replace('s', 'ѕ')), true); // nor a Cyrillic look-alike
  assert.equal(plain('Bob Smith!! 100 sats'), 'bob smith sats');
  assert.equal(caught('bob smith!!', ['bob smith']), true);
  assert.equal(caught('bob', ['bob smith']), false);
  assert.equal(caught('rubbishhh', ['rubbish']), true);
  assert.deepEqual(tidyWords('Bob Smith, rubbish\n\nrubbish;  '), ['bob smith', 'rubbish']);
});

test('a slur isn’t sent: free, with a tip (before anything is paid), from a mod; a Nostr name with one shows the short npub', async () => {
  const pass = await newPass();
  const bad = rot13('lbh ner n fyhg');
  const no = await say(pass, bad);
  assert.deepEqual([no.status, no.error, no.detail], [400, 'not_welcome', 'Word(s) used are on the naughty list.']);
  assert.equal((await say(pass, bad, { 'X-Mod': await linkMod() })).status, 400);
  assert.equal((await fan('GET', '/api/tip/100', null, { 'X-Pass': pass, 'X-Message': encodeURIComponent(bad) })).status, 400);
  assert.notEqual((await fan('GET', '/api/tip/100', null, { 'X-Pass': pass, 'X-Message': 'Lovely' })).status, 400); // clean words go on to the payment
  assert.equal((await say(pass, 'Lovely set')).status, 200);
  // The artist's own words, from Cellar.
  assert.deepEqual((await call('PUT', '/api/admin/chat-words', { words: 'Bob Smith\nwhatsit' })).words, ['bob smith', 'whatsit']);
  assert.equal((await say(await newPass(), 'is bob smith here')).status, 400);
  assert.equal((await call('PUT', '/api/admin/chat-words', { words: 'x' }, {})).status, 403); // the artist's alone
  // A Nostr name the check catches: the short npub stands in.
  const other = await newPass();
  const me = await signIn(FAN, other, await signed(FAN, { kind: 0, content: JSON.stringify({ name: rot13('fyhg') }) }));
  assert.equal(me.status, 200, JSON.stringify(me));
  assert.match(me.name, /^npub1.{4}….{4}$/);
});

test('comments need a tip while no mod is on: on by default for a free stream; a mod on opens free comments', async () => {
  assert.equal(clean({ stream: { mode: 'free' } }).show.tipWords, true);
  assert.equal(clean({ stream: { mode: 'pay' } }).show.tipWords, false);
  assert.equal(clean({ stream: { mode: 'free' }, tipWords: false }).show.tipWords, false); // the artist's choice stays
  await setShow({ tipWords: true });
  const pass = await newPass();
  const no = await say(pass, 'Great gig');
  assert.deepEqual([no.status, no.error, no.detail], [403, 'tip_words', 'Add a tip to send it: 21 sats or more.']);
  assert.equal((await tick(pass)).tipOnly, true);
  assert.equal((await fan('GET', '/api/tip/21', null, { 'X-Pass': pass, 'X-Message': 'Great gig' })).error, 'not_ready'); // with a tip: on to the payment (no artist key in this test)
  // A mod's page is open (its tick): free comments open, for everyone.
  const mod = await linkMod();
  assert.equal((await tick(await newPass(), '&mod=1', { 'X-Mod': mod })).mod, true);
  assert.equal((await tick(pass)).tipOnly, undefined);
  assert.equal((await say(pass, 'Great gig')).status, 200);
  // 90 seconds after the mod's page last asked, they're off again.
  await db(() => kv.set('modSeen', Date.now() - 91_000));
  assert.equal((await say(await newPass(), 'Hello?')).error, 'tip_words');
  assert.equal((await say(await newPass(), 'Hello from Sam', { 'X-Mod': mod })).status, 200); // a mod never needs a tip
  await setShow({ tipWords: false });
  assert.equal((await say(await newPass(), 'Hello')).status, 200);
});

test('a busy chat turns slow mode on by itself; a mod’s off wins for 10 minutes', async () => {
  for (let i = 0; i < BUSY - 1; i++) assert.equal((await say(await newPass(), `hello ${i}`)).status, 200);
  const pass = await newPass();
  assert.equal((await tick(pass)).slow, false);
  await say(pass, 'one more');
  const t = await tick(pass);
  assert.deepEqual([t.slow, t.busy], [true, true]);
  const soon = await say(pass, 'and again');
  assert.deepEqual([soon.status, soon.detail], [429, 'One message every 30 seconds while the chat is busy.']);
  const mod = await linkMod();
  const off = await fan('POST', '/api/mod/slow', { on: false }, { 'X-Mod': mod });
  assert.deepEqual([off.slow, off.busy], [false, false]);
  await say(await newPass(), 'still busy');
  assert.equal((await tick(pass)).slow, false); // the mod's word holds
  assert.ok((await db(() => kv.get('slowHeld'))) > Date.now() + HELD_MS - 5000);
  const on = await fan('POST', '/api/mod/slow', { on: true }, { 'X-Mod': mod });
  assert.deepEqual([on.slow, on.busy], [true, false]); // a mod's own slow mode isn't "busy"
});

test('Quiet: the line goes, that phone sees its own lines and nobody else does, its tips still count; Undo; New night', async () => {
  const troll = await newPass();
  const kind = await newPass();
  const { id } = await say(troll, 'you’re rubbish');
  await say(kind, 'Lovely set');
  const strip = await call('GET', '/api/admin/chat');
  assert.deepEqual(strip.lines.map((l) => [l.who, l.text]), [[`guest ${kind.slice(0, 4)}`, 'Lovely set'], [`guest ${troll.slice(0, 4)}`, 'you’re rubbish']]);
  assert.equal(JSON.stringify(strip).includes(troll), false); // never a phone's pass
  const q = await call('POST', '/api/admin/quiet', { message: id });
  assert.deepEqual(q.lines.map((l) => l.text), ['Lovely set']);
  assert.deepEqual(q.quiet.map((x) => x.who), [`guest ${troll.slice(0, 4)}`]);
  assert.deepEqual(await lines(kind), ['Lovely set']);
  assert.ok((await tick(kind)).deleted.includes(id)); // a page that showed it takes it off
  assert.deepEqual(await lines(troll), ['you’re rubbish', 'Lovely set']); // as if nothing happened
  assert.equal((await tick(troll)).deleted.includes(id), false);
  await db(() => run("UPDATE messages SET at = '2000-01-01T00:00:00.000Z'")); // past the 10 seconds
  await say(troll, 'hello??');
  assert.deepEqual(await lines(kind), ['Lovely set']);
  assert.deepEqual(await lines(troll), ['you’re rubbish', 'Lovely set', 'hello??']);
  assert.deepEqual((await fan('GET', '/api/tick?top=1', null, {})).top, []); // not on Pub TV either
  // A mod's line can't be quietened; a mod's 🔇 is the same Quiet.
  const mod = await linkMod();
  const m = await say(await newPass(), 'Hello all', { 'X-Mod': mod });
  assert.equal((await call('POST', '/api/admin/quiet', { message: m.id })).status, 400);
  const other = await newPass();
  const o = await say(other, 'boo');
  assert.equal((await fan('POST', '/api/mod/quiet', { message: o.id }, { 'X-Mod': mod })).status, 200);
  assert.equal((await fan('POST', '/api/mod/quiet', { message: o.id }, { 'X-Mod': 'f'.repeat(32) })).status, 403);
  assert.equal((await call('POST', '/api/admin/quiet', { message: o.id }, {})).status, 403); // not a fan's
  // Undo the last: back in everyone's chat.
  const back = await call('DELETE', `/api/admin/quiet/${q.quiet[0].id}`);
  assert.deepEqual(back.quiet.map((x) => x.who), [`guest ${other.slice(0, 4)}`]);
  assert.deepEqual(await lines(kind), ['you’re rubbish', 'Lovely set', 'hello??', 'Hello all']);
  // Session 56: a chat already past those lines (its last line newer) gets them again, marked back, for 2 minutes.
  const past = await fan('GET', `/api/tick?after=${o.id}`, null, { 'X-Pass': kind });
  assert.deepEqual(past.messages.map((m) => [m.text, !!m.back]), [['you’re rubbish', true], ['hello??', true]]);
  assert.equal((await tick(kind)).messages.some((m) => m.back), false); // a fresh page: every line, none marked
  assert.deepEqual((await fan('GET', `/api/tick?after=${o.id + 60}`, null, { 'X-Pass': kind })).messages, []); // beyond the last 60
  await db(() => kv.set('chatBack', [])); // and after 2 minutes, not again
  assert.deepEqual((await fan('GET', `/api/tick?after=${o.id}`, null, { 'X-Pass': kind })).messages, []);
  await db(() => clearGig());
  assert.deepEqual(await db(() => kv.get('quiet', [])), []);
});

test('the Nostr mute list: signed by the artist’s npub (BIP-340), the newest kept, its people quiet and its words kept out', async () => {
  assert.equal(pubkeyOf(npub(ARTIST.pk)), ARTIST.pk);
  assert.equal(pubkeyOf(`nostr:${npub(ARTIST.pk)}`), ARTIST.pk);
  assert.equal(pubkeyOf('npub1nope'), null);
  const list = await muteList();
  assert.equal(await checkMuteList(list, ARTIST.pk), null);
  assert.equal(await checkMuteList({ ...list, sig: list.sig.replace(/^./, (c) => (c === '0' ? '1' : '0')) }, ARTIST.pk), 'bad_signature');
  assert.equal(await checkMuteList({ ...list, tags: [] }, ARTIST.pk), 'bad_signature'); // changed after signing
  assert.equal(await checkMuteList(await signed(FAN, { kind: MUTE_KIND }), ARTIST.pk), 'not_theirs');
  assert.equal(await checkMuteList(await signed(ARTIST, { kind: 3 }), ARTIST.pk), 'wrong_kind');
  assert.deepEqual(readMuteList(list), { at: list.created_at, id: list.id, people: [FAN.pk], words: ['canal'] });

  // A Nostr fan chatting before the list arrives.
  const fanPass = await newPass();
  assert.equal((await signIn(FAN, fanPass)).status, 200);
  await say(fanPass, 'hi from Nostr');
  const kind = await newPass();
  assert.equal((await call('PUT', '/api/admin/mute-list', { event: list })).error, 'no_npub');
  assert.equal((await call('PUT', '/api/admin/mute-list', { npub: 'nope' })).error, 'bad_npub');
  const set = await call('PUT', '/api/admin/mute-list', { npub: npub(ARTIST.pk) });
  assert.deepEqual([set.found, set.people], [false, 0]);
  const got = await call('PUT', '/api/admin/mute-list', { event: list });
  assert.deepEqual([got.status, got.found, got.people, got.words], [200, true, 1, 1]);
  assert.equal((await call('PUT', '/api/admin/mute-list', { event: await signed(FAN, { kind: MUTE_KIND }) })).error, 'not_theirs');
  assert.equal((await call('PUT', '/api/admin/mute-list', { npub: npub(ARTIST.pk) }, {})).status, 403); // the artist's alone
  assert.deepEqual(await lines(kind), []); // the muted fan's earlier line is gone for everyone else
  assert.deepEqual(await lines(fanPass), ['hi from Nostr']);
  await db(() => run("UPDATE messages SET at = '2000-01-01T00:00:00.000Z'"));
  await say(fanPass, 'still here');
  assert.deepEqual(await lines(kind), []);
  assert.equal((await call('GET', '/api/admin/chat')).muted, 1);
  assert.equal((await say(kind, 'the one about the canal')).status, 400); // its words join the check
  // An older list doesn't replace a newer one; a newer one does.
  await call('PUT', '/api/admin/mute-list', { event: await muteList([], [], list.created_at - 60) });
  assert.equal((await call('GET', '/api/admin/mute-list')).people, 1);
  await call('PUT', '/api/admin/mute-list', { event: await muteList([], [], list.created_at + 60) });
  assert.equal((await call('GET', '/api/admin/mute-list')).people, 0);
  assert.deepEqual(await lines(kind), ['hi from Nostr', 'still here']); // unmuted: back
  // Stop: the list no longer applies.
  await call('PUT', '/api/admin/mute-list', { event: await muteList([FAN.pk], [], list.created_at + 120) });
  assert.deepEqual(await lines(kind), []);
  await call('DELETE', '/api/admin/mute-list');
  assert.deepEqual(await lines(kind), ['hi from Nostr', 'still here']);
  assert.deepEqual(await call('GET', '/api/admin/mute-list').then(({ status, ...m }) => m), {});
});
