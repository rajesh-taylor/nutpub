// The set: a recorded clip cut into 10-second pieces (scripts/cut-set.sh). Each piece's sound is its own 402,
// priced on the setup page; its picture goes only to a pass that has paid for that piece (no second charge).
// "Free, with tips" shows serve every piece without a 402. The tip button is a 402 of its own.
// The pieces ship with the site's files under /set-media/, which the Worker serves only through these routes.
// Every 402 is locked to the artist's key (server/gate.js); the takings are in server/takings.js.
import { ASSETS } from './config.js';
import { one, run } from './db.js';
import { cashuGate } from './gate.js';
import { showOf, piecePrice } from './shows.js';
import { artistKey } from './takings.js';
import { hasTicket, addMessage, tipMessage, noGuestLinks } from './door.js';
import { modOf, hasLink } from './mods.js';
import { nostrOf, handle } from './nostr.js';
import { nutzapInfo, checkNutzap, tokenProofs, recordNutzap, WHY } from './nutzap.js';
import { json, body, randomHex, now } from './http.js';

const MIN_TIP = 21; // mints keep a fee reserve when paying out over Lightning: a 1-sat tip could never leave
const MAX_PIECE = 100_000; // the set loops; n counts pieces played, n % pieces() is the file

let segments = null;
const pieces = async (c) => {
  if (segments == null) {
    const res = await ASSETS.fetch(new URL('/set-media/set.json', c.url));
    segments = res.ok ? (await res.json()).segments : 0;
  }
  return segments;
};
const free = async (c) => (await showOf(c)).stream.mode === 'free';
const hasPaid = async (pass, piece) => !!(await one('SELECT 1 AS x FROM paid WHERE pass = ? AND piece = ?', pass, piece));
const tipped = async (pass) => (await one('SELECT COALESCE(SUM(sats), 0) AS sats FROM tips WHERE pass = ?', pass)).sats;

export function mountSet(route) {
  // A pass: this phone's place in the show. Free to get; it's what paid pieces are recorded against.
  route('POST', '/api/pass', async () => {
    const id = randomHex(12);
    await run('INSERT INTO passes (id, created) VALUES (?, ?)', id, now());
    return json({ pass: id });
  });

  const pass = async (c) => {
    c.pass = c.req.headers.get('X-Pass') || '';
    if (!(await one('SELECT id FROM passes WHERE id = ?', c.pass))) return json({ error: 'no_pass' }, 403);
    return null;
  };
  const piece = async (c) => {
    const n = Number(c.params.n);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PIECE) return json({ error: 'bad_piece' }, 400);
    if (!(await pieces(c))) return json({ error: 'no_set', detail: 'Run scripts/cut-set.sh first.' }, 404);
    c.piece = n;
    return null;
  };
  const send = async (c, kind) => {
    const file = `/set-media/${kind}/seg-${String(c.piece % (await pieces(c))).padStart(3, '0')}.${kind === 'audio' ? 'wav' : 'mp4'}`;
    const res = await ASSETS.fetch(new URL(file, c.url));
    if (!res.ok) return json({ error: 'no_set' }, 404);
    return new Response(res.body, { headers: { 'Content-Type': res.headers.get('Content-Type'), 'Cache-Control': 'no-store' } });
  };

  // `next`: where this pass carries on. A reload must not start again at piece 0, or pieces already paid for
  // would replay free (charged once) and an empty pocket would look like it plays.
  route('GET', '/api/pass/me', pass, async (c) => {
    const [spent, next, live] = await Promise.all([
      one('SELECT COALESCE(SUM(sats), 0) AS sats FROM paid WHERE pass = ?', c.pass),
      one('SELECT COALESCE(MAX(piece) + 1, 0) AS n FROM paid WHERE pass = ?', c.pass),
      one('SELECT COALESCE(SUM(sats), 0) AS sats FROM live_paid WHERE pass = ?', c.pass),
    ]);
    return json({ spent: spent.sats, live: live.sats, tipped: await tipped(c.pass), pieces: await pieces(c), next: next.n });
  });

  // The sound for piece n. Already paid for it: the same piece again, charged once (a retry after a lost reply).
  route('GET', /^\/api\/set\/audio\/(?<n>\d+)$/, pass, piece,
    async (c) => {
      if ((await free(c)) || (await hasTicket(c.pass)) || (await hasPaid(c.pass, c.piece))) return send(c, 'audio'); // a ticket plays the set
      if (!(await showOf(c)).stream.perMinute) return json({ error: 'not_ready', detail: 'No price a minute set yet.' }, 409);
      return null;
    },
    cashuGate(async (c) => piecePrice(await showOf(c)), async (c) => `${(await showOf(c)).title || 'The set'}: 10 seconds`,
      { lockTo: artistKey, kind: 'piece' }),
    async (c) => {
      await run('INSERT OR IGNORE INTO paid (pass, piece, sats, at) VALUES (?, ?, ?, ?)', c.pass, c.piece, c.paid, now());
      return send(c, 'audio');
    });

  // The picture for piece n: only for a pass that paid for that piece's sound.
  route('GET', /^\/api\/set\/video\/(?<n>\d+)$/, pass, piece, async (c) => {
    if (!(await free(c)) && !(await hasTicket(c.pass)) && !(await hasPaid(c.pass, c.piece))) {
      return json({ error: 'not_paid', detail: 'Pay for these 10 seconds first.' }, 403);
    }
    return send(c, 'video');
  });

  const thanks = async (c) => {
    await run('INSERT INTO tips (pass, sats, at) VALUES (?, ?, ?)', c.pass, c.paid, now());
    await addMessage(c.pass, tipMessage(c), c.paid, await modOf(c)); // in the live chat, highlighted, with or without words
    return json({ tipped: c.paid, total: await tipped(c.pass) });
  };

  // The tip button: its own 402, at the label and price set on the setup page.
  route('GET', '/api/tip', pass, noGuestLinks(tipMessage),
    async (c) => ((await showOf(c)).tip.price ? null : json({ error: 'not_ready', detail: 'No tip price set yet.' }, 409)),
    cashuGate(async (c) => (await showOf(c)).tip.price, async (c) => (await showOf(c)).tip.label || 'A tip', { lockTo: artistKey, kind: 'tip' }),
    thanks);

  // Tip sats, your amount: the viewer picks the amount; a 402 of its own for exactly that.
  route('GET', /^\/api\/tip\/(?<sats>[^/]+)$/, pass, noGuestLinks(tipMessage),
    async (c) => {
      const n = Number(c.params.sats);
      if (!Number.isInteger(n) || n > 1_000_000) return json({ error: 'bad_amount' }, 400);
      if (n < MIN_TIP) return json({ error: 'too_small', detail: `${MIN_TIP} sats or more` }, 400);
      c.amount = n;
      return null;
    },
    cashuGate((c) => c.amount, (c) => `A tip of ${c.amount} sats`, { lockTo: artistKey, kind: 'tip' }),
    thanks);

  // A Nutzap (NIP-61, server/nutzap.js): a tip of n sats with the fan's signed public note. First POST, no payment: the
  // 402. Then the payment (X-Cashu) with the note (the body): the note checked against the payment, then the gate.
  route('POST', /^\/api\/nutzap\/(?<sats>[^/]+)$/, pass,
    async (c) => {
      const n = Number(c.params.sats);
      if (!Number.isInteger(n) || n > 1_000_000) return json({ error: 'bad_amount' }, 400);
      if (n < MIN_TIP) return json({ error: 'too_small', detail: `${MIN_TIP} sats or more` }, 400);
      c.amount = n;
      c.fan = await nostrOf(c.pass);
      if (!c.fan) return json({ error: 'not_signed_in', detail: 'Sign in with Nostr first: a Nutzap carries your name.' }, 403);
      c.zapTo = await nutzapInfo(await artistKey());
      if (!c.zapTo) return json({ error: 'not_ready', detail: 'This artist hasn’t turned Nutzaps on yet.' }, 409);
      const token = c.req.headers.get('X-Cashu')?.trim();
      if (!token) return null; // the 402
      c.zap = (await body(c))?.event;
      let proofs;
      try { proofs = await tokenProofs(token); } catch (e) { return json({ error: 'bad_token', detail: e.message }, 400); }
      const why = await checkNutzap(c.zap, { proofs, fan: c.fan.pubkey, artist: c.zapTo.pubkey });
      if (why) return json({ error: why, detail: WHY[why] }, 400);
      if (hasLink(c.zap.content) && !(await modOf(c))) return json({ error: 'no_links', detail: 'Links are for the moderators.' }, 400);
      return null;
    },
    cashuGate((c) => c.amount, (c) => `A Nutzap of ${c.amount} sats`, { lockTo: artistKey, kind: 'tip' }),
    async (c) => {
      await run('INSERT INTO tips (pass, sats, at) VALUES (?, ?, ?)', c.pass, c.paid, now());
      const id = await addMessage(c.pass, c.zap.content, c.paid);
      await recordNutzap(c.lockedId, id, c.zap, handle(c.fan));
      return json({ tipped: c.paid, total: await tipped(c.pass) });
    });
  return pass;
}
