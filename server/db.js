// State: each stage has its own SQLite database (tables in schema.sql). Longy's stage (thenutpub.com) is D1, as it
// always was; every other stage (<id>.thenutpub.com) is a SQLite Durable Object of its own (server/stage.js). Which
// one a request uses is picked once, at the door (index.js), and carried through every await with AsyncLocalStorage,
// so two stages served by one Worker never mix. Each module reads and writes its own tables through one/all/run/kv.
import { AsyncLocalStorage } from 'node:async_hooks';
import { ADMIN_KEY, SITE_URL } from './config.js';

const here = new AsyncLocalStorage();
let fallback = null; // tests (and the cron for Longy) set one database for everything

// A stage's database: { id, adminKey, prefix, prepare(text) -> { bind(...args) -> D1-like statement }, batch(list) }.
// id: '' for Longy's, else the stage's id. adminKey: the stage's setup key (Longy's is the Worker secret ADMIN_KEY).
// prefix: its photos' names in KV.
export const stageDb = () => here.getStore() ?? fallback;
export const withStage = (s, fn) => here.run(s, fn);
// D1 itself, as a stage (Longy's, and the tests' stand-in for it).
export const d1Stage = (d1) => ({ id: '', prefix: '', prepare: (t) => d1.prepare(t), batch: (l) => d1.batch(l) });
export const useDb = (d1) => { fallback = d1Stage(d1); };

export const sql = (text, ...args) => stageDb().prepare(text).bind(...args);
export const one = (text, ...args) => sql(text, ...args).first();
export const all = async (text, ...args) => (await sql(text, ...args).all()).results;
export const run = (text, ...args) => sql(text, ...args).run();
// Several statements as one transaction: all of them, or none.
export const batch = (statements) => stageDb().batch(statements);
export const adminKey = () => (stageDb()?.id ? stageDb().adminKey || '' : ADMIN_KEY);
// The stage's public address, for QR codes and links: thenutpub.com for Longy's, <id>.thenutpub.com for the others.
export function siteUrl(c) {
  const id = stageDb()?.id;
  if (!SITE_URL) return c.url.origin;
  if (!id) return SITE_URL;
  const u = new URL(SITE_URL);
  return `${u.protocol}//${id}.${u.host}`;
}

// A Durable Object's SQLite (ctx.storage.sql), dressed as D1: the same first/all/run/batch and the same results, so no
// query changes. Its calls are synchronous; `batch` runs inside one transaction.
const value = (v) => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v);
export function sqliteStage(storage, { id, adminKey: key = '' }) {
  const exec = (text, args) => storage.sql.exec(text, ...args.map(value));
  const runNow = (text, args) => {
    const results = exec(text, args).toArray();
    const [m] = exec('SELECT changes() AS changes, last_insert_rowid() AS last_row_id', []).toArray();
    return { results, success: true, meta: { changes: m.changes, last_row_id: m.last_row_id } };
  };
  const statement = (text, args = []) => ({
    text, args,
    bind: (...more) => statement(text, more),
    first: async () => exec(text, args).toArray()[0] ?? null,
    all: async () => ({ results: exec(text, args).toArray(), success: true }),
    run: async () => runNow(text, args),
  });
  return {
    id, adminKey: key, prefix: `${id}:`,
    prepare: (text) => statement(text),
    batch: async (list) => storage.transactionSync(() => list.map((st) => runNow(st.text, st.args))),
    alarmAt: (ms) => storage.setAlarm(ms), // the stage's own alarm (stage.js): the practice stream's 20 minutes
  };
}

// Small settings and counters, stored as JSON.
export const kv = {
  async get(key, fallbackValue = null) {
    const row = await one('SELECT value FROM kv WHERE key = ?', key);
    return row ? JSON.parse(row.value) : fallbackValue;
  },
  async set(key, value) {
    await run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    return value;
  },
};
