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

// { type, at } or null
const current = () => kv.get('photo', null);
export const photoUrl = async () => { const p = await current(); return p ? `/api/show/photo?v=${Date.parse(p.at).toString(36)}` : null; };

export function mountPhoto(route, admin, store) {
  route('GET', '/api/show/photo', async () => {
    const p = await current();
    const bytes = p && (await store().get('photo', 'arrayBuffer'));
    if (!bytes) return json({ error: 'no_photo' }, 404);
    // The URL changes with every upload.
    return new Response(bytes, { headers: { 'Content-Type': p.type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  });

  route('PUT', '/api/admin/photo', admin, async (c) => {
    if (Number(c.req.headers.get('Content-Length')) > MAX) return json({ error: 'too_big', detail: 'That photo is over 5 MB.' }, 413);
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.length > MAX) return json({ error: 'too_big', detail: 'That photo is over 5 MB.' }, 413);
    if (!buf.length) return json({ error: 'empty', detail: 'No photo came through.' }, 400);
    const kind = kinds.find((k) => k.is(buf));
    if (!kind) return json({ error: 'not_a_photo', detail: 'Use a JPEG, PNG or WebP photo.' }, 400);
    await store().put('photo', buf);
    await kv.set('photo', { type: kind.type, at: now() });
    return json({ photo: await photoUrl() });
  });

  // Back to the default photos.
  route('DELETE', '/api/admin/photo', admin, async () => {
    await store().delete('photo');
    await kv.set('photo', null);
    return json({ photo: null });
  });
}
