// The night around the set: the door (a ticket and its first drink), the stage (doors, on, closed), the bar's key
// and the live chat. A ticket is two locked payments from the phone: the artist's part to the artist's key, and the
// drink to the bar's key with a locktime at last orders and a refund to the artist's key (NUT-11), so an unpoured
// drink becomes the artist's and the mint, not this server, enforces it. Nothing here holds a sat.
import { startReplay, endReplay, replayNow, replayFor as replayOf } from './replay.js';
// The replay as the gig page needs it: and whether this pass watches it free (a ticket at End night) or has bought it.
const replayFor = async (show, c) => replayOf(await replayNow(show), c.req.headers.get('X-Pass'));
import QRCode from 'qrcode';
import { one, all, run, sql, batch, kv, siteUrl } from './db.js';
import { cashuGate } from './gate.js';
import { stepAt } from './totp.js';
import { makeGigKey, signBlind, isPoint, readProof, checkProof, shortY } from './blind.js';
import { current, showOf, publicShow, ticketSplit, lastOrdersAt, opensAt, stageNow, pollEvery, gigOver, drinkOpen, freeStatus } from './shows.js';
import { liveNow, freeUntil } from './live.js';
import { artistKey } from './takings.js';
import { json, body, now, randomHex } from './http.js';
import { modOf, hasLink, slowMode, pinned, SLOW, NORMAL } from './mods.js';
import { nostrOf, handle } from './nostr.js';

const COMPRESSED = /^0[23][0-9a-f]{64}$/;
export const barKey = () => kv.get('barKey');

const DRINK = 'SELECT d.id, l.id AS locked, l.token, l.sats, l.pubkey, l.collected_at, l.collected_by FROM drinks d JOIN locked l ON l.id = d.locked';
export const hasTicket = async (pass) => !!(await one('SELECT 1 AS x FROM tickets WHERE pass = ?', pass));
const ticketOf = (pass) => one('SELECT kind, sats, at, (SELECT COUNT(*) FROM passkeys p WHERE p.pass = t.pass) AS keys FROM tickets t WHERE pass = ?', pass); // kind: 'room' | 'home'
const siteOf = (c) => siteUrl(c);

// A message for the live chat: plain text, one line, 140 characters at most. Shown as text, never as HTML.
const clip = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 140);
export async function addMessage(pass, text, sats = 0, mod = null, as = null) {
  const t = clip(text);
  if (!t && !sats) return null;
  const nostr = mod ? null : as || handle(await nostrOf(pass)); // signed in with Nostr: their name goes with the message (as: a scripted line's)
  return (await run('INSERT INTO messages (at, pass, sats, text, mod, mod_icon, nostr) VALUES (?, ?, ?, ?, ?, ?, ?)', now(), pass, sats, t, mod?.name ?? null, mod?.icon ?? null, nostr)).meta.last_row_id;
}
// Before a guest's words go out, with a tip or without: links are for the moderators.
export const noGuestLinks = (text) => async (c) => (hasLink(await text(c)) && !(await modOf(c))
  ? json({ error: 'no_links', detail: 'Links are for the moderators.' }, 400) : null);
// The X-Message header on a tip: URI-encoded, so any language survives the header.
export const tipMessage = (c) => { try { return decodeURIComponent(c.req.headers.get('X-Message') || ''); } catch { return ''; } };

// ---- The door check: blind-signed tickets (session 39, blind.js). The phone makes its ticket and sends only a blinded
// copy with the 402; tonight's gig key signs it blind. At the door the QR (new every 30 seconds) carries the ticket and
// a signature of the time step by the ticket's own key: the door checks the gig signed it, the QR is fresh and it's
// the first time in, and keeps the ticket's fingerprint (Y) in a list wiped by New night. It can't tell which
// purchase a ticket came from. The door link carries a key of its own: the server keeps only its SHA-256, and a new
// link cancels the old one. The artist's own browser opens the door page too.
const utf8 = new TextEncoder();
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const doorOn = async (c) => { const show = await showOf(c); return show.ticket.on && show.door.on; };

const svg = (text) => new Response(text, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' } });

// Tonight's gig key: made once, kept here; its private half never leaves the server. New night deletes it (shows.js),
// so the next ticket is signed by a new one and last night's tickets don't get in.
async function gigKey() {
  const g = await kv.get('gigKey');
  if (g?.priv) return g;
  await run("INSERT OR IGNORE INTO kv (key, value) VALUES ('gigKey', ?)", JSON.stringify(makeGigKey()));
  return kv.get('gigKey');
}
// The blinded ticket a phone sent with its 402 (X-Blind, a point in hex), and the gig's signature on it, kept with the
// purchase: the same phone, or its passkey on another one, rebuilds the same blinded ticket and asks again (NUT-09 style).
const blindOf = (c) => String(c.req.headers.get('X-Blind') || '').toLowerCase();
const signedFor = async (pass, B_) => {
  const b = await one('SELECT blind, signed FROM blinded WHERE pass = ?', pass);
  return b && b.blind === B_ ? { sig: JSON.parse(b.signed) } : {};
};
const keepSigned = async (pass, B_) => run('INSERT OR IGNORE INTO blinded (pass, blind, signed) VALUES (?, ?, ?)', pass, B_, JSON.stringify(signBlind(B_, await gigKey())));

const counts = () => one("SELECT (SELECT COUNT(*) FROM door_in) AS inside, (SELECT COUNT(*) FROM tickets WHERE kind = 'room') AS sold");
// The door's three checks on a QR (or a door word's proof). result 'ok': let in once marked (markIn).
async function doorCheck(text) {
  const p = readProof(text);
  if (!p) return { result: 'unknown', checks: { signed: false } };
  const { signed, fresh, y } = checkProof(p, await gigKey(), stepAt(Date.now()));
  if (!signed) return { result: 'unknown', checks: { signed } };
  const was = await one('SELECT at FROM door_in WHERE y = ?', y);
  const checks = { signed, fresh, first: !was };
  if (was) return { result: 'already', at: was.at, checks, ...(await counts()) };
  if (!fresh) return { result: 'stale', checks };
  return { result: 'ok', y, checks };
}
// Marked once, in one statement, so two scans of one ticket (or a QR and a door word) can't both pass.
async function markIn(y, checks) {
  if ((await run('INSERT OR IGNORE INTO door_in (y, at) VALUES (?, ?)', y, now())).meta.changes === 1) return { result: 'in', checks, ...(await counts()) };
  const was = await one('SELECT at FROM door_in WHERE y = ?', y);
  return { result: 'already', at: was?.at, checks: { ...checks, first: false }, ...(await counts()) };
}

// Door words (No scanner? Show a door word): the fan's phone sends the same proof and gets a word like PUNTER-47; the
// artist lets that word in on Show Time. Good for ten minutes. The word says nothing about the purchase either.
const WORD_MS = 10 * 60 * 1000;
const WORDS = ['PUNTER', 'PINT', 'STOUT', 'LAGER', 'CIDER', 'ENCORE', 'CHORUS', 'RIFF', 'JUKEBOX', 'SNUG', 'ROUND', 'TAPROOM', 'BARREL', 'ANTHEM', 'GIG', 'AMP'];
const pick = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

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
  // Tonight's gig key, its public half: the same for everyone, so the phone checks its ticket's DLEQ proof against it.
  route('GET', '/api/door/gig', async () => json({ pub: (await gigKey()).pub }));
  // The scan: the ticket's QR opens /door.html#b=<proof> on the doorman's phone (blind.js has the proof's layout).
  route('POST', '/api/door/scan', doorman, async (c) => {
    if (!(await doorOn(c))) return json({ result: 'off' });
    const out = await doorCheck(String((await body(c))?.proof || ''));
    return json(out.result === 'ok' ? await markIn(out.y, out.checks) : out);
  });
  // No scanner? Show a door word: from the fan's own phone, with no pass (so the word isn't tied to the purchase).
  route('POST', '/api/door/word', async (c) => {
    if (!(await doorOn(c))) return json({ result: 'off' });
    const out = await doorCheck(String((await body(c))?.proof || ''));
    if (out.result !== 'ok') return json(out);
    const since = Date.now() - WORD_MS;
    await run('DELETE FROM door_words WHERE at < ? AND y NOT IN (SELECT y FROM door_in)', since);
    const had = await one('SELECT word, at FROM door_words WHERE y = ? AND at >= ?', out.y, since);
    if (had) return json({ result: 'word', word: had.word, until: had.at + WORD_MS });
    for (let i = 0; i < 20; i++) {
      const word = `${WORDS[pick(WORDS.length)]}-${10 + pick(90)}`;
      const at = Date.now();
      if ((await run('INSERT OR IGNORE INTO door_words (word, y, at) VALUES (?, ?, ?)', word, out.y, at)).meta.changes === 1) return json({ result: 'word', word, until: at + WORD_MS });
    }
    return json({ error: 'busy', detail: 'Try again in a moment.' }, 503);
  });
  // Let in by hand (Rajesh 14 Nov: "I don't have my phone on me"): Show Time lists the door words waiting, and lets one
  // in; the same once-only mark as a scan. It can't list tickets by buyer any more: the NutPub doesn't know whose is whose.
  route('GET', '/api/admin/door', admin, async () => json({ ...(await counts()),
    words: await all('SELECT w.word, w.at, i.at AS in_at FROM door_words w LEFT JOIN door_in i ON i.y = w.y WHERE w.at >= ? OR i.y IS NOT NULL ORDER BY w.at', Date.now() - WORD_MS) }));
  route('POST', '/api/admin/door/let-in', admin, async (c) => {
    const word = String((await body(c))?.word || '').toUpperCase();
    const w = await one('SELECT y, at FROM door_words WHERE word = ?', word);
    if (!w) return json({ result: 'unknown' });
    if (await one('SELECT 1 AS x FROM door_in WHERE y = ?', w.y)) return json({ result: 'already' });
    if (w.at < Date.now() - WORD_MS) return json({ result: 'old' });
    return json(await markIn(w.y, { signed: true, fresh: true, first: true }));
  });
  route('GET', '/api/door/count', doorman, async (c) => json({ on: await doorOn(c), ...(await counts()) }));
  // The ticket's door QR is drawn on the phone itself (viewer.js), from the ticket and its key.

  // ---- The stage (see stageNow): doors, open, on, closed. Show Time's three buttons move it on.
  const STAGES = ['doors', 'open', 'on', 'closed'];
  // The stage, whether the artist's stream is coming in (the live light), when it opens by itself, and the server's
  // clock, so every countdown ends at the same moment whatever the phone's own clock says.
  route('GET', '/api/stage', async (c) => {
    const show = await showOf(c);
    const [stage, live, times, reached] = await Promise.all([stageNow(show), liveNow(show.page), kv.get('stageTimes', {}), kv.get('reachedAt')]);
    const replay = await replayFor(show, c);
    // When the artist's stream first reached us this gig (Stream records, and bills, from then): Show Time's clock.
    const reachedAt = reached ?? (live ? await kv.set('reachedAt', now()) : null);
    return json({ stage, live, replay, opensAt: opensAt(show), freeUntil: await freeUntil(show, stage, live), now: Date.now(), times, reachedAt });
  });
  route('POST', '/api/admin/stage', admin, async (c) => {
    const stage = (await body(c))?.stage;
    if (!STAGES.includes(stage)) return json({ error: 'bad_stage' }, 400);
    // A free stream opens only once the artist has paid for it up front (upfront.js, session 35).
    if (['open', 'on'].includes(stage) && !(await freeStatus(await showOf(c))).covered) {
      return json({ error: 'unpaid_stream', detail: 'Pay for the free stream on 1 · Plan your gig first.' }, 409);
    }
    await kv.set('stageAt', now()); // pages ask every 2 s for the next half hour: a rehearsal feels live
    // Show Time's step line: when each step began ("The show is on, since 19:05"). Going back drops the later ones.
    const times = await kv.get('stageTimes', {});
    for (const later of STAGES.slice(STAGES.indexOf(stage))) delete times[later];
    if (stage !== 'doors') times[stage] = now();
    await kv.set('stageTimes', times);
    // End night starts the 7 days the night's records are kept (closing.js); opening it again stops the clock.
    if (stage === 'closed') { if (!(await kv.get('endedAt'))) await kv.set('endedAt', now()); }
    else await run("DELETE FROM kv WHERE key = 'endedAt'");
    const out = await kv.set('stage', stage);
    // End night starts the replay (if the gig has one, replay.js); opening the night again ends it.
    if (stage === 'closed') await startReplay(); else await endReplay();
    return json({ stage: out });
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
  // ?as=home buys the Watch online ticket instead: its own price, no drink, and it watches the stream but isn't a way into
  // the room. A venue ticket watches from home too.
  const home = (c) => c.url.searchParams.get('as') === 'home';
  const ticketOn = async (c) => {
    const show = await showOf(c);
    if (home(c)) return show.stream.mode === 'ticket' && show.online.price ? null : json({ error: 'not_ready', detail: 'No Watch online ticket on this show.' }, 409);
    return show.ticket.on && show.ticket.price ? null : json({ error: 'not_ready', detail: 'No ticket price set yet.' }, 409);
  };
  // The room's limit: venue tickets only, checked before any payment. Blank capacity: no limit.
  const roomFull = async (c) => {
    const cap = (await showOf(c)).capacity;
    return !!cap && (await one("SELECT COUNT(*) AS n FROM tickets WHERE kind = 'room'")).n >= cap;
  };
  // A venue ticket's 402 carries the blinded ticket (X-Blind): checked before any payment. Paid already: the signature
  // again, for the same blinded ticket.
  route('GET', '/api/door/ticket', pass, ticketOn,
    async (c) => ((await hasTicket(c.pass)) ? json({ in: true, ...(await signedFor(c.pass, blindOf(c))) }) : null),
    async (c) => (!home(c) && !isPoint(blindOf(c)) ? json({ error: 'no_blind', detail: 'Reload the page, then buy the ticket again.' }, 400) : null),
    async (c) => (!home(c) && (await roomFull(c)) ? json({ error: 'sold_out', detail: 'Sold out.' }, 409) : null),
    cashuGate(async (c) => (home(c) ? (await showOf(c)).online.price : ticketSplit(await showOf(c)).artist),
      async (c) => `${(await showOf(c)).title || 'The show'}: ${home(c) ? 'watch online' : 'venue ticket'}`,
      { lockTo: artistKey, kind: 'ticket' }),
    async (c) => {
      await run('INSERT OR IGNORE INTO tickets (pass, sats, at, kind, code, secret) VALUES (?, ?, ?, ?, ?, ?)', c.pass, c.paid, now(), home(c) ? 'home' : 'room', randomHex(12), randomHex(32));
      if (home(c)) return json({ in: true });
      await keepSigned(c.pass, blindOf(c));
      return json({ in: true, ...(await signedFor(c.pass, blindOf(c))) });
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

  // What this phone holds: its ticket, and its drink (poured once the bar has collected it). For a venue ticket: the
  // blinded ticket and the gig's signature on it (useless without the 32 bytes on the phone, so a copied ticket link
  // can't show the door QR), and the door's list of tickets in, in short form: the phone looks for its own there, so it
  // never says which ticket is its own.
  const heldBy = async (id) => {
    const d = await one(`${DRINK} WHERE d.pass = ?`, id);
    const t = await ticketOf(id);
    const room = t?.kind === 'room';
    const b = room ? await one('SELECT blind, signed FROM blinded WHERE pass = ?', id) : null;
    const inside = room ? (await all('SELECT y, at FROM door_in')).map((r) => [shortY(r.y), r.at]) : [];
    return { ticket: !!t, ticketKind: t?.kind ?? null, ticketSats: t?.sats ?? 0, ticketAt: t?.at ?? null, passkey: (t?.keys ?? 0) > 0,
      blind: b?.blind ?? null, sig: b ? JSON.parse(b.signed) : null, inside, drink: d ? { id: d.id, poured: !!d.collected_at } : null };
  };
  route('GET', '/api/door/me', pass, async (c) => json({ ...(await heldBy(c.pass)), soldOut: await roomFull(c) }));

  // The drink as the coin itself (gig 3, 17 Nov): this phone's own drink, the locked token it paid, for its animated
  // NUT-16 QR. It's locked to the bar's key (and to the artist's after last orders), so showing it to the phone that
  // paid it gives nothing away: only the bar can spend it. Poured: no token, just that.
  route('GET', '/api/door/drink/coin', pass, async (c) => {
    const show = await showOf(c);
    if (!show.drinkCoin) return json({ error: 'no_coin' }, 404);
    const d = await one(`${DRINK} WHERE d.pass = ?`, c.pass);
    if (!d) return json({ error: 'no_drink' }, 404);
    // Paid and locked at the ticket; it reaches the phone when the show starts (or at the artist's time).
    if (!d.collected_at && !drinkOpen(show, await stageNow(show))) return json({ error: 'not_yet', id: d.id }, 425);
    return json({ id: d.id, sats: d.sats, poured: !!d.collected_at, token: d.collected_at ? null : d.token });
  });

  // Gig 3 (17 Nov): the fan's page as a QR, in Show Time's Judges line, so the judge's phone becomes the fan. A plain link
  // (the phone's camera app opens it); the page is public anyway.
  route('GET', '/api/fan-qr.svg', async (c) => {
    const page = (await showOf(c)).page;
    return svg(await QRCode.toString(`${siteOf(c)}/${page}`, { type: 'svg', margin: 1, color: { dark: '#050914', light: '#efe3c8' } }));
  });

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
    const [rows, tipped, gone, show, slow, pin, cued] = await Promise.all([
      all('SELECT m.id, m.pass, m.sats, m.text, m.mod, m.mod_icon, m.nostr, n.locked AS zap FROM messages m LEFT JOIN nutzaps n ON n.message = m.id WHERE m.id > ? AND m.deleted = 0 ORDER BY m.id DESC LIMIT 50', after),
      // Tonight's tips only (since the last New night), so the stretch goal starts empty each night.
      kv.get('nightStart', '').then((since) => one("SELECT COALESCE(SUM(sats), 0) AS s FROM locked WHERE kind = 'tip' AND at >= ?", since)),
      all('SELECT id FROM messages WHERE deleted = 1 AND id > ?', Math.max(after - 60, 0)), // the page shows the last 60
      showOf(c), slowMode(), pinned(), kv.get('cuedIds', []),
    ]);
    const scripted = new Set(cued); // an example gig's scripted lines (setlist.js cue): the TV page lets them go first
    const words = show.comments !== false; // off: only the tips, without their words
    return {
      // A mod's name comes first, then their icon and the Mod tag (drawn by the page).
      messages: rows.reverse().filter((m) => words || m.sats > 0).map((m) => ({ id: m.id, sats: m.sats, text: words ? m.text : '',
        who: m.mod || m.nostr || `guest ${String(m.pass || '').slice(0, 4)}`, ...(m.mod ? { mod: true, icon: m.mod_icon || '' } : m.nostr ? { nostr: true } : {}), ...(m.zap ? { nutzap: true } : {}), ...(scripted.has(m.id) ? { cue: true } : {}) })),
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
    return json({ stage, live, replay: await replayFor(show, c), opensAt: opensAt(show), freeUntil: await freeUntil(show, stage, live), now: Date.now(), every: pollEvery({ live, date: show.date, stageAt }), ...chat, updated, ...(q.get('shown') === updated ? {} : { show: publicShow(show) }), ...(door ? { door } : {}), ...(top ? { top, lightning: show.lightning || '' } : {}) }); // the TV page: the artist's own Lightning address under its QR (session 45)
  });
  route('DELETE', /^\/api\/admin\/messages\/(?<id>\d+)$/, admin, async (c) => {
    await run('UPDATE messages SET deleted = 1 WHERE id = ?', Number(c.params.id));
    return json({ ok: true });
  });
}
