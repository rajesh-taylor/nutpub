// The night around the set: the door (a ticket and its first drink), the stage (doors, on, closed), the bar's key
// and the live chat. A ticket is two locked payments from the phone: the artist's part to the artist's key, and the
// drink to the bar's key with a locktime at last orders and a refund to the artist's key (NUT-11), so an unpoured
// drink becomes the artist's and the mint, not this server, enforces it. Nothing here holds a sat.
import QRCode from 'qrcode';
import { SITE_URL } from './config.js';
import { one, all, run, sql, batch, kv } from './db.js';
import { cashuGate } from './gate.js';
import { current, showOf, publicShow, ticketSplit, lastOrdersAt } from './shows.js';
import { liveNow } from './live.js';
import { artistKey } from './takings.js';
import { json, body, now } from './http.js';

const COMPRESSED = /^0[23][0-9a-f]{64}$/;
export const barKey = () => kv.get('barKey');

const DRINK = 'SELECT d.id, l.id AS locked, l.token, l.sats, l.pubkey, l.collected_at, l.collected_by FROM drinks d JOIN locked l ON l.id = d.locked';
export const hasTicket = async (pass) => !!(await one('SELECT 1 AS x FROM tickets WHERE pass = ?', pass));
const siteOf = (c) => SITE_URL || c.url.origin;

// A message for the live chat: plain text, one line, 140 characters at most. Shown as text, never as HTML.
const clip = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140);
export async function addMessage(pass, text, sats = 0) {
  const t = clip(text);
  if (!t && !sats) return null;
  return (await run('INSERT INTO messages (at, pass, sats, text) VALUES (?, ?, ?, ?)', now(), pass, sats, t)).meta.last_row_id;
}
// The X-Message header on a tip: URI-encoded, so any language survives the header.
export const tipMessage = (c) => { try { return decodeURIComponent(c.req.headers.get('X-Message') || ''); } catch { return ''; } };

const svg = (text) => new Response(text, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' } });

export function mountDoor(route, admin, pass) {
  // ---- The stage: 'doors' (chat open, the set waits), 'on' (stage lights, then the set), 'closed' (last orders).
  const STAGES = ['doors', 'on', 'closed'];
  // The stage, and whether the artist's stream is coming in (the live light).
  route('GET', '/api/stage', async (c) => {
    const [stage, live] = await Promise.all([kv.get('stage', 'doors'), showOf(c).then((show) => liveNow(show.page))]);
    return json({ stage, live });
  });
  route('POST', '/api/admin/stage', admin, async (c) => {
    const stage = (await body(c))?.stage;
    if (!STAGES.includes(stage)) return json({ error: 'bad_stage' }, 400);
    return json({ stage: await kv.set('stage', stage) });
  });

  // A new night, for a rehearsal: every phone back to the door, the chat empty, doors open. Payments already locked
  // stay as they are: they belong to the artist and the bar, to collect.
  route('POST', '/api/admin/new-night', admin, async () => {
    await batch([sql('DELETE FROM tickets'), sql('DELETE FROM drinks'), sql('DELETE FROM live_paid'), sql('UPDATE messages SET deleted = 1')]);
    await kv.set('nightStart', now()); // Takings counts tonight from here
    await kv.set('stage', 'doors');
    return json({ stage: 'doors' });
  });

  // ---- The bar's key: made in the bar's own browser; only the public half comes here.
  route('PUT', '/api/admin/bar-key', admin, async (c) => {
    const pubkey = String((await body(c))?.pubkey || '').toLowerCase();
    if (!COMPRESSED.test(pubkey)) return json({ error: 'bad_key', detail: 'a 33-byte compressed public key, in hex' }, 400);
    return json({ pubkey: await kv.set('barKey', pubkey) });
  });

  // ---- The door, step 1: the artist's part of the ticket. Paid already: in (a retry is safe).
  const ticketOn = async (c) => {
    const show = await showOf(c);
    return show.ticket.on && show.ticket.price ? null : json({ error: 'not_ready', detail: 'No ticket price set yet.' }, 409);
  };
  route('GET', '/api/door/ticket', pass, ticketOn,
    async (c) => ((await hasTicket(c.pass)) ? json({ in: true }) : null),
    cashuGate(async (c) => ticketSplit(await showOf(c)).artist, async (c) => `${(await showOf(c)).title || 'The show'}: privacy ticket`,
      { lockTo: artistKey, kind: 'ticket' }),
    async (c) => {
      await run('INSERT OR IGNORE INTO tickets (pass, sats, at) VALUES (?, ?, ?)', c.pass, c.paid, now());
      return json({ in: true });
    });

  // ---- The door, step 2: the first drink, locked to the bar's key until last orders, then the artist's.
  const drinkTags = async (c) => [['locktime', String(lastOrdersAt(await showOf(c)) ?? '')], ['refund', await artistKey()]]
    .map((t) => (t[1] ? t : [t[0], null]));
  route('GET', '/api/door/drink', pass, ticketOn,
    async (c) => {
      if (!(await hasTicket(c.pass))) return json({ error: 'no_ticket', detail: 'Pay for the ticket first.' }, 403);
      if (!ticketSplit(await showOf(c)).drink) return json({ error: 'no_drink' }, 409);
      const d = await one('SELECT id FROM drinks WHERE pass = ?', c.pass);
      return d ? json({ drink: d.id }) : null;
    },
    cashuGate(async (c) => ticketSplit(await showOf(c)).drink, () => 'Your first drink',
      { lockTo: barKey, tags: drinkTags, kind: 'drink', owner: () => 'the bar' }),
    async (c) => {
      const id = (await run('INSERT INTO drinks (pass, locked, at) VALUES (?, ?, ?)', c.pass, c.lockedId, now())).meta.last_row_id;
      return json({ drink: Number(id) });
    });

  // What this phone holds: its ticket, and its drink (poured once the bar has collected it).
  const heldBy = async (id) => {
    const d = await one(`${DRINK} WHERE d.pass = ?`, id);
    return { ticket: await hasTicket(id), drink: d ? { id: d.id, poured: !!d.collected_at } : null };
  };
  route('GET', '/api/door/me', pass, async (c) => json(await heldBy(c.pass)));

  // The drink's QR: the bar's page with the drink's number only (the token never leaves the server's sealed list).
  route('GET', '/api/door/drink-qr.svg', async (c) => {
    const id = Number(c.url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) return json({ error: 'bad_drink' }, 400);
    return svg(await QRCode.toString(`${siteOf(c)}/bar.html#d=${id}`, { type: 'svg', margin: 1, color: { dark: '#050914', light: '#efe3c8' } }));
  });

  // ---- The bar: one drink by its number (the QR on the phone carries only that), with its locked token.
  route('GET', /^\/api\/admin\/drinks\/(?<id>\d+)$/, admin, async (c) => {
    const d = await one(`${DRINK} WHERE d.id = ?`, Number(c.params.id));
    if (!d) return json({ error: 'no_drink' }, 404);
    return json({ ...d, poured: !!d.collected_at });
  });
  route('GET', '/api/admin/drinks', admin, async () =>
    json((await all(`${DRINK} ORDER BY d.id`)).map((d) => ({ ...d, poured: !!d.collected_at }))));

  // ---- The live chat. Free messages: one per 10 s per phone. Tips with a message arrive through the tip routes.
  route('POST', '/api/message', pass, async (c) => {
    const last = await one('SELECT at FROM messages WHERE pass = ? AND sats = 0 ORDER BY id DESC LIMIT 1', c.pass);
    if (last && Date.now() - Date.parse(last.at) < 10_000) return json({ error: 'too_soon', detail: 'One message every 10 seconds.' }, 429);
    const id = await addMessage(c.pass, (await body(c))?.text);
    if (!id) return json({ error: 'empty' }, 400);
    return json({ id: Number(id) });
  });
  const chatSince = async (c, after) => {
    const [rows, tipped, gone, show] = await Promise.all([
      all('SELECT id, pass, sats, text FROM messages WHERE id > ? AND deleted = 0 ORDER BY id DESC LIMIT 50', after),
      // Tonight's tips only (since the last New night), so the stretch goal starts empty each night.
      kv.get('nightStart', '').then((since) => one("SELECT COALESCE(SUM(sats), 0) AS s FROM locked WHERE kind = 'tip' AND at >= ?", since)),
      all('SELECT id FROM messages WHERE deleted = 1 AND id > ?', Math.max(after - 60, 0)), // the page shows the last 60
      showOf(c),
    ]);
    return {
      messages: rows.reverse().map((m) => ({ id: m.id, sats: m.sats, text: m.text, who: `guest ${String(m.pass || '').slice(0, 4)}` })),
      deleted: gone.map((r) => r.id), tipped: tipped.s, goals: show.goals.filter((g) => g.label && g.at), thanks: show.goalsThanks || '',
    };
  };

  // The gig page's one request every 2 s: the stage, the live light, the chat since `after`, the show if it has
  // changed since `shown`, and with `door=1` this phone's drink. One request, to keep the free plan's daily limit.
  route('GET', '/api/tick', async (c) => {
    const q = c.url.searchParams;
    const { show, updated } = await current(c);
    const [stage, live, chat, door] = await Promise.all([
      kv.get('stage', 'doors'), liveNow(show.page), chatSince(c, Number(q.get('after')) || 0),
      q.get('door') ? heldBy(c.req.headers.get('X-Pass') || '') : null,
    ]);
    return json({ stage, live, ...chat, updated, ...(q.get('shown') === updated ? {} : { show: publicShow(show) }), ...(door ? { door } : {}) });
  });
  route('DELETE', /^\/api\/admin\/messages\/(?<id>\d+)$/, admin, async (c) => {
    await run('UPDATE messages SET deleted = 1 WHERE id = ?', Number(c.params.id));
    return json({ ok: true });
  });
}
