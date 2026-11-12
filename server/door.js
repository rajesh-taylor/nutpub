// The night around the set: the door (a ticket and its first drink), the stage (doors, on, closed), the bar's key
// and the live chat. A ticket is two locked payments from the phone: the artist's part to the artist's key, and the
// drink to the bar's key with a locktime at last orders and a refund to the artist's key (NUT-11), so an unpoured
// drink becomes the artist's and the mint, not this server, enforces it. Nothing here holds a sat.
import QRCode from 'qrcode';
import { SITE_URL } from './config.js';
import { one, all, run, sql, batch, kv } from './db.js';
import { cashuGate } from './gate.js';
import { totpOk } from './totp.js';
import { current, showOf, publicShow, ticketSplit, lastOrdersAt, opensAt, stageNow, pollEvery, gigOver } from './shows.js';
import { liveNow, freeUntil } from './live.js';
import { artistKey } from './takings.js';
import { json, body, now, randomHex } from './http.js';
import { modOf, hasLink, slowMode, pinned, SLOW, NORMAL } from './mods.js';
import { nostrOf, handle } from './nostr.js';

const COMPRESSED = /^0[23][0-9a-f]{64}$/;
export const barKey = () => kv.get('barKey');

const DRINK = 'SELECT d.id, l.id AS locked, l.token, l.sats, l.pubkey, l.collected_at, l.collected_by FROM drinks d JOIN locked l ON l.id = d.locked';
export const hasTicket = async (pass) => !!(await one('SELECT 1 AS x FROM tickets WHERE pass = ?', pass));
const ticketOf = (pass) => one('SELECT kind, sats, at, code, secret, checked_at, (SELECT COUNT(*) FROM passkeys p WHERE p.pass = t.pass) AS keys FROM tickets t WHERE pass = ?', pass); // kind: 'room' | 'home'
const siteOf = (c) => SITE_URL || c.url.origin;

// A message for the live chat: plain text, one line, 140 characters at most. Shown as text, never as HTML.
const clip = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140);
export async function addMessage(pass, text, sats = 0, mod = null) {
  const t = clip(text);
  if (!t && !sats) return null;
  const nostr = mod ? null : handle(await nostrOf(pass)); // signed in with Nostr: their name goes with the message
  return (await run('INSERT INTO messages (at, pass, sats, text, mod, mod_icon, nostr) VALUES (?, ?, ?, ?, ?, ?, ?)', now(), pass, sats, t, mod?.name ?? null, mod?.icon ?? null, nostr)).meta.last_row_id;
}
// Before a guest's words go out, with a tip or without: links are for the moderators.
export const noGuestLinks = (text) => async (c) => (hasLink(await text(c)) && !(await modOf(c))
  ? json({ error: 'no_links', detail: 'Links are for the moderators.' }, 400) : null);
// The X-Message header on a tip: URI-encoded, so any language survives the header.
export const tipMessage = (c) => { try { return decodeURIComponent(c.req.headers.get('X-Message') || ''); } catch { return ''; } };

// ---- The door check (10 Nov, from the saved 9 Nov work, without the drink). Each room ticket has a door code of its
// own, never its pass (the pass is the ticket itself). The door link carries a key of its own: the server keeps only
// its SHA-256, and a new link cancels the old one. The artist's own browser opens the door page too.
const CODE = /^[0-9a-f]{24}$/;
const utf8 = new TextEncoder();
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const doorOn = async (c) => { const show = await showOf(c); return show.ticket.on && show.door.on; };

const svg = (text) => new Response(text, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' } });

export function mountDoor(route, admin, pass) {
  const doorman = async (c) => {
    const k = c.req.headers.get('X-Door') || '';
    if (/^[0-9a-f]{32}$/.test(k) && (await sha(k)) === (await kv.get('doorKey'))) return null;
    return admin(c) && json({ error: 'not_door', detail: k ? 'This door scanner has been replaced: ask the artist for the new one.' : 'This phone isn’t the door scanner yet: ask the artist for its QR or link.' }, 403);
  };
  route('GET', '/api/admin/door-link', admin, async () => json({ made: !!(await kv.get('doorKey')) }));
  route('POST', '/api/admin/door-link', admin, async () => {
    const key = randomHex(16);
    await kv.set('doorKey', await sha(key));
    return json({ key }); // the key leaves the server this once
  });
  // The scan: the ticket's QR opens /door.html#t=<code>.<time code> on the doorman's phone. The time code (RFC 6238,
  // see totp.js) changes every 30 seconds on the ticket page, so a screenshot goes stale. A QR with the code alone (an
  // old wallet card, from before 11 Nov) doesn't get in: wallet cards are reminders now, with no QR. Marked once, in
  // one statement, so two scans can't both pass; that also stops a forwarded ticket getting a second person in.
  route('POST', '/api/door/scan', doorman, async (c) => {
    const show = await showOf(c);
    if (!(show.ticket.on && show.door.on)) return json({ result: 'off' });
    const b = await body(c);
    const code = String(b?.code || '');
    const otp = String(b?.otp || '');
    if (!CODE.test(code)) return json({ result: 'unknown' });
    const t = await one('SELECT kind, checked_at, secret FROM tickets WHERE code = ?', code);
    if (!t) return json({ result: 'unknown' });
    if (t.kind !== 'room') return json({ result: 'online' });
    if (t.checked_at) return json({ result: 'already', at: t.checked_at });
    if (!(await totpOk(t.secret, otp))) return json({ result: 'stale' });
    if (await one("UPDATE tickets SET checked_at = ? WHERE code = ? AND checked_at IS NULL AND kind = 'room' RETURNING sats", now(), code)) return json({ result: 'in' });
    const again = await one('SELECT checked_at FROM tickets WHERE code = ?', code);
    return json({ result: 'already', at: again?.checked_at });
  });
  route('GET', '/api/door/count', doorman, async (c) => json({ on: await doorOn(c),
    ...(await one("SELECT COUNT(checked_at) AS inside, COUNT(*) AS sold FROM tickets WHERE kind = 'room'")) }));
  // The ticket's door QR is drawn on the phone itself (viewer.js), from its code and its time code.

  // ---- The stage (see stageNow): doors, open, on, closed. Show Time's three buttons move it on.
  const STAGES = ['doors', 'open', 'on', 'closed'];
  // The stage, whether the artist's stream is coming in (the live light), when it opens by itself, and the server's
  // clock, so every countdown ends at the same moment whatever the phone's own clock says.
  route('GET', '/api/stage', async (c) => {
    const show = await showOf(c);
    const [stage, live] = await Promise.all([stageNow(show), liveNow(show.page)]);
    return json({ stage, live, opensAt: opensAt(show), freeUntil: await freeUntil(show, stage, live), now: Date.now() });
  });
  route('POST', '/api/admin/stage', admin, async (c) => {
    const stage = (await body(c))?.stage;
    if (!STAGES.includes(stage)) return json({ error: 'bad_stage' }, 400);
    await kv.set('stageAt', now()); // pages ask every 2 s for the next half hour: a rehearsal feels live
    // End night starts the 7 days the night's records are kept (closing.js); opening it again stops the clock.
    if (stage === 'closed') { if (!(await kv.get('endedAt'))) await kv.set('endedAt', now()); }
    else await run("DELETE FROM kv WHERE key = 'endedAt'");
    return json({ stage: await kv.set('stage', stage) });
  });

  // Tickets sold since the last New night: New night cancels them, and the artist should see that before pressing it.
  route('GET', '/api/admin/sold', admin, async (c) => json({ ...Object.fromEntries(
    (await all('SELECT kind, COUNT(*) AS n FROM tickets GROUP BY kind')).map((r) => [r.kind, r.n])), over: await gigOver(await current(c)) }));

  // ---- The bar's key: made in the bar's own browser; only the public half comes here.
  route('PUT', '/api/admin/bar-key', admin, async (c) => {
    const pubkey = String((await body(c))?.pubkey || '').toLowerCase();
    if (!COMPRESSED.test(pubkey)) return json({ error: 'bad_key', detail: 'a 33-byte compressed public key, in hex' }, 400);
    return json({ pubkey: await kv.set('barKey', pubkey) });
  });

  // ---- The door, step 1: the artist's part of the ticket. Paid already: in (a retry is safe).
  // ?as=home buys the Online ticket instead: its own price, no drink, and it watches the stream but isn't a way into
  // the room. A room ticket watches from home too.
  const home = (c) => c.url.searchParams.get('as') === 'home';
  const ticketOn = async (c) => {
    const show = await showOf(c);
    if (home(c)) return show.stream.mode === 'ticket' && show.online.price ? null : json({ error: 'not_ready', detail: 'No Online ticket on this show.' }, 409);
    return show.ticket.on && show.ticket.price ? null : json({ error: 'not_ready', detail: 'No ticket price set yet.' }, 409);
  };
  // The room's limit: room tickets only, checked before any payment. Blank capacity: no limit.
  const roomFull = async (c) => {
    const cap = (await showOf(c)).capacity;
    return !!cap && (await one("SELECT COUNT(*) AS n FROM tickets WHERE kind = 'room'")).n >= cap;
  };
  route('GET', '/api/door/ticket', pass, ticketOn,
    async (c) => ((await hasTicket(c.pass)) ? json({ in: true }) : null),
    async (c) => (!home(c) && (await roomFull(c)) ? json({ error: 'sold_out', detail: 'Sold out.' }, 409) : null),
    cashuGate(async (c) => (home(c) ? (await showOf(c)).online.price : ticketSplit(await showOf(c)).artist),
      async (c) => `${(await showOf(c)).title || 'The show'}: ${home(c) ? 'online ticket' : 'privacy ticket'}`,
      { lockTo: artistKey, kind: 'ticket' }),
    async (c) => {
      await run('INSERT OR IGNORE INTO tickets (pass, sats, at, kind, code, secret) VALUES (?, ?, ?, ?, ?, ?)', c.pass, c.paid, now(), home(c) ? 'home' : 'room', randomHex(12), randomHex(32));
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
    const t = await ticketOf(id);
    // code and secret: the room ticket's door code and its time code's secret, for its QR (the page shows it only
    // when the door check is on). Only this phone's own pass is given them, and the secret only while the ticket has
    // no passkey: after that, only a passkey check gives it (passkey.js), so a copied ticket link can't open the door QR.
    const room = t?.kind === 'room';
    const keys = t?.keys ?? 0;
    return { ticket: !!t, ticketKind: t?.kind ?? null, ticketSats: t?.sats ?? 0, ticketAt: t?.at ?? null, passkey: keys > 0,
      code: room ? t.code : null, secret: room && !keys ? t.secret : null, checkedAt: t?.checked_at ?? null, drink: d ? { id: d.id, poured: !!d.collected_at } : null };
  };
  route('GET', '/api/door/me', pass, async (c) => json({ ...(await heldBy(c.pass)), soldOut: await roomFull(c) }));

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

  // ---- The live chat. Free messages: one per 10 s per phone, 30 s in slow mode; mods any time, and only they may post
  // links. Tips with a message arrive through the tip routes.
  route('POST', '/api/message', pass, noGuestLinks(async (c) => (await body(c))?.text), async (c) => {
    const mod = await modOf(c);
    if ((await showOf(c)).comments === false) return json({ error: 'comments_off', detail: 'Comments are off for this gig.' }, 403);
    const last = mod ? null : await one('SELECT at FROM messages WHERE pass = ? AND sats = 0 ORDER BY id DESC LIMIT 1', c.pass);
    const wait = (await slowMode()) ? SLOW : NORMAL;
    if (last && Date.now() - Date.parse(last.at) < wait) return json({ error: 'too_soon', detail: `One message every ${wait / 1000} seconds${wait === SLOW ? ': slow mode is on' : ''}.` }, 429);
    const id = await addMessage(c.pass, (await body(c))?.text, 0, mod);
    if (!id) return json({ error: 'empty' }, 400);
    return json({ id: Number(id) });
  });
  const chatSince = async (c, after) => {
    const [rows, tipped, gone, show, slow, pin] = await Promise.all([
      all('SELECT id, pass, sats, text, mod, mod_icon, nostr FROM messages WHERE id > ? AND deleted = 0 ORDER BY id DESC LIMIT 50', after),
      // Tonight's tips only (since the last New night), so the stretch goal starts empty each night.
      kv.get('nightStart', '').then((since) => one("SELECT COALESCE(SUM(sats), 0) AS s FROM locked WHERE kind = 'tip' AND at >= ?", since)),
      all('SELECT id FROM messages WHERE deleted = 1 AND id > ?', Math.max(after - 60, 0)), // the page shows the last 60
      showOf(c), slowMode(), pinned(),
    ]);
    const words = show.comments !== false; // off: only the tips, without their words
    return {
      // A mod's name comes first, then their icon and the Mod tag (drawn by the page).
      messages: rows.reverse().filter((m) => words || m.sats > 0).map((m) => ({ id: m.id, sats: m.sats, text: words ? m.text : '',
        who: m.mod || m.nostr || `guest ${String(m.pass || '').slice(0, 4)}`, ...(m.mod ? { mod: true, icon: m.mod_icon || '' } : m.nostr ? { nostr: true } : {}) })),
      slow, pin: words ? pin : '',
      deleted: gone.map((r) => r.id), tipped: tipped.s, goals: show.goals.filter((g) => g.label && g.at), thanks: show.goalsThanks || '',
    };
  };

  // The room's tippers screen (?top=1): tonight's three biggest tippers, by their tips' total. Tonight's chat is the
  // chat not yet cleared (New night clears it), and a tip a mod deleted doesn't count.
  const topTippers = async () => (await all(`SELECT MAX(mod) AS mod, MAX(nostr) AS nostr, MIN(pass) AS pass, SUM(sats) AS sats FROM messages
    WHERE sats > 0 AND deleted = 0 GROUP BY COALESCE(mod, pass) ORDER BY sats DESC LIMIT 3`))
    .map((r) => ({ who: r.mod || r.nostr || `guest ${String(r.pass || '').slice(0, 4)}`, sats: r.sats, ...(!r.mod && r.nostr ? { nostr: true } : {}) }));

  // The gig page's one request (every 2 s or once a minute: `every`, see pollEvery): the stage, the live light, the chat since `after`, the show if it has
  // changed since `shown`, and with `door=1` this phone's drink. One request, to keep the free plan's daily limit.
  route('GET', '/api/tick', async (c) => {
    const q = c.url.searchParams;
    const { show, updated } = await current(c);
    const [stage, stageAt, live, chat, door, top] = await Promise.all([
      stageNow(show), kv.get('stageAt'), liveNow(show.page), chatSince(c, Number(q.get('after')) || 0),
      q.get('door') ? heldBy(c.req.headers.get('X-Pass') || '') : null,
      q.get('top') ? topTippers() : null,
    ]);
    return json({ stage, live, opensAt: opensAt(show), freeUntil: await freeUntil(show, stage, live), now: Date.now(), every: pollEvery({ live, date: show.date, stageAt }), ...chat, updated, ...(q.get('shown') === updated ? {} : { show: publicShow(show) }), ...(door ? { door } : {}), ...(top ? { top } : {}) });
  });
  route('DELETE', /^\/api\/admin\/messages\/(?<id>\d+)$/, admin, async (c) => {
    await run('UPDATE messages SET deleted = 1 WHERE id = ?', Number(c.params.id));
    return json({ ok: true });
  });
}
