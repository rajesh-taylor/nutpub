// Moderators: a private link each, made and cancelled by the artist on Gig Set Up, each with an icon the artist picks.
// One of them is the main mod (the first made, unless the artist picks another), who may also change the pinned
// message over the chat. The link opens the gig page with a
// key of its own (#mod=<key>), and that key does only this: see the stream before the start time, never pay for it,
// post links, delete messages and turn slow mode on or off. Never setup, Takings or the stream key. The server keeps
// only the key's SHA-256, so a copy of the database can't be used as a mod's link.
import { one, all, run, sql, batch, kv } from './db.js';
import { json, body, randomHex, now } from './http.js';

const MAX_MODS = 5;
export const ICONS = ['🎸', '🎤', '🥁', '🎹', '🎷', '🎺', '🎻', '🎧', '🎶', '🥜', '₿'];
const iconOf = (v, fallback = ICONS[0]) => (ICONS.includes(v) ? v : fallback);
const utf8 = new TextEncoder();
const hash = async (key) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(key)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

// The mod behind this request's X-Mod header, or null. Read once per request.
export const modOf = (c) => (c.mod ??= (async () => {
  const key = c.req.headers.get('X-Mod') || '';
  if (!/^[0-9a-f]{32}$/.test(key)) return null;
  return one('SELECT id, name, icon, main FROM mods WHERE key_hash = ?', await hash(key));
})());

// A link in a message: http(s), www., or a bare name.tld. Guests may not post one; mods may.
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|uk|me|app|xyz|link|ly|gg|tv|fm|shop|store|info|biz|music|band|live|events?)\b(?:\/\S*)?/i;
export const hasLink = (text) => LINK.test(String(text || ''));

// Slow mode: one message every 30 s per guest instead of every 10 s. Mods are never slowed.
export const slowMode = () => kv.get('slow', false);
export const SLOW = 30_000;
export const NORMAL = 10_000;

// The pinned message over the chat: set by the artist on Gig Set Up, or by the main mod. Links are allowed in it.
export const pinned = () => kv.get('pin', '');
const setPin = (text) => kv.set('pin', String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140));
// Exactly one main mod while there are any: the one marked, else the first made.
async function oneMain() {
  if (await one('SELECT 1 AS x FROM mods WHERE main = 1')) return;
  await run('UPDATE mods SET main = 1 WHERE id = (SELECT MIN(id) FROM mods)');
}

export function mountMods(route, admin) {
  const mod = async (c) => ((await modOf(c)) ? null : json({ error: 'not_mod', detail: 'This mod link has been cancelled.' }, 403));

  // ---- The artist, on Gig Set Up.
  route('GET', '/api/admin/mods', admin, async () => json({ mods: await all('SELECT id, name, icon, main, created FROM mods ORDER BY id'), icons: ICONS, pin: await pinned() }));
  route('PUT', '/api/admin/pin', admin, async (c) => json({ pin: await setPin((await body(c))?.text) }));
  route('POST', '/api/admin/mods', admin, async (c) => {
    const b = await body(c);
    const name = String(b?.name ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 24);
    if (!name) return json({ error: 'no_name', detail: 'Give the moderator a name.' }, 400);
    if ((await one('SELECT COUNT(*) AS n FROM mods')).n >= MAX_MODS) return json({ error: 'too_many', detail: `${MAX_MODS} moderators at most.` }, 409);
    const key = randomHex(16);
    const id = (await run('INSERT INTO mods (name, key_hash, created, icon) VALUES (?, ?, ?, ?)', name, await hash(key), now(), iconOf(b?.icon))).meta.last_row_id;
    await oneMain();
    return json({ id: Number(id), name, key }); // the key leaves the server this once
  });
  route('DELETE', /^\/api\/admin\/mods\/(?<id>\d+)$/, admin, async (c) => {
    await run('DELETE FROM mods WHERE id = ?', Number(c.params.id));
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
  route('GET', '/api/mod/me', mod, async (c) => { const m = await modOf(c); return json({ name: m.name, icon: m.icon, main: !!m.main, slow: await slowMode() }); });
  route('POST', '/api/mod/pin', mod, async (c) => ((await modOf(c)).main
    ? json({ pin: await setPin((await body(c))?.text) }) : json({ error: 'not_main', detail: 'Only the main mod can change the pinned message.' }, 403)));
  route('DELETE', /^\/api\/mod\/messages\/(?<id>\d+)$/, mod, async (c) => {
    await run('UPDATE messages SET deleted = 1 WHERE id = ?', Number(c.params.id));
    return json({ ok: true });
  });
  route('POST', '/api/mod/slow', mod, async (c) => json({ slow: await kv.set('slow', (await body(c))?.on === true) }));
}
