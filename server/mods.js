// Moderators: a private link each, made and cancelled by the artist on Plan gig, each with an icon the artist picks.
// One of them is the main mod (the first made, unless the artist picks another), who may also change the pinned
// message over the chat. The link opens the gig page with a
// key of its own (#mod=<key>), and that key does only this: see the stream before the start time, never pay for it,
// post links, delete messages and turn slow mode on or off. Never setup, Takings or the stream key. The server keeps
// only the key's SHA-256, so a copy of the database can't be used as a mod's link.
//
// Session 55b: moderators by invite. Cellar's Invite a moderator makes a link that works once, for 7 days (a `crew` row,
// role 'mod', crew.js), and the link opens the gig page itself. Saying yes there with Nostr Sign In ties the invite to
// their npub (crew.npub); saying yes with a passkey on thenutpub.com/crew gives each of their browsers a key of its own
// (crew_keys, 16 bytes, its SHA-256 kept), sent as X-Mod like a link's key. Either way they get a row here (key_hash
// 'crew:…', never a SHA-256, so no link can match it), so the chat, the icon and the main mod work as before. Links made
// before 55b keep working until the artist cancels them.
import { one, all, run, sql, batch, kv, stageDb } from './db.js';
import { json, body, randomHex, now } from './http.js';

export const MAX_MODS = 3; // one main mod and two helpers (Rajesh 21 Nov); invites still waiting count too
export const ICONS = ['🎸', '🎤', '🥁', '🎹', '🎷', '🎺', '🎻', '🎧', '🎶', '🥜', '₿'];
export const iconOf = (v, fallback = ICONS[0]) => (ICONS.includes(v) ? v : fallback);
const utf8 = new TextEncoder();
const hash = async (key) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(key)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

const onStage = () => !!stageDb()?.id; // the crew tables live on artists' stages only, not Longy's own (D1)
const BY_CREW = "SELECT m.id, m.name, m.icon, m.main FROM crew c JOIN mods m ON m.id = c.mod WHERE c.role = 'mod'";
// The mod behind this request, or null. Read once per request. X-Mod: a link's key, or a passkey mod's browser key.
// No key: a Nostr mod, whose pass (X-Pass) signed in with the npub their invite was tied to (nostr.js).
export const modOf = (c) => (c.mod ??= (async () => {
  const key = c.req.headers.get('X-Mod') || '';
  if (/^[0-9a-f]{32}$/.test(key)) {
    const h = await hash(key);
    const link = await one('SELECT id, name, icon, main FROM mods WHERE key_hash = ?', h);
    if (link) return { ...link, via: 'link' };
    const m = onStage() ? await one(`${BY_CREW} AND c.id = (SELECT crew FROM crew_keys WHERE hash = ?)`, h) : null;
    if (m) return { ...m, via: 'passkey', keyHash: h };
  }
  const pass = c.req.headers.get('X-Pass') || '';
  if (!onStage() || !/^[0-9a-f]{16,64}$/.test(pass)) return null;
  const m = await one(`${BY_CREW} AND c.npub = (SELECT pubkey FROM nostr WHERE pass = ?)`, pass);
  return m ? { ...m, nostr: true, via: 'nostr' } : null;
})());
// A mod is on (session 55c) while their gig page is open: its tick says so, written at most every 20 s. On a free
// stream that opens free comments (chat.js).
export const MOD_ON_MS = 90_000;
export async function modSeen(at = Date.now()) { if (at - (await kv.get('modSeen', 0)) > 20_000) await kv.set('modSeen', at); }
export const modOnline = async (at = Date.now()) => at - (await kv.get('modSeen', 0)) < MOD_ON_MS;
// A Nostr mod's row, by their public key (hex), or null.
export const modByPubkey = async (pubkey) => (onStage() && pubkey ? one(`${BY_CREW} AND c.npub = ?`, pubkey) : null);
// A mod by invite says yes (crew.js): their row in the chat's list, the next icon if theirs is taken.
export async function addInvitedMod(name, icon) {
  const id = Number((await run('INSERT INTO mods (name, key_hash, created, icon) VALUES (?, ?, ?, ?)', name, `crew:${randomHex(16)}`, now(), iconOf(icon))).meta.last_row_id);
  await oneMain();
  return id;
}
// How many mods there are, invites still waiting included: three at most.
export async function modCount(at = Date.now()) {
  const { n } = await one('SELECT COUNT(*) AS n FROM mods');
  if (!onStage()) return n;
  return n + (await one("SELECT COUNT(*) AS n FROM crew WHERE role = 'mod' AND mod IS NULL AND until >= ?", at)).n;
}

// A link in a message: http(s), www., or a bare name.tld. Guests may not post one; mods may.
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|uk|me|app|xyz|link|ly|gg|tv|fm|shop|store|info|biz|music|band|live|events?)\b(?:\/\S*)?/i;
export const hasLink = (text) => LINK.test(String(text || ''));

// Slow mode: one message every 30 s per guest instead of every 10 s. Mods are never slowed. A mod turns it on or off;
// since session 55c a busy chat also turns it on by itself (BUSY free guest messages in a minute), and it goes off
// AUTO_MS after the last busy minute. A mod's off wins for HELD_MS (the busy chat doesn't turn it straight back on).
export const SLOW = 30_000;
export const NORMAL = 10_000;
export const BUSY = 15;
export const AUTO_MS = 5 * 60_000;
export const HELD_MS = 10 * 60_000;
export const slowBusy = async (at = Date.now()) => !(await kv.get('slow', false)) && (await kv.get('slowAuto', 0)) > at;
export const slowMode = async (at = Date.now()) => (await kv.get('slow', false)) || (await kv.get('slowAuto', 0)) > at;
// After a free message: is the chat busy? Hidden lines (a quiet phone's) don't count.
export async function noteBusy(at = Date.now()) {
  if (at < (await kv.get('slowHeld', 0))) return;
  const { n } = await one('SELECT COUNT(*) AS n FROM messages WHERE sats = 0 AND mod IS NULL AND deleted = 0 AND at >= ?', new Date(at - 60_000).toISOString());
  if (n >= BUSY) await kv.set('slowAuto', at + AUTO_MS);
}
const setSlow = async (on, at = Date.now()) => {
  if (on) await kv.set('slow', true);
  else await batch([sql("DELETE FROM kv WHERE key IN ('slow', 'slowAuto')"), sql("INSERT INTO kv (key, value) VALUES ('slowHeld', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(at + HELD_MS))]);
  return { slow: await slowMode(at), busy: await slowBusy(at) };
};

// The pinned message over the chat: set by the artist on Plan gig, or by the main mod. Links are allowed in it.
export const pinned = () => kv.get('pin', '');
const setPin = (text) => kv.set('pin', String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140));
// Exactly one main mod while there are any: the one marked, else the first made.
export async function oneMain() {
  if (await one('SELECT 1 AS x FROM mods WHERE main = 1')) return;
  await run('UPDATE mods SET main = 1 WHERE id = (SELECT MIN(id) FROM mods)');
}

// An example gig's moderators (setlist.js: Aaron of Essex on Longy's gig): named on Plan gig and in the chat, with no
// link. Their key_hash is 'seed:…', never a SHA-256, so no link can ever match one; the artist may delete them.
export async function seedMods(list = []) {
  await run("DELETE FROM mods WHERE key_hash LIKE 'seed:%'");
  for (const m of list) await run('INSERT INTO mods (name, key_hash, created, icon) VALUES (?, ?, ?, ?)', m.name, `seed:${randomHex(16)}`, now(), iconOf(m.icon));
  await oneMain();
}

export function mountMods(route, admin, crew = admin) { // crew: the artist or their producer (session 55)
  const mod = async (c) => ((await modOf(c)) ? null : json({ error: 'not_mod', detail: 'You’re no longer a mod on this gig.' }, 403));

  // ---- The artist, on Plan gig.
  // via: how each one signs in: 'seed' (an example gig's, scripted), 'link' (made before 55b), 'passkey' or 'nostr'
  // (by invite; crew: their crew row's id, for Remove).
  route('GET', '/api/admin/mods', crew, async () => {
    const mods = await all("SELECT id, name, icon, main, created, key_hash LIKE 'seed:%' AS seed, key_hash LIKE 'crew:%' AS invited FROM mods ORDER BY id");
    const by = onStage() ? new Map((await all("SELECT id, mod, who, npub FROM crew WHERE role = 'mod' AND mod IS NOT NULL")).map((r) => [r.mod, r])) : new Map();
    return json({ mods: mods.map(({ invited, ...m }) => {
      const r = by.get(m.id);
      return { ...m, via: m.seed ? 'seed' : r ? (r.who ? 'passkey' : 'nostr') : invited ? 'gone' : 'link', ...(r ? { crew: r.id } : {}) };
    }), icons: ICONS, pin: await pinned(), max: MAX_MODS });
  });
  route('PUT', '/api/admin/pin', crew, async (c) => json({ pin: await setPin((await body(c))?.text) }));
  route('POST', '/api/admin/mods', admin, async (c) => {
    const b = await body(c);
    const name = String(b?.name ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 24);
    if (!name) return json({ error: 'no_name', detail: 'Give the moderator a name.' }, 400);
    if ((await modCount()) >= MAX_MODS) return json({ error: 'too_many', detail: `${MAX_MODS} moderators at most.` }, 409);
    const key = randomHex(16);
    const id = (await run('INSERT INTO mods (name, key_hash, created, icon) VALUES (?, ?, ?, ?)', name, await hash(key), now(), iconOf(b?.icon))).meta.last_row_id;
    await oneMain();
    return json({ id: Number(id), name, key }); // the key leaves the server this once
  });
  route('DELETE', /^\/api\/admin\/mods\/(?<id>\d+)$/, admin, async (c) => {
    const id = Number(c.params.id);
    // A mod by invite goes with their crew row and browser keys (Cellar removes them through crew.js, which also takes
    // their passkey off this gig; Back to your gigs tidies that up if this route is used instead).
    if (onStage()) await batch([sql("DELETE FROM crew_keys WHERE crew IN (SELECT id FROM crew WHERE role = 'mod' AND mod = ?)", id), sql("DELETE FROM crew WHERE role = 'mod' AND mod = ?", id)]);
    await run('DELETE FROM mods WHERE id = ?', id);
    await oneMain();
    return json({ ok: true });
  });
  // A mod's icon, or making them the main mod.
  route('POST', /^\/api\/admin\/mods\/(?<id>\d+)$/, admin, async (c) => {
    const b = await body(c);
    const id = Number(c.params.id);
    if (b?.icon) await run('UPDATE mods SET icon = ? WHERE id = ?', iconOf(b.icon), id);
    if (b?.main === true) await batch([sql('UPDATE mods SET main = 0'), sql('UPDATE mods SET main = 1 WHERE id = ?', id)]);
    await oneMain();
    return json({ ok: true });
  });

  // ---- The mod, on the gig page.
  route('GET', '/api/mod/me', mod, async (c) => { const m = await modOf(c); await modSeen(); return json({ name: m.name, icon: m.icon, main: !!m.main, slow: await slowMode(), busy: await slowBusy(), via: m.via, ...(m.nostr ? { nostr: true } : {}) }); });
  // Sign out (a passkey mod, session 55b: a shared phone at the venue): this browser's key stops working. "I'm a mod"
  // signs them in again. A link's key isn't touched: the link is still theirs.
  route('DELETE', '/api/mod/me', mod, async (c) => {
    const m = await modOf(c);
    if (m.via === 'passkey') await run('DELETE FROM crew_keys WHERE hash = ?', m.keyHash);
    return json({ ok: true });
  });
  route('POST', '/api/mod/pin', mod, async (c) => ((await modOf(c)).main
    ? json({ pin: await setPin((await body(c))?.text) }) : json({ error: 'not_main', detail: 'Only the main mod can change the pinned message.' }, 403)));
  route('DELETE', /^\/api\/mod\/messages\/(?<id>\d+)$/, mod, async (c) => {
    await run('UPDATE messages SET deleted = 1 WHERE id = ?', Number(c.params.id));
    return json({ ok: true });
  });
  route('POST', '/api/mod/slow', mod, async (c) => json(await setSlow((await body(c))?.on === true)));
}
