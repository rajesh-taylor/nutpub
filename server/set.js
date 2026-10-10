// The set: a recorded clip cut into 10-second pieces (scripts/cut-set.sh). Each piece's sound is its own 402,
// priced on the setup page; its picture goes only to a pass that has paid for that piece (no second charge).
// "Free, with tips" shows serve every piece without a 402. The tip button is a 402 of its own.
// Every 402 is locked to the artist's key (server/gate.js); the takings are in server/takings.js.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ROOT } from './config.js';
import { db } from './db.js';
import { cashuGate } from './gate.js';
import { currentShow } from './shows.js';
import { artistKey } from './takings.js';

const SET = `${ROOT}media/set`;
const pieces = () => { try { return JSON.parse(readFileSync(`${SET}/set.json`, 'utf8')).segments; } catch { return 0; } };
const MIN_TIP = 21; // mints keep a fee reserve when paying out over Lightning: a 1-sat tip could never leave
const MAX_PIECE = 100_000; // the set loops; n counts pieces played, n % pieces() is the file

db.exec(`
  CREATE TABLE IF NOT EXISTS passes (id TEXT PRIMARY KEY, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS paid (
    pass  TEXT NOT NULL,
    piece INTEGER NOT NULL,
    sats  INTEGER NOT NULL,
    at    TEXT NOT NULL,
    PRIMARY KEY (pass, piece)
  );
  CREATE TABLE IF NOT EXISTS tips (pass TEXT, sats INTEGER NOT NULL, at TEXT NOT NULL);
`);
const getPass = db.prepare('SELECT id FROM passes WHERE id = ?');
const hasPaid = db.prepare('SELECT 1 FROM paid WHERE pass = ? AND piece = ?');
const addPaid = db.prepare('INSERT OR IGNORE INTO paid (pass, piece, sats, at) VALUES (?, ?, ?, ?)');
const spent = db.prepare('SELECT COALESCE(SUM(sats), 0) AS sats FROM paid WHERE pass = ?');
const nextPiece = db.prepare('SELECT COALESCE(MAX(piece) + 1, 0) AS n FROM paid WHERE pass = ?');
const tipped = db.prepare('SELECT COALESCE(SUM(sats), 0) AS sats FROM tips WHERE pass = ?');

const now = () => new Date().toISOString();
const show = () => currentShow().show;
const free = () => show().stream.mode === 'free';

export function mountSet(app) {
  // A pass: this phone's place in the show. Free to get; it's what paid pieces are recorded against.
  app.post('/api/pass', (_req, res) => {
    const id = randomBytes(12).toString('hex');
    db.prepare('INSERT INTO passes (id, created) VALUES (?, ?)').run(id, now());
    res.json({ pass: id });
  });

  const pass = (req, res, next) => {
    req.pass = req.get('X-Pass') || '';
    if (!getPass.get(req.pass)) return res.status(403).json({ error: 'no_pass' });
    next();
  };
  const piece = (req, res, next) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PIECE) return res.status(400).json({ error: 'bad_piece' });
    if (!pieces()) return res.status(404).json({ error: 'no_set', detail: 'Run scripts/cut-set.sh first.' });
    req.piece = n;
    next();
  };
  const file = (req, kind) => `${kind}/seg-${String(req.piece % pieces()).padStart(3, '0')}.${kind === 'audio' ? 'wav' : 'mp4'}`;
  const send = (req, res, kind) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(file(req, kind), { root: SET });
  };

  // `next`: where this pass carries on. A reload must not start again at piece 0, or pieces already paid for
  // would replay free (charged once) and an empty pocket would look like it plays.
  app.get('/api/pass/me', pass, (req, res) =>
    res.json({ spent: spent.get(req.pass).sats, tipped: tipped.get(req.pass).sats, pieces: pieces(), next: nextPiece.get(req.pass).n }));

  // The sound for piece n. Already paid for it: the same piece again, charged once (a retry after a lost reply).
  app.get('/api/set/audio/:n', pass, piece,
    (req, res, next) => {
      if (free() || hasPaid.get(req.pass, req.piece)) return send(req, res, 'audio');
      if (!show().stream.price) return res.status(409).json({ error: 'not_ready', detail: 'No price per 10 s set yet.' });
      next();
    },
    cashuGate(() => show().stream.price, () => `${show().title || 'The set'}: 10 seconds`, { lockTo: artistKey, kind: 'piece' }),
    (req, res) => {
      addPaid.run(req.pass, req.piece, req.paid, now());
      send(req, res, 'audio');
    });

  // The picture for piece n: only for a pass that paid for that piece's sound.
  app.get('/api/set/video/:n', pass, piece, (req, res) => {
    if (!free() && !hasPaid.get(req.pass, req.piece)) {
      return res.status(403).json({ error: 'not_paid', detail: 'Pay for these 10 seconds first.' });
    }
    send(req, res, 'video');
  });

  // The tip button: its own 402, at the label and price set on the setup page.
  app.get('/api/tip', pass,
    (_req, res, next) => (show().tip.price ? next() : res.status(409).json({ error: 'not_ready', detail: 'No tip price set yet.' })),
    cashuGate(() => show().tip.price, () => show().tip.label || 'A tip', { lockTo: artistKey, kind: 'tip' }),
    (req, res) => {
      db.prepare('INSERT INTO tips (pass, sats, at) VALUES (?, ?, ?)').run(req.pass, req.paid, now());
      res.json({ tipped: req.paid, total: tipped.get(req.pass).sats });
    });

  // Tip sats, your amount: the viewer picks the amount; a 402 of its own for exactly that.
  app.get('/api/tip/:sats', pass,
    (req, res, next) => {
      const n = Number(req.params.sats);
      if (!Number.isInteger(n) || n > 1_000_000) return res.status(400).json({ error: 'bad_amount' });
      if (n < MIN_TIP) return res.status(400).json({ error: 'too_small', detail: `${MIN_TIP} sats or more` });
      req.amount = n;
      next();
    },
    cashuGate((req) => req.amount, (req) => `A tip of ${req.amount} sats`, { lockTo: artistKey, kind: 'tip' }),
    (req, res) => {
      db.prepare('INSERT INTO tips (pass, sats, at) VALUES (?, ?, ?)').run(req.pass, req.paid, now());
      res.json({ tipped: req.paid, total: tipped.get(req.pass).sats });
    });
}
