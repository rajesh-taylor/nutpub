// The front door (thenutpub.com only): the artist's passkey (session 53) is made once, on thenutpub.com, and opens every
// stage it starts; Back to your gigs finds them again with it, on any phone or laptop its password manager syncs to. No
// email, no account: D1 keeps the list of stages, each passkey's public key and which stages it opens, nothing about
// the person. Judges meet it as step 0 on /judge; skipped, a judge's stages open in the browser that made them only.
// The stage itself is a Durable Object (stage.js) at <id>.thenutpub.com; its setup key never leaves it except through
// a one-time code (handoff.js) that its own page trades for the key, as Sign in on your phone does.
import { SITE_URL } from './config.js';
import { one, all, run, sql, batch, stageDb } from './db.js';
import { json, body, now, randomHex } from './http.js';
import { checkCreate, checkGet, challengeOk, spend, site } from './passkey.js';

// While the stages run on the test mint (and the free plan), at most this many at once: 50 until NutNovember's judging
// is over (Rajesh 19 Nov: the drop to 15 on 22 Nov would have shut judges out), then 15.
export const maxStages = (at = Date.now()) => (at < Date.parse('2026-12-01T00:00:00Z') ? 50 : 15);
const full = async () => (await one('SELECT COUNT(*) AS n FROM stages')).n >= maxStages();
const FULL = () => json({ error: 'full', detail: 'Every stage is taken for now: try again tomorrow.' }, 409);
// Judge for yourself (/judge): the three gig cards, each a stage of its own holding just that gig (setlist.js).
export const JUDGE_GIGS = ['longy', 'frankie', 'pickle']; // three gigs (Rajesh 19 Nov): gig 4 folded into gig 3

// <id>.thenutpub.com (or <id>.localhost in development): a stage's id is a letter, then five letters or digits with at
// least one digit, so www and other words are never a stage.
export const STAGE_ID = /^(?=[a-z0-9]*\d)[a-z][a-z0-9]{5}$/;
export function stageIdOf(hostname, site = SITE_URL) {
  const [label, ...rest] = hostname.split('.');
  const parent = rest.join('.');
  const apex = site ? new URL(site).hostname : null;
  return STAGE_ID.test(label) && (parent === apex || parent === 'localhost') ? label : null;
}
export const stageStub = (env, id) => env.STAGES.get(env.STAGES.idFromName(id));

// Practice stages close themselves (Rajesh 15 Nov): 7 days after they're made, whatever's on them, test sats not moved
// included. Takings says when. The daily cron (index.js) closes them; a judge's Start fresh leaves the old one to this.
export const STAGE_DAYS = 7;
const DAY = 86_400_000;
export const closesAt = (made) => (made ? new Date(Date.parse(made) + STAGE_DAYS * DAY).toISOString() : null);
export async function closeOldStages(env, at = Date.now(), stub = stageStub) {
  const cutoff = new Date(at - STAGE_DAYS * DAY).toISOString();
  const { results } = await env.DB.prepare('SELECT id FROM stages WHERE created < ?').bind(cutoff).all();
  const closed = [];
  for (const { id } of results) {
    try { await stub(env, id).shut(); } catch (e) { console.log(`stage ${id} not closed: ${String(e.message || e).slice(0, 200)}`); continue; }
    await env.DB.batch(forget(env, id));
    closed.push(id);
  }
  if (closed.length) console.log(`stages closed: ${closed.join(', ')}`);
  // A passkey whose artist has no stage left is forgotten 7 days after it was last used (its page then tells the
  // password manager). Add codes past their 5 minutes go too.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM artist_links WHERE key IN (SELECT id FROM artist_keys WHERE COALESCE(used, created) < ? AND COALESCE(artist, id) NOT IN (SELECT key FROM key_stages))').bind(cutoff),
    env.DB.prepare('DELETE FROM artist_keys WHERE COALESCE(used, created) < ? AND COALESCE(artist, id) NOT IN (SELECT key FROM key_stages)').bind(cutoff),
    env.DB.prepare('DELETE FROM artist_adds WHERE until < ?').bind(at)]);
  return closed;
}
// A closed stage, off the front door's lists: its passkeys' links to it, its claim, the stage itself.
const forget = (env, id) => ['stage_keys', 'key_stages', 'stage_claims'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE stage = ?`).bind(id))
  .concat(env.DB.prepare('DELETE FROM stages WHERE id = ?').bind(id));
// Every stage taken (Rajesh 19 Nov: our own testing filled all 50): the oldest one made over an hour ago closes to make
// room, as it would at 7 days. Never one made in the last hour, so a judge mid-run keeps theirs.
export async function makeRoom(env, at = Date.now(), stub = stageStub) {
  const hourAgo = new Date(at - 3_600_000).toISOString();
  const oldest = await env.DB.prepare('SELECT id FROM stages WHERE created < ? ORDER BY created LIMIT 1').bind(hourAgo).first();
  if (!oldest) return false;
  try { await stub(env, oldest.id).shut(); } catch (e) { console.log(`stage ${oldest.id} not closed: ${String(e.message || e).slice(0, 200)}`); return false; }
  await env.DB.batch(forget(env, oldest.id));
  console.log(`stage closed to make room: ${oldest.id}`);
  return true;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALNUM = `${LETTERS}0123456789`;
export function newStageId() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return LETTERS[r[0] % 26] + [...r.slice(1, 5)].map((b) => ALNUM[b % 36]).join('') + String(r[5] % 10);
}

// The stage's address, as the browser sees this site (the page's own Origin), and its sign-in link.
function stageLink(c, id, code) {
  const from = new URL(c.req.headers.get('Origin') || c.url.origin);
  return `${from.protocol}//${id}.${from.host}/#h=${code}`;
}
const fail = (e) => json({ error: 'passkey', detail: String(e.message || e) }, 400);
const old = () => json({ error: 'old_challenge' }, 400);
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const CODE = /^[0-9a-f]{32}$/;

// ---- The artist's passkey (session 53). One passkey, many stages: key_stages says which. Starting a stage shouldn't
// ask for the passkey again, so the browser that made it (or signed in with it) keeps a link code: sent with a new
// stage, it adds that stage to the passkey, and does nothing else. Opening a stage elsewhere always takes the passkey.
// Session 54b: an artist may have several passkeys (one added from another device). artist_keys.artist is the first
// passkey's id, and key_stages.key holds it, so every passkey of one artist opens the same gigs; before the migration
// it was empty, hence COALESCE(artist, id).
export const LINKS_PER_KEY = 10; // browsers holding a link for one passkey: the newest ten
const KEY_COLS = 'k.id, k.name, COALESCE(k.artist, k.id) AS artist';
async function keyOfLink(link) {
  if (!CODE.test(String(link || ''))) return null;
  return one(`SELECT ${KEY_COLS} FROM artist_links l JOIN artist_keys k ON k.id = l.key WHERE l.hash = ?`, await sha(link));
}
async function newLink(key) {
  const link = randomHex(16);
  await run('INSERT INTO artist_links (hash, key, created) VALUES (?, ?, ?)', await sha(link), key, now());
  await run('DELETE FROM artist_links WHERE key = ? AND hash NOT IN (SELECT hash FROM artist_links WHERE key = ? ORDER BY created DESC LIMIT ?)', key, key, LINKS_PER_KEY);
  return link;
}
// The stage is told it has a passkey, and its name, so Cellar can say so.
async function linkStage(env, key, stage) {
  await run("INSERT OR IGNORE INTO key_stages (key, stage, role, created) VALUES (?, ?, 'artist', ?)", key.artist || key.id, stage, now());
  try { await stageStub(env, stage).passkey(key.name); } catch (e) { console.log(`stage ${stage} not told of its passkey: ${String(e.message || e).slice(0, 200)}`); }
}
// A stage started before its passkey was made: its browser keeps a claim code beside the stage's id (/judge, this
// site), so the passkey made later adds it. Spent once used; the stage's id alone (it's in every fan's link) adds nothing.
async function newClaim(stage) {
  const claim = randomHex(16);
  await run('INSERT OR REPLACE INTO stage_claims (stage, hash) VALUES (?, ?)', stage, await sha(claim));
  return claim;
}
async function takeClaim(stage, claim) {
  if (!STAGE_ID.test(stage) || !CODE.test(claim)) return false;
  return !!(await one('DELETE FROM stage_claims WHERE stage = ? AND hash = ? RETURNING stage', stage, await sha(claim)));
}
// Claim codes sent with a passkey (made, or used for Back to your gigs): each stage still open joins it. Ten at most.
async function takeClaims(env, key, claims) {
  const linked = [];
  for (const x of [].concat(claims || []).slice(0, 10)) {
    const stage = String(x?.stage || '');
    if (!(await takeClaim(stage, String(x?.claim || '')))) continue;
    if (!(await one('SELECT 1 AS x FROM stages WHERE id = ?', stage))) continue;
    await linkStage(env, key, stage);
    linked.push(stage);
  }
  return linked;
}
// What the password manager lists it as, from the page: "NutPub · Artist · 22 Nov". Plain text, 60 characters at most.
const nameOf = (text) => String(text || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) || 'NutPub · Artist';
const newStage = async () => {
  let id = newStageId();
  while (await one('SELECT 1 AS x FROM stages WHERE id = ?', id)) id = newStageId();
  return id;
};

// ---- Another device (session 54b). A device with the artist passkey shows a code for 5 minutes; the new device makes a
// passkey of its own with it, and both belong to one artist. The code takes the passkey itself: a link code never makes
// one. 8 characters of Crockford base32 (40 random bits, shown K7QX-3MPA), its SHA-256 kept, never the code; spent once,
// and a new one replaces the artist's earlier code. No key, no encryption: the passkeys sign, as they always have.
export const ADD_MS = 5 * 60 * 1000;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ADD = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export function newAddCode(bytes = crypto.getRandomValues(new Uint8Array(5))) {
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  return Array.from({ length: 8 }, (_, i) => CROCKFORD[Number((bits >> BigInt(35 - 5 * i)) & 31n)]).join('');
}
// As typed: any case, dashes and spaces dropped, O read as 0 and I or L as 1 (Crockford's own rule).
export const tidyAddCode = (text) => String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
async function addCodeFor(artist, at = Date.now()) {
  const code = newAddCode();
  await batch([sql('DELETE FROM artist_adds WHERE until < ? OR artist = ?', at, artist),
    sql('INSERT INTO artist_adds (hash, artist, until) VALUES (?, ?, ?)', await sha(code), artist, at + ADD_MS)]);
  return code;
}
// The artist a live code adds to, or null.
const addLive = async (code, at = Date.now()) => (ADD.test(code) ? (await one('SELECT artist FROM artist_adds WHERE hash = ? AND until >= ?', await sha(code), at))?.artist ?? null : null);
// Spent in one statement, so two devices with the same code can't both use it.
async function takeAddCode(code, at = Date.now()) {
  if (!ADD.test(code)) return null;
  return (await one('DELETE FROM artist_adds WHERE hash = ? AND until >= ? RETURNING artist', await sha(code), at))?.artist ?? null;
}
const ADD_GONE = () => json({ error: 'add', detail: 'That code has been used or has run out: make a new one on your other device.' }, 403);
// The artist's open stages, newest first, each with a one-time sign-in link (Back to your gigs, and a device just added).
async function gigsOf(c, artist) {
  const rows = await all('SELECT s.id FROM key_stages ks JOIN stages s ON s.id = ks.stage WHERE ks.key = ? ORDER BY s.created DESC LIMIT 10', artist);
  const stages = [];
  for (const { id } of rows) {
    const w = await stageStub(c.env, id).welcome().catch(() => null);
    if (w?.code) stages.push({ stage: id, gig: w.gig, artist: w.artist, venue: w.venue, state: w.state, url: stageLink(c, id, w.code) });
  }
  return stages;
}
// The passkey check that Back to your gigs and Add a passkey on another device share: the passkey, as stored, or a reply.
async function checkArtist(c, b) {
  if (!(await challengeOk(b?.challenge))) return { no: old() };
  const k = await one(`SELECT k.id, k.name, k.pubkey AS publicKey, k.alg, k.count, COALESCE(k.artist, k.id) AS artist FROM artist_keys k WHERE k.id = ?`, String(b?.id || ''));
  if (!k) return { no: json({ error: 'no_stage', detail: 'That passkey doesn’t open any gigs now: pick the one called “NutPub · Artist”.' }, 404) };
  let auth;
  try { auth = await checkGet(b, k, { ...site(c), challenge: b.challenge }); } catch (e) { return { no: fail(e) }; }
  if (!(await spend(b.challenge))) return { no: old() };
  await run('UPDATE artist_keys SET count = ?, used = ? WHERE id = ?', auth.count, now(), k.id);
  return { k };
}

export function mountStageDoor(route) {
  const front = (c) => (stageDb().id ? json({ error: 'not_found' }, 404) : null); // on thenutpub.com only

  // Make your artist passkey (step 0 on /judge): the passkey made in this browser, then a link code for it. Stages this
  // browser started before (their claim codes) join it. With an add code (session 54b), it joins the artist whose
  // other device showed the code, and their open gigs come back with it.
  route('POST', '/api/artist', front, async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    const add = b?.add == null ? null : tidyAddCode(b.add);
    if (add != null && !(await addLive(add))) return ADD_GONE();
    let k;
    try { k = await checkCreate(b, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    const artist = add == null ? k.id : await takeAddCode(add);
    if (!artist) return ADD_GONE();
    const key = { id: k.id, name: nameOf(b.name), artist };
    await run('INSERT OR IGNORE INTO artist_keys (id, name, pubkey, alg, count, synced, created, artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      k.id, key.name, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, now(), artist);
    const linked = await takeClaims(c.env, key, b.claims);
    console.log(`artist passkey ${add == null ? 'made' : 'added from another device'}${linked.length ? `, with ${linked.join(', ')}` : ''}`);
    return json({ link: await newLink(k.id), name: key.name, linked, ...(add == null ? {} : { stages: await gigsOf(c, artist) }) });
  });

  // Add a passkey on another device: this device's passkey once, then a code for 5 minutes.
  route('POST', '/api/artist/add', front, async (c) => {
    const { k, no } = await checkArtist(c, await body(c));
    if (no) return no;
    console.log('add code made');
    return json({ code: await addCodeFor(k.artist), ms: ADD_MS });
  });
  // The new device, before its passkey sheet: is the code still good? (Asked as it's typed, so the sheet opens straight
  // from the tap and a dead code never leaves a passkey the NutPub won't keep.) Spends nothing. n: which of the artist's
  // passkeys this will be, for its name ("NutPub · Artist · 23 Nov · 2"), so two in one password manager can be told apart.
  route('POST', '/api/artist/add/check', front, async (c) => {
    const artist = await addLive(tidyAddCode((await body(c))?.code));
    if (!artist) return ADD_GONE();
    const { n } = await one('SELECT COUNT(*) AS n FROM artist_keys WHERE COALESCE(artist, id) = ?', artist);
    return json({ ok: true, n: n + 1 });
  });

  // Put on a gig (parked on the home page since 15 Nov): the artist's passkey made, then a stage of its own.
  route('POST', '/api/stages', front, async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    let k;
    try { k = await checkCreate(b, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if ((await full()) && !(await makeRoom(c.env))) return FULL();
    if (!(await spend(b.challenge))) return old();
    const id = await newStage();
    const at = now();
    const key = { id: k.id, name: nameOf(b.name) };
    await batch([sql('INSERT INTO stages (id, created) VALUES (?, ?)', id, at),
      sql('INSERT OR IGNORE INTO artist_keys (id, name, pubkey, alg, count, synced, created, artist) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        k.id, key.name, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, at, k.id)]);
    const code = await stageStub(c.env, id).setup(id);
    await linkStage(c.env, key, id);
    console.log(`stage made: ${id}`);
    return json({ stage: id, url: stageLink(c, id, code), link: await newLink(k.id) });
  });

  // A gig card on /judge: a stage with just that gig. The stage's page keeps its setup key in this browser, and /judge
  // remembers the stage's address: Open again goes straight back. With this browser's link code (X-Artist-Link) the
  // stage joins the artist's passkey; without one, a claim code comes back for a passkey made later. A wrong or old
  // link adds nothing: the stage is made all the same.
  route('POST', '/api/stages/judge', front, async (c) => {
    const gig = String((await body(c))?.gig || '');
    if (!JUDGE_GIGS.includes(gig)) return json({ error: 'no_gig' }, 400);
    const sent = c.req.headers.get('X-Artist-Link');
    const key = await keyOfLink(sent);
    if ((await full()) && !(await makeRoom(c.env))) return FULL();
    const id = await newStage();
    await run('INSERT INTO stages (id, created) VALUES (?, ?)', id, now());
    const code = await stageStub(c.env, id).setup(id, gig);
    if (key) await linkStage(c.env, key, id);
    console.log(`judge stage made: ${id} (${gig})${key ? ', with its passkey' : ''}`);
    return json({ stage: id, url: stageLink(c, id, code), linked: !!key, ...(key ? {} : { claim: await newClaim(id) }), ...(sent && !key ? { link: 'unknown' } : {}) });
  });

  // /judge's cards: which of this browser's stages are still open (closed ones offer Start only).
  route('GET', '/api/stages/open', front, async (c) => {
    const ids = String(c.url.searchParams.get('ids') || '').split(',').filter((id) => STAGE_ID.test(id)).slice(0, 10);
    const open = [];
    for (const id of ids) if (await one('SELECT 1 AS x FROM stages WHERE id = ?', id)) open.push(id);
    return json({ open });
  });

  // Back to your gigs: the passkey check, then its open stages, newest first, each with a one-time sign-in link, and a
  // link code for this browser. One stage: the page goes straight in.
  route('POST', '/api/stages/back', front, async (c) => {
    const b = await body(c);
    const { k, no } = await checkArtist(c, b);
    if (no) return no;
    // A gig opened with its 12 words (session 54) comes back onto the passkey with its claim code.
    const linked = await takeClaims(c.env, k, b.claims);
    return json({ stages: await gigsOf(c, k.artist), name: k.name, link: await newLink(k.id), linked });
  });
}
