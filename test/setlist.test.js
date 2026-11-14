// The setlist: a new stage opens on Longy's example gig, Finish gig ticks it off and opens Frankie Peroni's, then the
// artist's own; an untouched example comes back on today. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { configure } from '../server/config.js';
import { sqliteStage, withStage, useDb, kv, run } from '../server/db.js';
import { currentShow, nextGig } from '../server/shows.js';
import { setlist, finished, again } from '../server/setlist.js';

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
const schema = readFileSync('schema.sql', 'utf8');
const makeStage = (id) => { const s = fakeStorage(); s.sql.exec(schema); return sqliteStage(s, { id, adminKey: 'k' }); };

// The site's files (only the example photos, as JPEG bytes) and the photos' KV.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const photos = new Map();
const env = {
  ASSETS: { fetch: async (u) => (/\/img\/(longy|frankie)-(tall|wide)\.jpg$/.test(String(u)) ? new Response(JPEG) : new Response('', { status: 404 })) },
  PHOTOS: { put: async (k, v) => photos.set(k, v), delete: async (k) => photos.delete(k), get: async (k) => photos.get(k) ?? null },
};
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const finish = async () => { await kv.set('stage', 'closed'); await nextGig(); return finished(env); };

let st;
beforeEach(() => {
  configure({ MINT_URL: 'https://mint.test', SITE_URL: 'https://thenutpub.com', ADMIN_KEY: 'longys-key' });
  useDb(null);
  photos.clear();
  st = makeStage('k3f9x2');
});

test('a new stage opens on Longy’s gig, filled in, today', async () => {
  await withStage(st, async () => {
    assert.deepEqual(await setlist(env), { at: 'longy', done: [] });
    const { show, problems } = await currentShow();
    assert.deepEqual(problems, []);
    assert.equal(show.artist, 'Longy');
    assert.equal(show.date, today());
    assert.equal(show.ticket.on, true); // venue tickets
    assert.equal(show.stream.mode, 'ticket'); // a flat-fee Watch online ticket
    assert.ok(show.online.price > 0);
    assert.equal(show.set, ''); // his clip, the default set
    assert.deepEqual([...photos.keys()].sort(), ['k3f9x2:photo', 'k3f9x2:photo-wide2']);
  });
});

test('Finish gig ticks a gig off and opens the next: Frankie Peroni, then Your gig', async () => {
  await withStage(st, async () => {
    await setlist(env);
    assert.deepEqual(await finish(), { at: 'frankie', done: ['longy'] });
    const { show, problems } = await currentShow();
    assert.deepEqual(problems, []);
    assert.equal(show.artist, 'Frankie Peroni');
    assert.equal(show.stream.mode, 'pay');
    assert.equal(show.stream.perMinute, 60);
    assert.equal(show.set, 'frankie-1');
    assert.deepEqual([...photos.keys()].sort(), ['k3f9x2:photo', 'k3f9x2:photo-wide1']); // Longy's wide photo gone
    assert.deepEqual(await finish(), { at: 'yours', done: ['longy', 'frankie'] });
    assert.equal((await currentShow()).show.set, 'frankie-2');
    assert.equal(photos.size, 0);
  });
});

test('an untouched example comes back on today; one with a ticket sold stays as it was', async () => {
  await withStage(st, async () => {
    await setlist(env);
    const past = async () => {
      const { show } = await currentShow();
      await run("UPDATE shows SET settings = ? WHERE id = 'current'", JSON.stringify({ ...show, date: '2026-11-01' }));
    };
    await past();
    await setlist(env);
    assert.equal((await currentShow()).show.date, today());
    await past();
    await run("INSERT INTO tickets (pass, sats, kind, at) VALUES ('p', 21, 'room', 'now')");
    await setlist(env);
    assert.equal((await currentShow()).show.date, '2026-11-01');
  });
});

test('Longy’s own stage has no setlist', async () => {
  await withStage(makeStage(''), async () => {
    assert.equal(await setlist(env), null);
    assert.equal(await finished(env), null);
  });
});

test('a crossed-off gig opens again; Your gig keeps its settings; finishing it skips ahead', async () => {
  await withStage(st, async () => {
    await setlist(env);
    await finish(); await finish(); // on Your gig
    const mine = (await currentShow()).show;
    await run("UPDATE shows SET settings = ? WHERE id = 'current'", JSON.stringify({ ...mine, artist: 'Ann' }));
    assert.deepEqual(await again('longy', env), { at: 'longy', done: ['frankie'] });
    assert.equal((await currentShow()).show.artist, 'Longy');
    assert.deepEqual(await finish(), { at: 'yours', done: ['frankie', 'longy'] }); // straight back to Your gig
    assert.equal((await currentShow()).show.artist, 'Ann');
    assert.equal(await again('nobody', env), null);
  });
});

test('a judge’s stage (/judge) holds one gig: Finish gig ticks it off and opens nothing else', async () => {
  await withStage(st, async () => {
    assert.deepEqual(await setlist(env, 'frankie'), { at: 'frankie', done: [], only: true });
    assert.equal((await currentShow()).show.artist, 'Frankie Peroni');
    assert.deepEqual(await finish(), { at: 'frankie', done: ['frankie'], only: true });
    assert.equal(await again('longy', env), null); // no Repeat gig on a one-gig stage
    assert.deepEqual(await setlist(env), { at: 'frankie', done: ['frankie'], only: true });
  });
});

test('example gigs bring their chat: Longy’s pin, Aaron of Essex, and his question posted once', async () => {
  await withStage(st, async () => {
    const { cue } = await import('../server/setlist.js');
    const { one, all } = await import('../server/db.js');
    await setlist(env, 'longy');
    assert.match(await kv.get('pin'), /Tip with a comment/);
    assert.deepEqual((await all('SELECT name, icon FROM mods')).map((m) => m.name), ['Aaron of Essex']);
    assert.equal(await cue(0), true);
    assert.equal(await cue(0), false); // once, whoever asks first
    const m = await one('SELECT text, mod FROM messages');
    assert.equal(m.mod, 'Aaron of Essex');
    assert.match(m.text, /watching from tonight/);
  });
});

test('Frankie’s practice gig: £30 at the door with the first drink in it, last orders set', async () => {
  await withStage(st, async () => {
    await setlist(env, 'frankie');
    const { show, problems } = await currentShow();
    assert.deepEqual(problems, []);
    assert.equal(show.drinks, true);
    assert.equal(show.drink.mode, 'artist');
    assert.ok(show.drink.price > 0 && show.ticket.price > show.drink.price);
    assert.match(show.lastOrders, /^\d\d:\d\d$/);
  });
});
