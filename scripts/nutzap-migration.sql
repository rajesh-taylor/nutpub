-- 13 Nov: Nutzaps (server/nutzap.js). Once, on any database made before then:
-- wrangler d1 execute nutpub --remote --command "<the two lines below>"
CREATE TABLE IF NOT EXISTS nutzaps (locked INTEGER PRIMARY KEY, message INTEGER, pubkey TEXT NOT NULL, name TEXT, event TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS nutzaps_message ON nutzaps (message);
