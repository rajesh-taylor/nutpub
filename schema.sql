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
-- The live picture: how long this pass's token lasts, and what it has paid tonight. One row per pass, however long it watches.
CREATE TABLE IF NOT EXISTS live_paid (pass TEXT PRIMARY KEY, until INTEGER NOT NULL, sats INTEGER NOT NULL) WITHOUT ROWID;
-- Who is watching the live picture right now: one row per pass, and which screen holds it. The viewer limit counts these.
CREATE TABLE IF NOT EXISTS watchers (pass TEXT PRIMARY KEY, screen TEXT NOT NULL, until INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS watchers_until ON watchers (until);
CREATE TABLE IF NOT EXISTS tips (pass TEXT, sats INTEGER NOT NULL, at TEXT NOT NULL);
-- kind: 'room' (the room ticket) or 'home' (the Online ticket). Added 7 Nov: ALTER TABLE tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';
-- code: the door's code for a room ticket (its QR), never the pass; checked_at: when the door scanned it. Added 10 Nov:
-- ALTER TABLE tickets ADD COLUMN code TEXT; ALTER TABLE tickets ADD COLUMN checked_at TEXT; (scripts/door-migration.sql)
-- secret: the time code's secret (RFC 6238; the ticket page's QR changes every 30 s). Added 11 Nov: scripts/totp-migration.sql
CREATE TABLE IF NOT EXISTS tickets (pass TEXT PRIMARY KEY, sats INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'room', code TEXT, checked_at TEXT, secret TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_code ON tickets (code);
CREATE TABLE IF NOT EXISTS drinks (id INTEGER PRIMARY KEY, pass TEXT UNIQUE NOT NULL, locked INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, pass TEXT, sats INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  mod TEXT,                        -- a moderator's name; null for a guest. Added 10 Nov: ALTER TABLE messages ADD COLUMN mod TEXT;
  mod_icon TEXT                    -- their icon then. Added 10 Nov: ALTER TABLE messages ADD COLUMN mod_icon TEXT;
);
-- Moderators: a name and the SHA-256 of their link's key (the key itself is never kept).
-- icon: the artist's pick; main: the one mod who may also change the pinned message. Both added 10 Nov (ALTER TABLE mods ADD COLUMN ...).
CREATE TABLE IF NOT EXISTS mods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, created TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎸', main INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS messages_pass ON messages (pass, id);
CREATE INDEX IF NOT EXISTS locked_open ON locked (collected_at, id);
-- The stretch goal's sum, read every tick: only tips, so paying every 10 s neither slows it nor writes to it.
CREATE INDEX IF NOT EXISTS locked_tips ON locked (at) WHERE kind = 'tip';
-- Deleted messages, also read every tick: only those rows, not the whole chat.
CREATE INDEX IF NOT EXISTS messages_gone ON messages (id) WHERE deleted = 1;
