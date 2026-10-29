-- The NutPub's tables, in D1. Applied with: wrangler d1 execute nutpub --remote --file schema.sql
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shows (id TEXT PRIMARY KEY, settings TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (name TEXT PRIMARY KEY, settings TEXT NOT NULL, updated TEXT NOT NULL);
-- Secrets the gate has accepted, so a replay gets `reused` without a mint call.
CREATE TABLE IF NOT EXISTS seen (secret TEXT PRIMARY KEY, at TEXT NOT NULL);
-- Each accepted payment, as the token itself: a sealed envelope only its owner's key opens.
CREATE TABLE IF NOT EXISTS locked (
  id           INTEGER PRIMARY KEY,
  token        TEXT NOT NULL,
  sats         INTEGER NOT NULL,
  kind         TEXT NOT NULL,     -- 'piece' | 'tip' | 'ticket' | 'drink'
  pubkey       TEXT NOT NULL,     -- the key it's locked to: it collects only where that key is
  at           TEXT NOT NULL,
  collected_at TEXT,
  collected_by TEXT               -- 'artist' | 'bar'
);
CREATE TABLE IF NOT EXISTS passes (id TEXT PRIMARY KEY, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS paid (pass TEXT NOT NULL, piece INTEGER NOT NULL, sats INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pass, piece));
CREATE TABLE IF NOT EXISTS tips (pass TEXT, sats INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (pass TEXT PRIMARY KEY, sats INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drinks (id INTEGER PRIMARY KEY, pass TEXT UNIQUE NOT NULL, locked INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, pass TEXT, sats INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_pass ON messages (pass, id);
CREATE INDEX IF NOT EXISTS locked_open ON locked (collected_at, id);
