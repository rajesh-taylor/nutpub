// The background photo: one picture the account holder uploads on the setup page, shown dimmed behind the player.
// Kept in data/ (never in git; the repo is public). None uploaded: the viewer page uses the Berlin picks in
// public/img/ (also git-ignored), or plain midnight if those aren't there either.
import express from 'express';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { DATA } from './config.js';
import { kv } from './db.js';

const MAX = 5 * 1024 * 1024; // 5 MB: plenty for a phone photo, small enough for a phone to load
// The file says what it is in its first bytes; the Content-Type header is only the browser's guess.
const kinds = [
  { type: 'image/jpeg', ext: 'jpg', is: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', is: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', is: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

// { type, ext, at } or null
const current = () => kv.get('photo', null);
export const photoUrl = () => { const p = current(); return p ? `/api/show/photo?v=${Date.parse(p.at).toString(36)}` : null; };

export function mountPhoto(app, admin) {
  app.get('/api/show/photo', (_req, res) => {
    const p = current();
    if (!p) return res.status(404).json({ error: 'no_photo' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // the URL changes with every upload
    res.type(p.type).send(readFileSync(`${DATA}/photo.${p.ext}`));
  });

  app.put('/api/admin/photo', admin, express.raw({ type: () => true, limit: MAX }), (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty', detail: 'No photo came through.' });
    const kind = kinds.find((k) => k.is(buf));
    if (!kind) return res.status(400).json({ error: 'not_a_photo', detail: 'Use a JPEG, PNG or WebP photo.' });
    const old = current();
    writeFileSync(`${DATA}/photo.${kind.ext}`, buf);
    if (old && old.ext !== kind.ext) rmSync(`${DATA}/photo.${old.ext}`, { force: true });
    kv.set('photo', { type: kind.type, ext: kind.ext, at: new Date().toISOString() });
    res.json({ photo: photoUrl() });
  });

  // Back to the default photos.
  app.delete('/api/admin/photo', admin, (_req, res) => {
    const old = current();
    if (old) rmSync(`${DATA}/photo.${old.ext}`, { force: true });
    kv.set('photo', null);
    res.json({ photo: null });
  });

  // Too big: express.raw refuses before we see it; say so in words.
  app.use('/api/admin/photo', (err, _req, res, next) =>
    err?.type === 'entity.too.large' ? res.status(413).json({ error: 'too_big', detail: 'That photo is over 5 MB.' }) : next(err));
}
