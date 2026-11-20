-- 20 Nov (session 39): blind-signed venue tickets. Once, on Longy's D1 (the stages get it from schema.sql):
-- npx wrangler d1 execute nutpub --remote --file scripts/blind-migration.sql
-- Tickets sold before this can't show the new door QR: press New night after deploying.
CREATE TABLE IF NOT EXISTS blinded (pass TEXT PRIMARY KEY, blind TEXT NOT NULL, signed TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS door_in (y TEXT PRIMARY KEY, at TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS door_words (word TEXT PRIMARY KEY, y TEXT NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
