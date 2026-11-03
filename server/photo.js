// The background photo: one picture the account holder uploads on the setup page, shown dimmed behind the player.
// Kept in Workers KV (never in git; the repo is public). None uploaded: the viewer page uses the Berlin picks in
// public/img/, or plain midnight if those aren't there either.
import { kv } from './db.js';
import { json, now } from './http.js';

const MAX = 5 * 1024 * 1024; // 5 MB: plenty for a phone photo, small enough for a phone to load
const starts = (b, bytes, at = 0) => bytes.every((x, i) => b[at + i] === x);
const ascii = (s) => [...s].map((ch) => ch.charCodeAt(0));
// The file says what it is in its first bytes; the Content-Type header is only the browser's guess.
const kinds = [
  { type: 'image/jpeg', is: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  { type: 'image/png', is: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: 'image/webp', is: (b) => starts(b, ascii('RIFF')) && starts(b, ascii('WEBP'), 8) },
];

// Four photos: two tall for phones, two wide for screens. tall1 keeps the name the one photo always had.
const SLOTS = ['tall1', 'tall2', 'wide1', 'wide2'];
const named = (slot) => (slot === 'tall1' ? 'photo' : `photo-${slot}`);
const urlOf = (slot, p) => p && `/api/show/photo${slot === 'tall1' ? '' : `/${slot}`}?v=${Date.parse(p.at).toString(36)}`;
// { type, at } or null
const current = (slot = 'tall1') => kv.get(named(slot), null);
export const photoUrl = async () => urlOf('tall1', await current());
export const photoUrls = async () => Object.fromEntries(await Promise.all(SLOTS.map(async (s) => [s, urlOf(s, await current(s))])));

export function mountPhoto(route, admin, store) {
  const serve = async (slot) => {
    const p = await current(slot);
    const bytes = p && (await store().get(named(slot), 'arrayBuffer'));
    if (!bytes) return json({ error: 'no_photo' }, 404);
    // The URL changes with every upload.
    return new Response(bytes, { headers: { 'Content-Type': p.type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  };
  const save = async (c, slot) => {
    if (Number(c.req.headers.get('Content-Length')) > MAX) return json({ error: 'too_big', detail: 'That photo is over 5 MB.' }, 413);
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.length > MAX) return json({ error: 'too_big', detail: 'That photo is over 5 MB.' }, 413);
    if (!buf.length) return json({ error: 'empty', detail: 'No photo came through.' }, 400);
    const kind = kinds.find((k) => k.is(buf));
    if (!kind) return json({ error: 'not_a_photo', detail: 'Use a JPEG, PNG or WebP photo.' }, 400);
    await store().put(named(slot), buf);
    await kv.set(named(slot), { type: kind.type, at: now() });
    return json({ photo: await photoUrl(), photos: await photoUrls() });
  };
  const drop = async (slot) => {
    await store().delete(named(slot));
    await kv.set(named(slot), null);
    return json({ photo: await photoUrl(), photos: await photoUrls() });
  };
  const one = /^\/api\/admin\/photo\/(?<slot>tall1|tall2|wide1|wide2)$/;

  route('GET', '/api/show/photo', () => serve('tall1'));
  route('GET', /^\/api\/show\/photo\/(?<slot>tall1|tall2|wide1|wide2)$/, (c) => serve(c.params.slot));
  route('PUT', '/api/admin/photo', admin, (c) => save(c, 'tall1'));
  route('PUT', one, admin, (c) => save(c, c.params.slot));
  // Back to the default photos.
  route('DELETE', '/api/admin/photo', admin, () => drop('tall1'));
  route('DELETE', one, admin, (c) => drop(c.params.slot));
}
