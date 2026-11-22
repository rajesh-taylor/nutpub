-- The NutPub's tables, in D1. Applied with: wrangler d1 execute nutpub --remote --file schema.sql
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shows (id TEXT PRIMARY KEY, settings TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (name TEXT PRIMARY KEY, settings TEXT NOT NULL, updated TEXT NOT NULL);
-- Secrets the gate has accepted, so a replay gets `reused` without a mint call.
CREATE TABLE IF NOT EXISTS seen (secret TEXT PRIMARY KEY, at TEXT NOT NULL);
-- Each accepted payment, as the token itself: a sealed envelope only its owner's key opens.
CREATE TABLE IF NOT EXISTS locked (
  id           INTEGER PRIMARY KEY,
  token        TEXT NOT NULL,
  sats         INTEGER NOT NULL,
  kind         TEXT NOT NULL,     -- 'piece' | 'tip' | 'ticket' | 'drink'
  pubkey       TEXT NOT NULL,     -- the key it's locked to: it collects only where that key is
  at           TEXT NOT NULL,
  collected_at TEXT,
  collected_by TEXT               -- 'artist' | 'bar'
);
CREATE TABLE IF NOT EXISTS passes (id TEXT PRIMARY KEY, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS paid (pass TEXT NOT NULL, piece INTEGER NOT NULL, sats INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pass, piece));
-- The live picture: how long this pass's token lasts, and what it has paid tonight. One row per pass, however long it watches.
CREATE TABLE IF NOT EXISTS live_paid (pass TEXT PRIMARY KEY, until INTEGER NOT NULL, sats INTEGER NOT NULL) WITHOUT ROWID;
-- Replays (server/replay.js, sessions 34-35): after End night the gig page plays the recording (or a judge's clip)
-- until it's deleted, 7 days on. replay_free: the passes that held a ticket at End night (they watch free).
-- replay_bought: who has bought it (sats 0: a ticket's free way in), with the seconds of recording handed out so far
-- (twice through at most) and when the current token runs out; replay_pieces: a clip's 10-second pieces played.
-- Live payments don't count. Deleted with the replay. Added: scripts/replay-migration.sql
CREATE TABLE IF NOT EXISTS replay_free (pass TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS replay_bought (pass TEXT PRIMARY KEY, sats INTEGER NOT NULL, watched INTEGER NOT NULL, until INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS replay_pieces (pass TEXT NOT NULL, piece INTEGER NOT NULL, sats INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (pass, piece));
-- Who is watching the live picture right now: one row per pass, and which screen holds it. The viewer limit counts these.
CREATE TABLE IF NOT EXISTS watchers (pass TEXT PRIMARY KEY, screen TEXT NOT NULL, until INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS watchers_until ON watchers (until);
CREATE TABLE IF NOT EXISTS tips (pass TEXT, sats INTEGER NOT NULL, at TEXT NOT NULL);
-- kind: 'room' (the room ticket) or 'home' (the Online ticket). Added 7 Nov: ALTER TABLE tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'room';
-- code: the door's code for a room ticket (its QR), never the pass; checked_at: when the door scanned it. Added 10 Nov:
-- ALTER TABLE tickets ADD COLUMN code TEXT; ALTER TABLE tickets ADD COLUMN checked_at TEXT; (scripts/door-migration.sql)
-- secret: the time code's secret (RFC 6238; the ticket page's QR changes every 30 s). Added 11 Nov: scripts/totp-migration.sql
CREATE TABLE IF NOT EXISTS tickets (pass TEXT PRIMARY KEY, sats INTEGER NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'room', code TEXT, checked_at TEXT, secret TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_code ON tickets (code);
-- Blind-signed venue tickets (server/blind.js, session 39). blinded: the blinded ticket (B_) a phone sent with its 402
-- and tonight's gig key's signature on it, with its DLEQ proof (JSON): neither says what the ticket is. door_in: the
-- fingerprint (Y) of each ticket let in, so none gets in twice; it can't be matched to a purchase. door_words: the
-- words a ticket showed instead of its QR (No scanner?), ten minutes each. All three go at New night, with the gig key.
-- Added 20 Nov: scripts/blind-migration.sql
CREATE TABLE IF NOT EXISTS blinded (pass TEXT PRIMARY KEY, blind TEXT NOT NULL, signed TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS door_in (y TEXT PRIMARY KEY, at TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS door_words (word TEXT PRIMARY KEY, y TEXT NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS drinks (id INTEGER PRIMARY KEY, pass TEXT UNIQUE NOT NULL, locked INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, pass TEXT, sats INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  mod TEXT,                        -- a moderator's name; null for a guest. Added 10 Nov: ALTER TABLE messages ADD COLUMN mod TEXT;
  mod_icon TEXT,                   -- their icon then. Added 10 Nov: ALTER TABLE messages ADD COLUMN mod_icon TEXT;
  nostr TEXT                       -- a guest's Nostr name then, if signed in. Added 12 Nov: scripts/nostr-migration.sql
);
-- Nostr sign-in for the chat (server/nostr.js): the phone's pass, its Nostr public key and profile name, for the night.
CREATE TABLE IF NOT EXISTS nostr (pass TEXT PRIMARY KEY, pubkey TEXT NOT NULL, name TEXT, at TEXT NOT NULL);
-- Nutzaps (server/nutzap.js, 13 Nov): which tip (locked) and chat message was a Nutzap, the fan's key and name, and the
-- signed public note. Deleted with the night's records (closing.js). Added: scripts/nutzap-migration.sql
CREATE TABLE IF NOT EXISTS nutzaps (locked INTEGER PRIMARY KEY, message INTEGER, pubkey TEXT NOT NULL, name TEXT, event TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS nutzaps_message ON nutzaps (message);
-- Moderators: a name and the SHA-256 of their link's key (the key itself is never kept).
-- icon: the artist's pick; main: the one mod who may also change the pinned message. Both added 10 Nov (ALTER TABLE mods ADD COLUMN ...).
CREATE TABLE IF NOT EXISTS mods (id INTEGER PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT UNIQUE NOT NULL, created TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎸', main INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS messages_pass ON messages (pass, id);
CREATE INDEX IF NOT EXISTS locked_open ON locked (collected_at, id);
-- The stretch goal's sum, read every tick: only tips, so paying every 10 s neither slows it nor writes to it.
CREATE INDEX IF NOT EXISTS locked_tips ON locked (at) WHERE kind = 'tip';
-- Deleted messages, also read every tick: only those rows, not the whole chat.
CREATE INDEX IF NOT EXISTS messages_gone ON messages (id) WHERE deleted = 1;
-- Passkeys for tickets (server/passkey.js): the public key and which ticket's pass it opens; nothing about the person.
-- count: the passkey's sign count (0 for synced ones); synced: its password manager backs it up. Added 12 Nov:
-- scripts/passkey-migration.sql. challenges: WebAuthn challenges already used (kept five minutes, so none is used twice).
CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, pass TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT);
CREATE INDEX IF NOT EXISTS passkeys_pass ON passkeys (pass);
CREATE TABLE IF NOT EXISTS challenges (value TEXT PRIMARY KEY, at INTEGER NOT NULL);
-- The front door (server/stages.js, 14 Nov), on Longy's D1 only: the list of artists' stages (each a Durable Object of
-- its own at <id>.thenutpub.com) and the passkey that opens each, its public key only. Added: scripts/stages-migration.sql
CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stage_keys (id TEXT PRIMARY KEY, stage TEXT NOT NULL, pubkey TEXT NOT NULL, alg INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT);
CREATE INDEX IF NOT EXISTS stage_keys_stage ON stage_keys (stage);
-- The artist's passkey (session 53, 22 Nov): one passkey on thenutpub.com opens every stage it starts. stage_keys (one
-- passkey, one stage) was copied into these and nothing reads it now. artist_keys: the passkey's public key and the name
-- the page gave it ("NutPub · Artist · 22 Nov"), nothing about the person. key_stages: which stages it opens, and as what
-- (artist; producer and mod after session 55). artist_links: a link code per browser (its SHA-256), which can only add
-- the stage that browser starts, never open one. stage_claims: a stage started before its passkey was made, and the
-- SHA-256 of the code its browser keeps, so the passkey made later adds it. Added: scripts/artist-keys-migration.sql
CREATE TABLE IF NOT EXISTS artist_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', pubkey TEXT NOT NULL,
  alg INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, used TEXT,
  artist TEXT);
CREATE TABLE IF NOT EXISTS key_stages (key TEXT NOT NULL, stage TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'artist',
  created TEXT NOT NULL, PRIMARY KEY (key, stage));
CREATE INDEX IF NOT EXISTS key_stages_stage ON key_stages (stage);
CREATE TABLE IF NOT EXISTS artist_links (hash TEXT PRIMARY KEY, key TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS artist_links_key ON artist_links (key);
CREATE TABLE IF NOT EXISTS stage_claims (stage TEXT PRIMARY KEY, hash TEXT NOT NULL);
-- Session 54b (22 Nov): a passkey added from another device. artist_keys.artist: the artist it belongs to (the first
-- passkey's id), which key_stages.key holds, so an artist's passkeys open the same gigs. artist_adds: the SHA-256 of a
-- code a device with the passkey shows for 5 minutes (until, in ms), spent once. Added: scripts/add-device-migration.sql
-- (no index on artist here: stages run this file on tables made before the column).
CREATE TABLE IF NOT EXISTS artist_adds (hash TEXT PRIMARY KEY, artist TEXT NOT NULL, until INTEGER NOT NULL);
