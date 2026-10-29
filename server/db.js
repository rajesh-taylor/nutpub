// State in D1 (Cloudflare's SQLite): the tables are in schema.sql. Each module reads and writes its own.
let D1;
export const useDb = (d1) => { D1 = d1; };

export const sql = (text, ...args) => D1.prepare(text).bind(...args);
export const one = (text, ...args) => sql(text, ...args).first();
export const all = async (text, ...args) => (await sql(text, ...args).all()).results;
export const run = (text, ...args) => sql(text, ...args).run();
// Several statements as one transaction: all of them, or none.
export const batch = (statements) => D1.batch(statements);

// Small settings and counters, stored as JSON.
export const kv = {
  async get(key, fallback = null) {
    const row = await one('SELECT value FROM kv WHERE key = ?', key);
    return row ? JSON.parse(row.value) : fallback;
  },
  async set(key, value) {
    await run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    return value;
  },
};
