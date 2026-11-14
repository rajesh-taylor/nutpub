// Sign in on your phone: Plan gig, signed in on a computer, shows a QR that signs a phone in once. The QR carries a
// one-time code, not the setup key: it works once, for 5 minutes, so a photo of the screen later opens nothing.
// The phone trades the code for the key (kept in that browser, as the private setup link would be).
import { kv, one, adminKey } from './db.js';
import { json, body, randomHex } from './http.js';

export const HANDOFF_MS = 5 * 60 * 1000;
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

// A new code replaces any earlier one: only the latest QR works.
export async function makeHandoff(at = Date.now()) {
  const code = randomHex(16);
  await kv.set('handoff', { hash: await sha(code), until: at + HANDOFF_MS });
  return code;
}

// The code once, inside its 5 minutes: the key. Anything else: null. Used or not, a right code is spent.
export async function takeHandoff(code, at = Date.now()) {
  const saved = await kv.get('handoff');
  if (!saved || typeof code !== 'string' || !/^[0-9a-f]{32}$/.test(code)) return null;
  if ((await sha(code)) !== saved.hash) return null;
  // Spent in one statement, so two phones scanning at once can't both get in.
  const gone = await one("DELETE FROM kv WHERE key = 'handoff' AND value = ? RETURNING key", JSON.stringify(saved));
  return gone && at <= saved.until ? adminKey() : null;
}

export function mountHandoff(route, admin) {
  route('POST', '/api/admin/handoff', admin, async () => json({ code: await makeHandoff(), ms: HANDOFF_MS }));
  route('POST', '/api/handoff', async (c) => {
    const key = await takeHandoff((await body(c))?.code);
    return key ? json({ key }) : json({ error: 'handoff', detail: 'That code has been used or has run out: make a new one on Plan gig.' }, 403);
  });
}
