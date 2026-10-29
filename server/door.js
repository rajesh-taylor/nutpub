// The night around the set: the door (a privacy ticket and its first drink), the stage (doors, on, closed), the bar's
// key and the live chat. A ticket is two locked payments from the phone: the artist's part to the artist's key, and
// the drink to the bar's key with a locktime at last orders and a refund to the artist's key (NUT-11), so an
// unpoured drink becomes the artist's and the mint, not this server, enforces it. Nothing here holds a sat.
import QRCode from 'qrcode';
import { SITE_URL } from './config.js';
import { db, kv } from './db.js';
import { cashuGate } from './gate.js';
import { currentShow, ticketSplit, lastOrdersAt } from './shows.js';
import { artistKey } from './takings.js';

const COMPRESSED = /^0[23][0-9a-f]{64}$/;
export const barKey = () => kv.get('barKey');

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (pass TEXT PRIMARY KEY, sats INTEGER NOT NULL, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS drinks (id INTEGER PRIMARY KEY, pass TEXT UNIQUE NOT NULL, locked INTEGER NOT NULL, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL, pass TEXT, sats INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
`);
const getTicket = db.prepare('SELECT sats FROM tickets WHERE pass = ?');
const getDrink = db.prepare(`SELECT d.id, l.token, l.collected_at FROM drinks d JOIN locked l ON l.id = d.locked WHERE d.pass = ?`);
export const hasTicket = (pass) => !!getTicket.get(pass);
const now = () => new Date().toISOString();
const show = () => currentShow().show;

// A message for the live chat: plain text, one line, 140 characters at most. Shown as text, never as HTML.
const clip = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140);
export function addMessage(pass, text, sats = 0) {
  const t = clip(text);
  if (!t && !sats) return null;
  return db.prepare('INSERT INTO messages (at, pass, sats, text) VALUES (?, ?, ?, ?)').run(now(), pass, sats, t).lastInsertRowid;
}
// The X-Message header on a tip: URI-encoded, so any language survives the header.
export const tipMessage = (req) => { try { return decodeURIComponent(req.get('X-Message') || ''); } catch { return ''; } };

export function mountDoor(app, admin, json, pass) {
  // ---- The stage: 'doors' (chat open, the set waits), 'on' (stage lights, then the set), 'closed' (last orders).
  const STAGES = ['doors', 'on', 'closed'];
  app.get('/api/stage', (_req, res) => res.json({ stage: kv.get('stage', 'doors') }));
  app.post('/api/admin/stage', admin, json, (req, res) => {
    if (!STAGES.includes(req.body?.stage)) return res.status(400).json({ error: 'bad_stage' });
    res.json({ stage: kv.set('stage', req.body.stage) });
  });

  // A new night, for a rehearsal: every phone back to the door, the chat empty, doors open. Payments already locked
  // stay as they are: they belong to the artist and the bar, to collect.
  app.post('/api/admin/new-night', admin, (_req, res) => {
    db.exec('DELETE FROM tickets; DELETE FROM drinks; UPDATE messages SET deleted = 1;');
    kv.set('nightStart', now()); // page 3 counts tonight's takings from here
    kv.set('stage', 'doors');
    res.json({ stage: 'doors' });
  });

  // ---- The bar's key: made on the bar's page, in its own browser; only the public half comes here.
  app.put('/api/admin/bar-key', admin, json, (req, res) => {
    const pubkey = String(req.body?.pubkey || '').toLowerCase();
    if (!COMPRESSED.test(pubkey)) return res.status(400).json({ error: 'bad_key', detail: 'a 33-byte compressed public key, in hex' });
    res.json({ pubkey: kv.set('barKey', pubkey) });
  });

  // ---- The door, step 1: the artist's part of the ticket. Paid already: in (a retry is safe).
  const ticketOn = (_req, res, next) => (show().ticket.on && show().ticket.price ? next()
    : res.status(409).json({ error: 'not_ready', detail: 'No ticket price set yet.' }));
  app.get('/api/door/ticket', pass, ticketOn,
    (req, res, next) => (hasTicket(req.pass) ? res.json({ in: true }) : next()),
    cashuGate(() => ticketSplit().artist, () => `${show().title || 'The show'}: privacy ticket`, { lockTo: artistKey, kind: 'ticket' }),
    (req, res) => {
      db.prepare('INSERT OR IGNORE INTO tickets (pass, sats, at) VALUES (?, ?, ?)').run(req.pass, req.paid, now());
      res.json({ in: true });
    });

  // ---- The door, step 2: the first drink, locked to the bar's key until last orders, then the artist's.
  const drinkTags = () => [['locktime', String(lastOrdersAt() ?? '')], ['refund', artistKey()]].map((t) => (t[1] ? t : [t[0], null]));
  app.get('/api/door/drink', pass, ticketOn,
    (req, res, next) => {
      if (!hasTicket(req.pass)) return res.status(403).json({ error: 'no_ticket', detail: 'Pay for the ticket first.' });
      if (!ticketSplit().drink) return res.status(409).json({ error: 'no_drink' });
      const d = getDrink.get(req.pass);
      return d ? res.json({ drink: d.id }) : next();
    },
    cashuGate(() => ticketSplit().drink, () => 'Your first drink', { lockTo: barKey, tags: drinkTags, kind: 'drink', owner: () => 'the bar' }),
    (req, res) => {
      const id = db.prepare('INSERT INTO drinks (pass, locked, at) VALUES (?, ?, ?)').run(req.pass, req.lockedId, now()).lastInsertRowid;
      res.json({ drink: Number(id) });
    });

  // What this phone holds: its ticket, and its drink (poured once the bar has collected it).
  app.get('/api/door/me', pass, (req, res) => {
    const d = getDrink.get(req.pass);
    res.json({ ticket: hasTicket(req.pass), drink: d ? { id: d.id, poured: !!d.collected_at } : null });
  });

  // The drink's QR: the bar's page with the drink's number only (the token never leaves the server's sealed list).
  app.get('/api/door/drink-qr.svg', async (req, res) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'bad_drink' });
    const link = `${SITE_URL || `${req.protocol}://${req.get('host')}`}/bar.html#d=${id}`;
    const svg = await QRCode.toString(link, { type: 'svg', margin: 1, color: { dark: '#050914', light: '#efe3c8' } });
    res.set('Cache-Control', 'no-cache').type('image/svg+xml').send(svg);
  });

  // ---- The bar: one drink by its number (the QR on the phone carries only that), with its locked token.
  app.get('/api/admin/drinks/:id', admin, (req, res) => {
    const d = db.prepare('SELECT d.id, l.id AS locked, l.token, l.sats, l.pubkey, l.collected_at, l.collected_by FROM drinks d JOIN locked l ON l.id = d.locked WHERE d.id = ?')
      .get(Number(req.params.id));
    if (!d) return res.status(404).json({ error: 'no_drink' });
    res.json({ ...d, poured: !!d.collected_at });
  });
  app.get('/api/admin/drinks', admin, (_req, res) => {
    res.json(db.prepare(`SELECT d.id, l.id AS locked, l.token, l.sats, l.pubkey, l.collected_at, l.collected_by FROM drinks d
                         JOIN locked l ON l.id = d.locked ORDER BY d.id`).all().map((d) => ({ ...d, poured: !!d.collected_at })));
  });

  // ---- The live chat. Free messages: one per 10 s per phone. Tips with a message arrive through the tip routes.
  const lastSaid = new Map();
  app.post('/api/message', pass, json, (req, res) => {
    const t = Date.now();
    if (t - (lastSaid.get(req.pass) || 0) < 10_000) return res.status(429).json({ error: 'too_soon', detail: 'One message every 10 seconds.' });
    const id = addMessage(req.pass, req.body?.text);
    if (!id) return res.status(400).json({ error: 'empty' });
    lastSaid.set(req.pass, t);
    res.json({ id: Number(id) });
  });
  app.get('/api/messages', (req, res) => {
    const after = Number(req.query.after) || 0;
    const rows = db.prepare('SELECT id, pass, sats, text FROM messages WHERE id > ? AND deleted = 0 ORDER BY id DESC LIMIT 50').all(after);
    const tipped = db.prepare("SELECT COALESCE(SUM(sats), 0) AS s FROM locked WHERE kind = 'tip'").get().s;
    const gone = db.prepare('SELECT id FROM messages WHERE deleted = 1 AND id > ?').all(Math.max(after - 200, 0)).map((r) => r.id);
    res.json({
      messages: rows.reverse().map((m) => ({ id: m.id, sats: m.sats, text: m.text, who: `guest ${String(m.pass || '').slice(0, 4)}` })),
      deleted: gone, tipped, goals: show().goals.filter((g) => g.label && g.at),
    });
  });
  app.delete('/api/admin/messages/:id', admin, (req, res) => {
    db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });
}
