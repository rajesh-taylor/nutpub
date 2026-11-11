-- 11 Nov: the door QR that changes every 30 seconds. Once, on any database made before then:
-- wrangler d1 execute nutpub --remote --file scripts/totp-migration.sql
ALTER TABLE tickets ADD COLUMN secret TEXT;
UPDATE tickets SET secret = lower(hex(randomblob(32))) WHERE secret IS NULL;
