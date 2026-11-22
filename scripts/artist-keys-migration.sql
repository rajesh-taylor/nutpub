-- 22 Nov (session 53): the artist's passkey, one for every stage it starts, on Longy's D1. stage_keys stays, unread.
-- Run once, before npm run deploy: npx wrangler d1 execute nutpub --remote --file scripts/artist-keys-migration.sql
CREATE TABLE IF NOT EXISTS artist_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', pubkey TEXT NOT NULL,
  alg INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT);
CREATE TABLE IF NOT EXISTS key_stages (key TEXT NOT NULL, stage TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'artist',
  created TEXT NOT NULL, PRIMARY KEY (key, stage));
CREATE INDEX IF NOT EXISTS key_stages_stage ON key_stages (stage);
CREATE TABLE IF NOT EXISTS artist_links (hash TEXT PRIMARY KEY, key TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS artist_links_key ON artist_links (key);
CREATE TABLE IF NOT EXISTS stage_claims (stage TEXT PRIMARY KEY, hash TEXT NOT NULL);
-- Each old stage passkey, as an artist passkey with its one stage (the name it was made with).
INSERT OR IGNORE INTO artist_keys (id, name, pubkey, alg, count, synced, created, used)
  SELECT id, 'My NutPub stage', pubkey, alg, count, synced, created, used FROM stage_keys;
INSERT OR IGNORE INTO key_stages (key, stage, role, created) SELECT id, stage, 'artist', created FROM stage_keys;
