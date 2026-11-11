-- 12 Nov: passkeys for tickets ("Find my ticket"). Once, on any database made before then:
-- wrangler d1 execute nutpub --remote --file scripts/passkey-migration.sql
CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, pass TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT);
CREATE INDEX IF NOT EXISTS passkeys_pass ON passkeys (pass);
CREATE TABLE IF NOT EXISTS challenges (value TEXT PRIMARY KEY, at INTEGER NOT NULL);
