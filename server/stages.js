// The front door (thenutpub.com only): Put on a gig makes an artist a stage of their own, sealed with a passkey;
// Back to your stage finds it again with that passkey, on any phone or laptop its password manager syncs to. No email,
// no account: D1 keeps the list of stages and each one's passkey (its public key), nothing about the person.
// The stage itself is a Durable Object (stage.js) at <id>.thenutpub.com; its setup key never leaves it except through
// a one-time code (handoff.js) that its own page trades for the key, as Sign in on your phone does.
import { SITE_URL } from './config.js';
import { one, run, sql, batch, stageDb } from './db.js';
import { json, body, now } from './http.js';
import { checkCreate, checkGet, challengeOk, spend, site } from './passkey.js';

// While the stages run on the test mint (and the free plan), at most this many at once.
export const MAX_STAGES = 30;

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

export function mountStageDoor(route) {
  const front = (c) => (stageDb().id ? json({ error: 'not_found' }, 404) : null); // on thenutpub.com only

  // Put on a gig: the passkey made on the phone, then a stage of its own.
  route('POST', '/api/stages', front, async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    let k;
    try { k = await checkCreate(b, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if ((await one('SELECT COUNT(*) AS n FROM stages')).n >= MAX_STAGES) {
      return json({ error: 'full', detail: 'Every stage is taken for now: try again tomorrow.' }, 409);
    }
    if (!(await spend(b.challenge))) return old();
    let id = newStageId();
    while (await one('SELECT 1 AS x FROM stages WHERE id = ?', id)) id = newStageId();
    const at = now();
    await batch([sql('INSERT INTO stages (id, created) VALUES (?, ?)', id, at),
      sql('INSERT INTO stage_keys (id, stage, pubkey, alg, count, synced, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        k.id, id, k.publicKey, k.alg, k.count, k.synced ? 1 : 0, at)]);
    const code = await stageStub(c.env, id).setup(id);
    console.log(`stage made: ${id}`);
    return json({ stage: id, url: stageLink(c, id, code) });
  });

  // Back to your stage: the passkey check, then a one-time sign-in link to it.
  route('POST', '/api/stages/back', front, async (c) => {
    const b = await body(c);
    if (!(await challengeOk(b?.challenge))) return old();
    const k = await one('SELECT id, stage, pubkey AS publicKey, alg, count FROM stage_keys WHERE id = ?', String(b?.id || ''));
    if (!k) return json({ error: 'no_stage', detail: 'That passkey isn’t a stage’s: pick the one called “My NutPub stage”.' }, 404);
    let auth;
    try { auth = await checkGet(b, k, { ...site(c), challenge: b.challenge }); } catch (e) { return fail(e); }
    if (!(await spend(b.challenge))) return old();
    await run('UPDATE stage_keys SET count = ?, used = ? WHERE id = ?', auth.count, now(), k.id);
    const code = await stageStub(c.env, k.stage).handoff();
    if (!code) return json({ error: 'no_stage', detail: 'That stage has closed.' }, 404);
    return json({ stage: k.stage, url: stageLink(c, k.stage, code) });
  });
}
