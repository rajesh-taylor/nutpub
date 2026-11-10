-- 10 Nov: the door's one scan. Once, on any database made before then:
-- wrangler d1 execute nutpub --remote --file scripts/door-migration.sql
ALTER TABLE tickets ADD COLUMN code TEXT;
ALTER TABLE tickets ADD COLUMN checked_at TEXT;
UPDATE tickets SET code = lower(hex(randomblob(12))) WHERE code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_code ON tickets (code);
