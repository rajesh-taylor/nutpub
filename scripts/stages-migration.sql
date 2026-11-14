-- 14 Nov: the front door's two tables, on Longy's D1 (the stages themselves are Durable Objects).
-- Run once: wrangler d1 execute nutpub --remote --file scripts/stages-migration.sql
CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stage_keys (id TEXT PRIMARY KEY, stage TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT);
CREATE INDEX IF NOT EXISTS stage_keys_stage ON stage_keys (stage);
