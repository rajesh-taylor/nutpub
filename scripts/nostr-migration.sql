-- 12 Nov: Nostr sign-in for the chat. Once, on any database made before then:
-- wrangler d1 execute nutpub --remote --file scripts/nostr-migration.sql
ALTER TABLE messages ADD COLUMN nostr TEXT;
CREATE TABLE IF NOT EXISTS nostr (pass TEXT PRIMARY KEY, pubkey TEXT NOT NULL, name TEXT, at TEXT NOT NULL);
