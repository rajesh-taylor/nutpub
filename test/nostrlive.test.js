// The gig listed live on Nostr (server/nostrlive.js, NIP-53, session 55d). Signing only (the global rule): BIP-340's own
// test vector, a frozen known answer for one listing (its id from two implementations, its signature), each step of
// the night, and every way a signed listing can be wrong. Then the routes on a stage, as Show Time uses them.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/curves/utils.js';
import { getEventHash, verifyEvent as toolsVerify } from 'nostr-tools/pure';
import { configure } from '../server/config.js';
import { sqliteStage, withStage, useDb, kv } from '../server/db.js';
import { serve } from '../server/app.js';
import { eventId, verifyEvent } from '../server/nostr.js';
import { listingTags, listingTitle, endedTags, wanted, checkListing, LIVE_KIND, RESIGN } from '../server/nostrlive.js';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const ZERO = new Uint8Array(32); // BIP-340's aux_rand: zeros, so a signature is a fixed answer
const ARTIST_SK = hexToBytes('0000000000000000000000000000000000000000000000000000000000000005');
const ARTIST = hex(schnorr.getPublicKey(ARTIST_SK));
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const AT = 1_795_464_000; // Mon 23 Nov 2026, 20:00 UK time
const LINK = 'https://xaji80.thenutpub.com/longy';
const SHOW = { title: '', artist: 'Longy', venue: 'The Bell, 1 High Street, Bath' };
const gig = (over = {}) => ({ d: 'a1b2c3d4e5f6a7b8', show: SHOW, stage: 'doors', opens: AT, link: LINK, image: `${LINK.replace('/longy', '')}/api/show/photo/wide1?v=abc`, pubkey: ARTIST, relays: RELAYS, ...over });
async function sign(ev, sk = ARTIST_SK) {
  const e = { pubkey: hex(schnorr.getPublicKey(sk)), created_at: AT, content: '', ...ev };
  e.id = await eventId(e);
  e.sig = hex(schnorr.sign(hexToBytes(e.id), sk, ZERO));
  return e;
}

test('BIP-340’s own test vector 0: the Schnorr library signs as the standard says', () => {
  const sk = hexToBytes('0000000000000000000000000000000000000000000000000000000000000003');
  assert.equal(hex(schnorr.getPublicKey(sk)).toUpperCase(), 'F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9');
  const sig = schnorr.sign(new Uint8Array(32), sk, ZERO);
  assert.equal(hex(sig).toUpperCase(), 'E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0');
  assert.equal(schnorr.verify(sig, new Uint8Array(32), schnorr.getPublicKey(sk)), true);
});

test('a listing: a frozen known answer, the same id from nostr-tools, and no stream link', async () => {
  const tags = listingTags(gig({ stage: 'open', times: { open: new Date(AT * 1000).toISOString() } }));
  assert.deepEqual(tags, [
    ['d', 'a1b2c3d4e5f6a7b8'],
    ['title', 'Longy live at The Bell'],
    ['summary', `Tickets and the stream: ${LINK}`],
    ['image', 'https://xaji80.thenutpub.com/api/show/photo/wide1?v=abc'],
    ['starts', String(AT)],
    ['status', 'live'],
    ['t', 'music'], ['t', 'livemusic'],
    ['r', LINK],
    ['p', ARTIST, 'wss://relay.damus.io', 'Host'],
    ['relays', ...RELAYS],
    ['alt', `A live gig on the NutPub: Longy live at The Bell. ${LINK}`],
  ]);
  assert.ok(!tags.some((t) => t[0] === 'streaming'), 'never the stream’s own link: it would skip the 402');
  const ev = await sign({ kind: LIVE_KIND, tags });
  assert.equal(ev.id, getEventHash(ev), 'NIP-01’s id, the same from nostr-tools');
  assert.equal(ev.id, KAT.id);
  assert.equal(ev.sig, KAT.sig);
  assert.equal(await verifyEvent(ev), true);
  assert.equal(toolsVerify({ ...ev }), true, 'nostr-tools checks it too');
});
const KAT = {
  id: '0067935b4209ccac0a305d8da09b515e5fda7cdba855d4d4e85f65a690c96e17',
  sig: '351f0c2cb36aac425fd6d216cfe6a9e2a75ed4ef78317bb3e2f933d6e4b8c48e6d6199a73058702c29c069991927203759ebe3785848347a95611a1ea7db72ee',
};

test('the title: its own, else the artist live at the venue’s name, else the artist', () => {
  assert.equal(listingTitle({ ...SHOW, title: 'Christmas at The Bell' }), 'Christmas at The Bell');
  assert.equal(listingTitle(SHOW), 'Longy live at The Bell');
  assert.equal(listingTitle({ artist: 'Longy', venue: '' }), 'Longy, live');
  assert.equal(listingTitle({ artist: 'Longy\u0000\n', venue: ' The Bell ' }), 'Longy live at The Bell');
});

test('each step: planned at the start time, live from when it opened, ended at End night', () => {
  const st = (tags, n) => tags.find((t) => t[0] === n)?.[1];
  const planned = listingTags(gig());
  assert.deepEqual([st(planned, 'status'), st(planned, 'starts'), st(planned, 'ends')], ['planned', String(AT), undefined]);
  const early = new Date((AT - 600) * 1000).toISOString(); // Start stream 10 minutes early
  const live = listingTags(gig({ stage: 'on', times: { open: early, on: new Date(AT * 1000).toISOString() } }));
  assert.deepEqual([st(live, 'status'), st(live, 'starts')], ['live', String(AT - 600)]);
  const auto = listingTags(gig({ stage: 'open', times: {} })); // the start time came: open by itself
  assert.deepEqual([st(auto, 'status'), st(auto, 'starts')], ['live', String(AT)]);
  const ended = listingTags(gig({ stage: 'closed', times: { open: early, closed: new Date((AT + 7200) * 1000).toISOString() } }));
  assert.deepEqual([st(ended, 'status'), st(ended, 'starts'), st(ended, 'ends')], ['ended', String(AT - 600), String(AT + 7200)]);
  const off = endedTags(live, AT + 60);
  assert.deepEqual([st(off, 'status'), st(off, 'ends'), st(off, 'starts')], ['ended', String(AT + 60), String(AT - 600)]);
});

test('what to sign: only what changed; live again every 30 minutes; ended when switched off or the gig has gone', async () => {
  const build = (stage) => (d) => listingTags(gig({ d, stage }));
  const fresh = () => 'feedfacecafebeef';
  const empty = { gig: null, d: null, event: null, endAt: null };
  let w = wanted({ on: false, gig: 'g1', state: empty, build: build('doors'), now: AT });
  assert.equal(w.tags, null, 'off, nothing sent: nothing');
  w = wanted({ on: true, gig: 'g1', state: empty, build: build('doors'), now: AT, fresh });
  assert.equal(w.state.d, 'feedfacecafebeef');
  assert.equal(w.tags.find((t) => t[0] === 'status')[1], 'planned');
  let state = { ...w.state, event: await sign({ kind: LIVE_KIND, tags: w.tags }) };
  assert.equal(wanted({ on: true, gig: 'g1', state, build: build('doors'), now: AT + 60 }).tags, null, 'no change: nothing');
  w = wanted({ on: true, gig: 'g1', state, build: build('open'), now: AT + 60 });
  assert.equal(w.tags.find((t) => t[0] === 'status')[1], 'live');
  assert.equal(w.state.d, 'feedfacecafebeef', 'the same listing, replaced');
  state = { ...w.state, event: await sign({ kind: LIVE_KIND, tags: w.tags, created_at: AT + 60 }) };
  assert.equal(wanted({ on: true, gig: 'g1', state, build: build('open'), now: AT + 60 + RESIGN - 1 }).tags, null);
  assert.ok(wanted({ on: true, gig: 'g1', state, build: build('open'), now: AT + 61 + RESIGN }).tags, 'signed again after 30 minutes live');
  // Switched off while live: ended, once, at a time kept so the browser and the server agree.
  w = wanted({ on: false, gig: 'g1', state, build: build('open'), now: AT + 900 });
  assert.equal(w.state.endAt, AT + 900);
  assert.equal(w.tags.find((t) => t[0] === 'ends')[1], String(AT + 900));
  assert.deepEqual(wanted({ on: false, gig: 'g1', state: w.state, build: build('open'), now: AT + 905 }).tags, w.tags, 'the same end, asked again');
  const endedState = { ...w.state, event: await sign({ kind: LIVE_KIND, tags: w.tags, created_at: AT + 900 }) };
  assert.equal(wanted({ on: false, gig: 'g1', state: endedState, build: build('open'), now: AT + 960 }).tags, null, 'ended: nothing more');
  // The gig went (Finish gig) while still live: that one ends first, then the next gig's listing is a new one.
  w = wanted({ on: true, gig: 'g2', state, build: build('doors'), now: AT + 999, fresh });
  assert.equal(w.tags.find((t) => t[0] === 'd')[1], 'feedfacecafebeef');
  assert.equal(w.tags.find((t) => t[0] === 'status')[1], 'ended');
  const next = wanted({ on: true, gig: 'g2', state: { ...w.state, event: await sign({ kind: LIVE_KIND, tags: w.tags, created_at: AT + 999 }) }, build: build('doors'), now: AT + 1000, fresh: () => '0123456789abcdef' });
  assert.equal(next.state.d, '0123456789abcdef');
  assert.equal(next.tags.find((t) => t[0] === 'status')[1], 'planned');
});

test('a signed listing, refused: forged, another key, old, not newer, a stream link, words of its own, another kind', async () => {
  const tags = listingTags(gig());
  const opts = { tags, pubkey: ARTIST, at: AT };
  const good = await sign({ kind: LIVE_KIND, tags });
  assert.equal(await checkListing(good, opts), null);
  assert.equal(await checkListing({ ...good, tags: [...tags, ['streaming', 'https://cdn.example/x.m3u8']] }, opts), 'bad_signature');
  assert.equal(await checkListing(await sign({ kind: LIVE_KIND, tags: [...tags, ['streaming', 'https://cdn.example/x.m3u8']] }), opts), 'wrong_tags', 'a stream link, signed: still refused');
  assert.equal(await checkListing(await sign({ kind: LIVE_KIND, tags, content: 'hi' }), opts), 'wrong_tags');
  assert.equal(await checkListing(await sign({ kind: 1, tags }), opts), 'wrong_kind');
  assert.equal(await checkListing(await sign({ kind: LIVE_KIND, tags }, hexToBytes('07'.padStart(64, '0'))), opts), 'wrong_key');
  assert.equal(await checkListing(good, { ...opts, at: AT + 301 }), 'too_old');
  assert.equal(await checkListing(good, { ...opts, last: { created_at: AT } }), 'not_newer');
  assert.equal(await checkListing(good, { ...opts, tags: null }), 'nothing_to_send');
});

// ---- The routes on a stage, as Show Time uses them.
const schema = readFileSync('schema.sql', 'utf8');
const SETUP = 'a'.repeat(64);
const STAGE = 'k3f9x2';
const LOCK = '02511095c6bc30aa2700bb26c9fb0fcde445d03141b318f58063fa998c8409e02f';
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
beforeEach(async () => {
  configure({ MINT_URL: 'https://mint.test', SITE_URL: 'https://thenutpub.com', ADMIN_KEY: 'longys-key' });
  const storage = fakeStorage();
  storage.sql.exec(schema);
  stage = sqliteStage(storage, { id: STAGE, adminKey: SETUP });
  const front = new DatabaseSync(':memory:');
  front.exec(schema);
  env = { DB: d1(front), STAGES: { idFromName: (id) => id, get: () => ({}) }, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  useDb(env.DB);
  const note = await sign({ kind: 10019, tags: [...RELAYS.map((r) => ['relay', r]), ['mint', 'https://mint.test', 'sat'], ['pubkey', LOCK]], created_at: Math.floor(Date.now() / 1000) });
  await withStage(stage, async () => { await kv.set('artistKey', LOCK); await kv.set('nutzapInfo', JSON.stringify(note)); });
});
async function call(method, path, data, headers = { 'X-Admin': SETUP }) {
  const req = new Request(`https://${STAGE}.thenutpub.com${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined });
  const res = await withStage(stage, () => serve(req, env));
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const signNow = async (want, last) => sign({ ...want, created_at: Math.max(Math.floor(Date.now() / 1000), (last || 0) + 1) });
const setShow = async (change) => { const { show } = await call('GET', '/api/show'); assert.equal((await call('PUT', '/api/admin/show', { ...show, ...change })).status, 200); };

test('on a stage: planned, then live after Start stream, then ended; the artist’s key only; no stream link', async () => {
  await setShow({ artist: 'Longy', page: 'longy', venue: 'The Bell, Bath', date: '2099-12-24', streams: '20:00' });
  let r = await call('GET', '/api/admin/nostr-live');
  assert.equal(r.on, true, 'an artist’s own gig: on until switched off');
  assert.equal(r.pubkey, ARTIST);
  const st = (w, n) => w.tags.find((t) => t[0] === n)?.[1];
  assert.equal(st(r.want, 'status'), 'planned');
  assert.equal(st(r.want, 'summary'), `Tickets and the stream: https://${STAGE}.thenutpub.com/longy`);
  assert.ok(!r.want.tags.some((t) => t[0] === 'streaming'));
  const planned = await signNow(r.want, r.last);
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: planned })).status, 200);
  r = await call('GET', '/api/admin/nostr-live');
  assert.deepEqual([r.want, r.sent.status], [null, 'planned']);
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: planned })).error, 'not_newer', 'the same one again: refused');
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: await signNow({ kind: LIVE_KIND, content: '', tags: planned.tags }, planned.created_at) })).status, 409, 'nothing new to send');
  assert.equal((await call('GET', '/api/admin/nostr-live', null, {})).status, 403, 'a fan can’t ask');
  // Start stream (the free stream needs no payment on a pay-as-you-watch gig).
  assert.equal((await call('POST', '/api/admin/stage', { stage: 'open' })).status, 200);
  r = await call('GET', '/api/admin/nostr-live');
  assert.equal(st(r.want, 'status'), 'live');
  assert.equal(st(r.want, 'd'), st(planned, 'd'), 'the same listing, replaced');
  const forged = await signNow({ ...r.want, tags: [...r.want.tags, ['streaming', 'https://cdn.example/live.m3u8']] }, r.last);
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: forged })).error, 'wrong_tags');
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: await sign({ ...r.want, created_at: Math.floor(Date.now() / 1000) + 1 }, hexToBytes('09'.padStart(64, '0'))) })).error, 'wrong_key');
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: await signNow(r.want, r.last) })).status, 200);
  assert.equal((await call('POST', '/api/admin/stage', { stage: 'closed' })).status, 200);
  r = await call('GET', '/api/admin/nostr-live');
  assert.equal(st(r.want, 'status'), 'ended');
  assert.ok(st(r.want, 'ends'));
});

test('a judge’s practice gig: off until switched on in Plan gig; switched off after it went out, ended once', async () => {
  await withStage(stage, () => kv.set('setlist', { at: 'longy', done: [], only: true }));
  await setShow({ artist: 'Longy', page: 'longy', date: '2099-12-24', streams: '20:00', nostrLive: null });
  let r = await call('GET', '/api/admin/nostr-live');
  assert.deepEqual([r.on, r.practice, r.want], [false, true, null]);
  assert.equal((await call('GET', '/api/show')).practice, true, 'Plan gig is told, so its switch starts off');
  await setShow({ nostrLive: true });
  r = await call('GET', '/api/admin/nostr-live');
  assert.equal(r.on, true);
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: await signNow(r.want, r.last) })).status, 200);
  await setShow({ nostrLive: false });
  r = await call('GET', '/api/admin/nostr-live');
  assert.equal(r.want.tags.find((t) => t[0] === 'status')[1], 'ended');
  assert.equal((await call('PUT', '/api/admin/nostr-live', { event: await signNow(r.want, r.last) })).status, 200);
  r = await call('GET', '/api/admin/nostr-live');
  assert.deepEqual([r.want, r.sent.status], [null, 'ended']);
});

test('no Nutzap note yet: nothing to sign (the key that signs both comes first)', async () => {
  await withStage(stage, () => kv.set('nutzapInfo', 'null'));
  const r = await call('GET', '/api/admin/nostr-live');
  assert.deepEqual([r.want, r.why], [null, 'no_key']);
});
