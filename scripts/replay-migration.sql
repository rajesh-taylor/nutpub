-- Session 34: the replay's tables on Longy's D1 (stages add them themselves). Run once:
-- npx wrangler d1 execute nutpub --remote --file scripts/replay-migration.sql
CREATE TABLE IF NOT EXISTS replay_free (pass TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS replay_paid (pass TEXT PRIMARY KEY, until INTEGER NOT NULL, sats INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS replay_pieces (pass TEXT NOT NULL, piece INTEGER NOT NULL, sats INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pass, piece));
