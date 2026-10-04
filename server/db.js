// State on disk: one SQLite file (node:sqlite, built into Node), so a restart costs nothing.
// Every table the server needs is created here; each module reads and writes its own.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { DATA } from './config.js';

mkdirSync(DATA, { recursive: true });
export const db = new DatabaseSync(`${DATA}/nutpub.db`);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Small settings and counters, stored as JSON.
export const kv = {
  get(key, fallback = null) {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  },
  set(key, value) {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
    return value;
  },
};
