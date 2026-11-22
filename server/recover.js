// The 12 words win the gig back (session 54): a stage keeps the public half of the key its 12 words make for this job
// (client/recover.js), set once by the setup key and changed after that only by a signature from the words themselves,
// so a stolen browser holding the setup key can't swap it. With the words, any browser can open the gig again:
// a new setup key (every other browser signed out), the gig off every passkey (the next one made or used on
// thenutpub.com adds it back, with a claim code), new keys for the next payments and for the next words.
// Signatures are checked with WebCrypto (Ed25519), as passkeys are. Stages only: Longy's own stage has no words.
import { kv, stageDb } from './db.js';
import { json, body, randomHex } from './http.js';
import { challengeOk, spend } from './passkey.js';
import { clearCrew } from './crew.js';

export const RECOVER_INFO = 'refueler.nutpub.recover.v1';
const HEX32 = /^[0-9a-f]{64}$/;
const COMPRESSED = /^0[23][0-9a-f]{64}$/;
const SELF = 'stage-self'; // the stage's id and setup key (stage.js)
const utf8 = (s) => new TextEncoder().encode(s);
const unhex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ZERO = Uint8Array.of(0);
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

// The same bytes as client/recover.js's recoverMessage.
export const recoverMessage = ({ stage, challenge, recoverKey, artistKey }) =>
  cat(utf8(RECOVER_INFO), ZERO, utf8(stage), ZERO, utf8(challenge), ZERO, utf8(recoverKey), ZERO, utf8(artistKey));
export async function recoverSigned(pubkey, sig, fields) {
  if (!HEX32.test(String(pubkey)) || !/^[0-9a-f]{128}$/.test(String(sig))) return false;
  try {
    const key = await crypto.subtle.importKey('raw', unhex(pubkey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, unhex(sig), recoverMessage(fields));
  } catch { return false; }
}

export function mountRecover(route, admin) {
  const onStage = () => (stageDb()?.id ? null : json({ error: 'not_found' }, 404));

  // Cellar and Your takings, in the browser that holds the words: the words' recovery key, once. The same key again is
  // fine; another one is refused (only the words change the words: POST /api/recover).
  route('PUT', '/api/admin/recover-key', onStage, admin, async (c) => {
    const pubkey = String((await body(c))?.pubkey || '').toLowerCase();
    if (!HEX32.test(pubkey)) return json({ error: 'bad_key' }, 400);
    const now = await kv.get('recoverKey');
    if (now && now !== pubkey) return json({ error: 'set', detail: 'This gig already has its 12 words.' }, 409);
    if (!now) await kv.set('recoverKey', pubkey);
    return json({ ok: true });
  });

  // Has this gig got its words' key? (Cellar: the words can be forgotten once it has.)
  route('GET', '/api/admin/recover-key', onStage, admin, async () => json({ pubkey: await kv.get('recoverKey') }));

  // Lost every device, or one stolen: the words open the gig. No setup key needed (that's the point); the words' signature
  // over a one-time challenge, the gig's id and the next two keys is the proof.
  route('POST', '/api/recover', onStage, async (c) => {
    const b = await body(c);
    const stage = stageDb().id;
    const have = await kv.get('recoverKey');
    if (!have) return json({ error: 'no_words', detail: 'This gig has no 12 words on record: open it with your passkey instead.' }, 409);
    const fields = { stage, challenge: String(b?.challenge || ''), recoverKey: String(b?.recoverKey || '').toLowerCase(), artistKey: String(b?.artistKey || '').toLowerCase() };
    if (!HEX32.test(fields.recoverKey) || !COMPRESSED.test(fields.artistKey)) return json({ error: 'bad_key' }, 400);
    if (!(await challengeOk(fields.challenge))) return json({ error: 'old_challenge' }, 400);
    if (!(await recoverSigned(have, String(b?.sig || '').toLowerCase(), fields))) return json({ error: 'words', detail: 'These words are for a different gig.' }, 403);
    if (!(await spend(fields.challenge))) return json({ error: 'old_challenge' }, 400);
    // Every other browser signed out: a new setup key, and no Sign in on your phone code left to trade for it.
    const self = await kv.get(SELF);
    const key = randomHex(32);
    if (self) await kv.set(SELF, { ...self, adminKey: key });
    stageDb().adminKey = key;
    await kv.set('handoff', null);
    // The next payments lock to the new words' key; the next words are the new ones. Payments already waiting stay
    // locked to the old key: the page brings it back into this browser with the old words, so Move takes them.
    await kv.set('artistKey', fields.artistKey);
    await kv.set('recoverKey', fields.recoverKey);
    await kv.set('artist-passkey', null);
    // Producers and moderators signed out too (session 55): a thief could have invited themselves. Invite them again.
    await clearCrew();
    // Off every passkey (thenutpub.com's list); a passkey left opening nothing is forgotten by the daily clean-up, as
    // any other. A claim code comes back: the next passkey made or used on thenutpub.com adds the gig again.
    const claim = randomHex(16);
    const DB = c.env?.DB;
    if (DB) {
      await DB.batch([
        DB.prepare('DELETE FROM key_stages WHERE stage = ?').bind(stage),
        DB.prepare('INSERT OR REPLACE INTO stage_claims (stage, hash) VALUES (?, ?)').bind(stage, await sha(claim))]);
    }
    console.log(`stage ${stage} opened with its 12 words: other browsers and crew signed out, passkeys off, new words`);
    return json({ key, claim });
  });
}
