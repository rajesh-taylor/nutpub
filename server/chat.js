// A safer chat for a solo artist (session 55c). The artist plays alone and can't watch the chat, so:
// - Comments need a tip (21 sats or more) while no mod is on, if the artist says so on Plan gig (on by default for a
//   free stream): abuse costs money, and the money is the artist's. A mod on (their gig page open) opens free comments.
// - Every message is checked for slurs and the artist's own words first (wordlist.js); a busy chat slows itself (mods.js).
// - Quiet: between songs, one tap on Show Time (or a mod's 🔇) takes a line off and keeps that phone's words out of the
//   chat tonight. Its lines are kept with deleted = 2: shown to that phone only, so it sees nothing change, and to nobody
//   else (phones, laptops, Pub TV). Its tips still reach the artist. Undo lets it back; New night clears the list.
// - The artist's Nostr mute list (NIP-51, kind 10000): the artist gives their npub in Cellar; their own browser reads the
//   list from public relays and sends it here, where its signature (BIP-340, as Nostr Sign In's) and its author are
//   checked, and the newest is kept. People on it who sign in to the chat with Nostr are kept out the same way as a
//   quiet phone; its words join the word check. Only public entries: private ones are encrypted to the artist, and stay so.
// Nothing here signs or encrypts anything.
import { bech32 } from '@scure/base';
import { one, all, run, sql, batch, kv } from './db.js';
import { json, body, now, randomHex } from './http.js';
import { verifyEvent, npub } from './nostr.js';
import { modOf, modOnline, modSeen, slowMode, slowBusy, pinned } from './mods.js';
import { tidyWords } from './wordlist.js';
import { currentShow, stageNow, opensAt } from './shows.js';
import { liveNow } from './live.js';

export const MIN_TIP = 21; // mints keep a fee reserve when paying out over Lightning: a 1-sat tip could never leave
export const MUTE_KIND = 10000;
const HEX64 = /^[0-9a-f]{64}$/;

// Comments need a tip right now: the artist's switch, comments on, and no mod on.
export const tipOnly = async (show) => show.comments !== false && !!show.tipWords && !(await modOnline());

const quietList = () => kv.get('quiet', []);
export const BACK_MS = 120_000; // how long a line brought back is sent again to chats that had moved past it
// Lines brought back since `at - BACK_MS`, among the last 60 a chat at `after` shows.
export const backSince = async (after, at = Date.now()) => (await kv.get('chatBack', [])).filter((x) => x.at > at - BACK_MS && x.id <= after && x.id > after - 60).map((x) => x.id);
const muteList = () => kv.get('muteList', null);
// A new line from this phone (and its Nostr key, if signed in): kept out of everyone else's chat?
export async function hiddenFrom(pass, pubkey) {
  const [q, m] = await Promise.all([quietList(), muteList()]);
  return q.some((x) => x.pass === pass || (!!pubkey && x.pubkey === pubkey)) || (!!pubkey && !!m?.people?.includes(pubkey));
}
// After Quiet, Undo or a new mute list: every line from a kept-out phone is hidden, every other one shown. Mods never.
export async function applyHidden() {
  const [q, m] = await Promise.all([quietList(), muteList()]);
  const people = new Set([...(m?.people || []), ...q.map((x) => x.pubkey).filter(Boolean)]);
  const passes = new Set(q.map((x) => x.pass));
  if (people.size) for (const r of await all('SELECT pass, pubkey FROM nostr')) if (people.has(r.pubkey)) passes.add(r.pass);
  const list = JSON.stringify([...passes]);
  // Session 56: lines coming back (Undo, Stop) are older than fans' last line, so their chats would never ask for them
  // again; the tick sends them for 2 minutes (door.js chatSince), and each chat puts them back in their place.
  const back = await all('SELECT id FROM messages WHERE deleted = 2 AND pass NOT IN (SELECT value FROM json_each(?))', list);
  if (back.length) {
    const at = Date.now();
    await kv.set('chatBack', [...(await kv.get('chatBack', [])).filter((x) => x.at > at - BACK_MS), ...back.map(({ id }) => ({ id, at }))].slice(-100));
  }
  await batch([
    sql('UPDATE messages SET deleted = 2 WHERE deleted = 0 AND mod IS NULL AND pass IN (SELECT value FROM json_each(?))', list),
    sql('UPDATE messages SET deleted = 0 WHERE deleted = 2 AND pass NOT IN (SELECT value FROM json_each(?))', list),
  ]);
}

// ---- The Nostr mute list. An npub (or its hex, or nostr:npub…) to the public key, or null.
export function pubkeyOf(text) {
  const t = String(text || '').trim().replace(/^nostr:/i, '').toLowerCase();
  if (HEX64.test(t)) return t;
  try {
    const { prefix, words } = bech32.decode(t, 200);
    const bytes = bech32.fromWords(words);
    return prefix === 'npub' && bytes.length === 32 ? [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') : null;
  } catch { return null; }
}
export const MUTE_WHY = {
  bad_signature: 'That mute list didn’t check out: its signature is wrong.',
  wrong_kind: 'That isn’t a mute list.',
  not_theirs: 'That mute list belongs to another npub.',
};
// The list itself: signed by its author's key (BIP-340), a mute list (kind 10000), and by the npub the artist gave.
export async function checkMuteList(ev, pubkey) {
  if (!(await verifyEvent(ev))) return 'bad_signature';
  if (ev.kind !== MUTE_KIND) return 'wrong_kind';
  if (ev.pubkey !== pubkey) return 'not_theirs';
  return null;
}
// Its public entries: people (p) and words (word). Hashtags and threads don't apply to a gig's chat.
export function readMuteList(ev) {
  const people = [...new Set(ev.tags.filter((t) => t[0] === 'p' && HEX64.test(String(t[1] || '').toLowerCase())).map((t) => t[1].toLowerCase()))].slice(0, 2000);
  const words = tidyWords(ev.tags.filter((t) => t[0] === 'word').map((t) => t[1]).join('\n')).slice(0, 100);
  return { at: ev.created_at, id: ev.id, people, words };
}

export function mountChat(route, admin, crew) {
  const guest = (pass) => `guest ${String(pass || '').slice(0, 4)}`;
  // Show Time's chat strip: the newest 8 lines shown to fans, who's quiet tonight, and how many people chatting tonight
  // are on the artist's Nostr mute list. Never a phone's pass: Quiet goes by the line's id, Undo by its own id.
  const state = async () => {
    const [lines, q, m, here, show] = await Promise.all([
      all('SELECT id, pass, sats, pence, text, mod, mod_icon, nostr FROM messages WHERE deleted = 0 ORDER BY id DESC LIMIT 8'),
      quietList(), muteList(), all('SELECT pubkey FROM nostr'), currentShow(),
    ]);
    const people = new Set(m?.people || []);
    const words = show.show.comments !== false;
    return {
      lines: lines.map((r) => ({ id: r.id, who: r.mod || r.nostr || guest(r.pass), sats: r.sats, ...(r.pence ? { pence: r.pence } : {}), text: words ? r.text : '',
        ...(r.mod ? { mod: true, icon: r.mod_icon || '' } : {}), ...(r.nostr ? { nostr: true } : {}) })),
      quiet: q.map(({ id, who }) => ({ id, who })),
      muted: new Set(here.map((r) => r.pubkey).filter((p) => people.has(p))).size,
    };
  };
  const quiet = async (c) => {
    const m = await one('SELECT pass, mod, nostr FROM messages WHERE id = ?', Number((await body(c))?.message));
    if (!m || m.mod || !m.pass) return json({ error: 'cant_quiet', detail: 'That line can’t be quietened.' }, 400);
    const list = await quietList();
    if (!list.some((x) => x.pass === m.pass)) {
      const pubkey = (await one('SELECT pubkey FROM nostr WHERE pass = ?', m.pass))?.pubkey || null;
      list.push({ id: randomHex(6), pass: m.pass, pubkey, who: m.nostr || guest(m.pass), at: now() });
      await kv.set('quiet', list.slice(-200));
    }
    await applyHidden();
    return null;
  };
  // The Mod page (session 55e, <stage>/mod): the mod's own look at the chat. The newest 40 lines fans see, who's quiet
  // tonight (Undo by its own id, as Show Time's), slow mode, the pin, and the night's step so the page can say what fans
  // see. Asking counts as a mod on, as the gig page's tick does (free comments on a tip-only gig). Never a phone's pass.
  const modState = async (c) => {
    const m = await modOf(c);
    const [lines, q, cs, slow, busy, pin, cued] = await Promise.all([
      all('SELECT id, pass, sats, pence, text, mod, mod_icon, nostr FROM messages WHERE deleted = 0 ORDER BY id DESC LIMIT 40'),
      quietList(), currentShow(), slowMode(), slowBusy(), pinned(), kv.get('cuedIds', []),
    ]);
    const { show } = cs;
    const words = show.comments !== false;
    const scripted = new Set(cued);
    const [stage, live] = await Promise.all([stageNow(show), liveNow(show.page)]);
    return {
      me: { name: m.name, icon: m.icon || '', main: !!m.main, via: m.via },
      lines: lines.reverse().filter((r) => words || r.sats > 0 || r.pence > 0).map((r) => ({ id: r.id, who: r.mod || r.nostr || guest(r.pass), sats: r.sats, ...(r.pence ? { pence: r.pence } : {}), text: words ? r.text : '',
        ...(r.mod ? { mod: true, icon: r.mod_icon || '' } : {}), ...(r.nostr ? { nostr: true } : {}), ...(scripted.has(r.id) || !r.pass ? { cue: true } : {}) })),
      quiet: q.map(({ id, who }) => ({ id, who })),
      slow, busy, pin: words ? pin : '', comments: words, tipWords: words && !!show.tipWords,
      gig: { artist: show.artist || '', venue: show.venue || '', date: show.date || '', path: cs.path, stage, live: !!live, opensAt: opensAt(show) },
    };
  };
  const asMod = async (c) => ((await modOf(c)) ? null : json({ error: 'not_mod', detail: 'You’re no longer a mod on this gig.' }, 403));
  route('GET', '/api/mod/chat', asMod, async (c) => { await modSeen(); return json(await modState(c)); });
  route('DELETE', /^\/api\/mod\/quiet\/(?<id>[0-9a-f]{12})$/, asMod, async (c) => {
    await kv.set('quiet', (await quietList()).filter((x) => x.id !== c.params.id));
    await applyHidden();
    return json(await modState(c));
  });
  route('GET', '/api/admin/chat', crew, async () => json(await state()));
  route('POST', '/api/admin/quiet', crew, quiet, async () => json(await state()));
  route('DELETE', /^\/api\/admin\/quiet\/(?<id>[0-9a-f]{12})$/, crew, async (c) => {
    await kv.set('quiet', (await quietList()).filter((x) => x.id !== c.params.id));
    await applyHidden();
    return json(await state());
  });
  // A mod's 🔇 on the gig page, or Quiet on the Mod page: the same Quiet. Undo: Show Time's, or the Mod page's (above).
  route('POST', '/api/mod/quiet', asMod, quiet, async (c) => json({ ok: true, ...(await modState(c)) }));

  // Cellar: the artist's own words to keep out, and their Nostr mute list.
  route('GET', '/api/admin/chat-words', admin, async () => json({ words: await kv.get('chatWords', []) }));
  route('PUT', '/api/admin/chat-words', admin, async (c) => json({ words: await kv.set('chatWords', tidyWords((await body(c))?.words)) }));
  const muteInfo = async () => {
    const m = await muteList();
    return m ? { npub: npub(m.pubkey), pubkey: m.pubkey, found: !!m.at, people: m.people.length, words: m.words.length, at: m.at } : {};
  };
  route('GET', '/api/admin/mute-list', admin, async () => json(await muteInfo()));
  // { npub }: the artist's npub (a new one forgets the old list); { event }: the newest list their browser found.
  route('PUT', '/api/admin/mute-list', admin, async (c) => {
    const b = await body(c);
    let m = await muteList();
    if (b?.npub != null) {
      const pubkey = pubkeyOf(b.npub);
      if (!pubkey) return json({ error: 'bad_npub', detail: 'That doesn’t look like an npub: it starts npub1.' }, 400);
      if (m?.pubkey !== pubkey) m = { pubkey, at: null, id: null, people: [], words: [] };
    }
    if (!m) return json({ error: 'no_npub', detail: 'Give your npub first.' }, 400);
    if (b?.event) {
      const why = await checkMuteList(b.event, m.pubkey);
      if (why) return json({ error: why, detail: MUTE_WHY[why] }, 400);
      if (!m.at || b.event.created_at > m.at) m = { ...m, ...readMuteList(b.event) };
    }
    await kv.set('muteList', m);
    await applyHidden();
    return json(await muteInfo());
  });
  route('DELETE', '/api/admin/mute-list', admin, async () => {
    await run("DELETE FROM kv WHERE key = 'muteList'");
    await applyHidden();
    return json({});
  });
}
