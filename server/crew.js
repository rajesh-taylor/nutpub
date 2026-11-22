// The artist's crew (session 55): a show producer runs the artist's nights for them. Plan gig, Show Time, the stream
// key and Pub TV; never the takings (not even the totals: Rajesh 22 Nov), the 12 words, the takings key, Move, splits or
// payout addresses, invites, Finish gig or Lost or stolen device. The artist invites one from Cellar with a link that works once, for 7 days, sent
// however they like; whoever opens it makes a passkey of their own on thenutpub.com (stages.js), and from then on
// that passkey signs them in (Back to your gigs). Moderators by invite join these rows in session 55b (role 'mod').
//
// A producer's browser holds a key of its own, never the setup key, sent as X-Admin like the artist's: app.js lets it
// through the routes on the producer's list only. The server keeps the SHA-256 of every code and key, never the thing
// itself. Nothing here encrypts or signs: the codes and keys are random, the passkeys sign as they always have.
// Stages only: Longy's own stage (D1) has no crew.
import { one, all, run, sql, batch, stageDb } from './db.js';
import { json, body, randomHex, now } from './http.js';
import { currentShow } from './shows.js';

export const MAX_PRODUCERS = 2;
export const INVITE_MS = 7 * 86_400_000; // an invite works once, for 7 days
export const CODE_MS = 5 * 60_000; // a sign-in code from Back to your gigs: 5 minutes, once
export const KEYS_EACH = 3; // browsers signed in per crew member: the newest three
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const utf8 = new TextEncoder();
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nameOf = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').trim().slice(0, 24);
const onStage = () => (stageDb()?.id ? null : json({ error: 'not_found' }, 404));

// The producer behind this request's X-Admin, or null. Read once per request.
export const producerOf = (c) => (c.producer ??= (async () => {
  if (!stageDb()?.id) return null;
  const k = c.req.headers.get('X-Admin') || '';
  if (!HEX64.test(k)) return null;
  return one("SELECT c.id, c.name FROM crew_keys k JOIN crew c ON c.id = k.crew WHERE k.hash = ? AND c.role = 'producer' AND c.who IS NOT NULL", await sha(k));
})());

// ---- Called by thenutpub.com's front door (stages.js, through the stage's Durable Object).
// Before the sheet: what the invite is for, or null (used, run out or cancelled).
export async function inviteInfo(code, at = Date.now()) {
  if (!HEX32.test(String(code))) return null;
  const r = await one('SELECT role, name, until FROM crew WHERE invite = ? AND until >= ?', await sha(code), at);
  if (!r) return null;
  const { show } = await currentShow();
  return { role: r.role, name: r.name, artist: show.artist || '', until: r.until };
}
// The passkey made (or used): the invite spent in one statement, so two browsers can't both take it, and the crew
// member tied to that artist on thenutpub.com (`who`: their passkey's artist id). Null if it's gone.
export async function joinCrew(code, who, at = Date.now()) {
  if (!HEX32.test(String(code)) || !who) return null;
  if (await one('SELECT 1 AS x FROM crew WHERE who = ?', who)) return { already: true };
  return one('UPDATE crew SET invite = NULL, until = NULL, who = ? WHERE invite = ? AND until >= ? RETURNING id, role, name', who, await sha(code), at);
}
// A one-time sign-in code for this person on this gig, or null if they're no longer crew here (removed).
export async function crewCode(who, at = Date.now()) {
  const r = who ? await one('SELECT id, role FROM crew WHERE who = ?', who) : null;
  if (!r) return null;
  const code = randomHex(16);
  await run('UPDATE crew SET code = ?, code_until = ? WHERE id = ?', await sha(code), at + CODE_MS, r.id);
  return { code, role: r.role };
}
// The 12 words' lock-out (recover.js): every producer and moderator signed out and removed, pending invites gone.
// The example gig's scripted moderators (no link, no passkey) stay.
export async function clearCrew() {
  await batch([sql('DELETE FROM crew_keys'), sql('DELETE FROM crew'), sql("DELETE FROM mods WHERE key_hash NOT LIKE 'seed:%'")]);
}

export function mountCrew(route, admin) {
  // ---- The artist, in Cellar.
  route('GET', '/api/admin/crew', onStage, admin, async () => json({
    crew: (await all('SELECT id, role, name, until, who IS NOT NULL AS joined FROM crew ORDER BY id'))
      .filter((r) => r.joined || r.until >= Date.now()).map((r) => ({ id: r.id, role: r.role, name: r.name, until: r.joined ? null : r.until, joined: !!r.joined })),
    max: { producer: MAX_PRODUCERS },
  }));
  // Invite a producer: the code leaves the server this once (the page makes the link: thenutpub.com/crew#i=<stage>.<code>).
  route('POST', '/api/admin/crew', onStage, admin, async (c) => {
    const b = await body(c);
    const role = b?.role === 'producer' ? 'producer' : null;
    if (!role) return json({ error: 'bad_role' }, 400);
    const name = nameOf(b?.name);
    if (!name) return json({ error: 'no_name', detail: 'Give them a name first.' }, 400);
    const at = Date.now();
    await run('DELETE FROM crew WHERE who IS NULL AND until < ?', at); // invites that ran out
    if ((await one('SELECT COUNT(*) AS n FROM crew WHERE role = ?', role)).n >= MAX_PRODUCERS) return json({ error: 'too_many', detail: `${MAX_PRODUCERS} producers at most.` }, 409);
    const code = randomHex(16);
    const until = at + INVITE_MS;
    const id = (await run('INSERT INTO crew (role, name, invite, until, created) VALUES (?, ?, ?, ?, ?)', role, name, await sha(code), until, now())).meta.last_row_id;
    return json({ id: Number(id), role, name, stage: stageDb().id, code, until });
  });
  // Remove (or Cancel an invite): their browsers are out at once, and their passkey stops opening this gig.
  route('DELETE', /^\/api\/admin\/crew\/(?<id>\d+)$/, onStage, admin, async (c) => {
    const id = Number(c.params.id);
    const r = await one('SELECT who FROM crew WHERE id = ?', id);
    if (!r) return json({ ok: true });
    await batch([sql('DELETE FROM crew_keys WHERE crew = ?', id), sql('DELETE FROM crew WHERE id = ?', id)]);
    if (r.who && c.env?.DB) await c.env.DB.prepare("DELETE FROM key_stages WHERE key = ? AND stage = ? AND role != 'artist'").bind(r.who, stageDb().id).run();
    return json({ ok: true });
  });

  // ---- The crew member's browser, on the gig's address: the sign-in code from thenutpub.com, traded once for a key of
  // its own. A new key each time (the newest three kept), so their laptop and phone can both stay in.
  route('POST', '/api/crew/handoff', onStage, async (c) => {
    const code = String((await body(c))?.code || '');
    const gone = () => json({ error: 'handoff', detail: 'That sign-in has been used or has run out: try Back to your gigs again.' }, 403);
    if (!HEX32.test(code)) return gone();
    const r = await one('UPDATE crew SET code = NULL, code_until = NULL WHERE code = ? AND code_until >= ? AND who IS NOT NULL RETURNING id, role, name', await sha(code), Date.now());
    if (!r) return gone();
    const key = randomHex(32);
    await run('INSERT INTO crew_keys (hash, crew, created) VALUES (?, ?, ?)', await sha(key), r.id, now());
    await run('DELETE FROM crew_keys WHERE crew = ? AND hash NOT IN (SELECT hash FROM crew_keys WHERE crew = ? ORDER BY created DESC, rowid DESC LIMIT ?)', r.id, r.id, KEYS_EACH);
    console.log(`crew signed in: ${r.role} ${r.id}`);
    return json({ role: r.role, name: r.name, key });
  });
}
