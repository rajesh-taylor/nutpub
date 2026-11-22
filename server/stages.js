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
  // A passkey with no stage left is forgotten 7 days after it was last used (its page then tells the password manager).
  await env.DB.batch([
    env.DB.prepare('DELETE FROM artist_links WHERE key IN (SELECT id FROM artist_keys WHERE COALESCE(used, created) < ? AND id NOT IN (SELECT key FROM key_stages))').bind(cutoff),
    env.DB.prepare('DELETE FROM artist_keys WHERE COALESCE(used, created) < ? AND id NOT IN (SELECT key FROM key_stages)').bind(cutoff)]);
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
export const LINKS_PER_KEY = 10; // browsers holding a link for one passkey: the newest ten
async function keyOfLink(link) {
  if (!CODE.test(String(link || ''))) return null;
  return one('SELECT k.id, k.name FROM artist_links l JOIN artist_keys k ON k.id = l.key WHERE l.hash = ?', await sha(link));
}
async function newLink(key) {
  const link = randomHex(16);
  await run('INSERT INTO artist_links (hash, key, created) VALUES (?, ?, ?)', await sha(link), key, now());
  await run('DELETE FROM artist_links WHERE key = ? AND hash NOT IN (SELECT hash FROM artist_links WHERE key = ? ORDER BY created DESC LIMIT ?)', key, key, LINKS_PER_KEY);
  return link;
}
// The stage is told it has a passkey, and its name, so Cellar can say so.
async function linkStage(env, key, stage) {
  await run("INSERT OR IGNORE INTO key_stages (key, stage, role, created) VALUES (?, ?, 'artist', ?)", key.id, stage, now());
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
// What the password manager lists it as, from the page: "NutPub · Artist · 22 Nov". Plain text, 60 characters at most.
const nameOf = (text) => String(text || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) || 'NutPub · Artist';
const newStage = async () => {
  let id = newStageId();
  while (await one('SELECT 1 AS x FROM stages WHERE id = ?', id)) id = newStageId();
  return id;
};

export function mountStageDoor(route) {
  const front = (c) => (stageDb().id ? json({ error: 'not_found' }, 404) : null); // on thenutpub.com only

  // Make your artist passkey (step 0 on /judge): the passkey made in this browser, then a link code for it. Stages this
  // browser started before (their claim codes) join it.
  route('POST', '/api/artist', front, async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    let k;
    try { k = await checkCreate(b, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    const key = { id: k.id, name: nameOf(b.name) };
    await run('INSERT OR IGNORE INTO artist_keys (id, name, pubkey, alg, count, synced, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
      k.id, key.name, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, now());
    const linked = [];
    for (const x of [].concat(b.claims || []).slice(0, 10)) {
      const stage = String(x?.stage || '');
      if (!(await takeClaim(stage, String(x?.claim || '')))) continue;
      if (!(await one('SELECT 1 AS x FROM stages WHERE id = ?', stage))) continue;
      await linkStage(c.env, key, stage);
      linked.push(stage);
    }
    console.log(`artist passkey made${linked.length ? `, with ${linked.join(', ')}` : ''}`);
    return json({ link: await newLink(k.id), name: key.name, linked });
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
      sql('INSERT OR IGNORE INTO artist_keys (id, name, pubkey, alg, count, synced, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        k.id, key.name, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, at)]);
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
    if (!(await challengeOk(b?.challenge))) return old();
    const k = await one('SELECT id, name, pubkey AS publicKey, alg, count FROM artist_keys WHERE id = ?', String(b?.id || ''));
    if (!k) return json({ error: 'no_stage', detail: 'That passkey doesn’t open any gigs now: pick the one called “NutPub · Artist”.' }, 404);
    let auth;
    try { auth = await checkGet(b, k, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    await run('UPDATE artist_keys SET count = ?, used = ? WHERE id = ?', auth.count, now(), k.id);
    const rows = await all('SELECT s.id FROM key_stages ks JOIN stages s ON s.id = ks.stage WHERE ks.key = ? ORDER BY s.created DESC LIMIT 10', k.id);
    const stages = [];
    for (const { id } of rows) {
      const w = await stageStub(c.env, id).welcome().catch(() => null);
      if (w?.code) stages.push({ stage: id, gig: w.gig, artist: w.artist, venue: w.venue, state: w.state, url: stageLink(c, id, w.code) });
    }
    return json({ stages, name: k.name, link: await newLink(k.id) });
  });
}
