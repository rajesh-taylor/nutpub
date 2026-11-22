-- 22 Nov (session 54b): a passkey added from another device, on Longy's D1. Each passkey belongs to an artist (the first
-- passkey's id); key_stages.key already holds a passkey's id, which is now its artist's. Codes: artist_adds.
-- Run once, before npm run deploy (a second run stops at the ALTER: the column is there):
-- npx wrangler d1 execute nutpub --remote --file scripts/add-device-migration.sql
ALTER TABLE artist_keys ADD COLUMN artist TEXT;
UPDATE artist_keys SET artist = id WHERE artist IS NULL;
CREATE INDEX IF NOT EXISTS artist_keys_artist ON artist_keys (artist);
CREATE TABLE IF NOT EXISTS artist_adds (hash TEXT PRIMARY KEY, artist TEXT NOT NULL, until INTEGER NOT NULL);
