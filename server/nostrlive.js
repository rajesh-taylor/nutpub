// The gig, listed live on Nostr (session 55d, NIP-53): while the gig is on, Nostr apps that list live streams show it,
// with its title, picture, start time, planned/live/ended and a link to the gig page. The listing is a live event
// (kind 30311) that this server builds and the artist's own browser signs, with the Nostr key that signs the Nutzap
// note (client/artist-nostr.js), so the NutPub never holds that key. The server checks it (BIP-340, that key, signed
// just now, exactly the tags it built) and keeps the newest; the browser sends it to the Nutzap note's relays.
// It never carries the stream's own link (no "streaming" tag): that would skip the 402, so fans come to the gig page.
// Off on judges' practice gigs unless the artist switches it on (Plan gig's Event card; Rajesh 23 Nov).
// Signing only, nothing encrypted (the global rule): known answers in test/nostrlive.test.js.
import { kv, stageDb, siteUrl } from './db.js';
import { json, body, randomHex } from './http.js';
import { current, opensAt, stageNow } from './shows.js';
import { photoUrl, photoUrls } from './photo.js';
import { nutzapInfo } from './nutzap.js';
import { artistKey } from './takings.js';
import { verifyEvent } from './nostr.js';

export const LIVE_KIND = 30311;
export const FRESH = 300; // signed in the last 5 minutes
export const RESIGN = 30 * 60; // a live listing is signed again every 30 minutes: apps take one with no news for an hour as over
const STATUS = { doors: 'planned', open: 'live', on: 'live', closed: 'ended' };
const unix = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);
const line = (s, max) => [...String(s || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');

// A judge's practice gig: one of a stage's example gigs (setlist.js), not the artist's own.
export async function practiceGig() {
  if (!stageDb()?.id) return false;
  const list = await kv.get('setlist', null);
  return !!list && list.at !== 'yours';
}
// The gig's name on Nostr: its own title, else "Longy live at The Bell" (the venue's name, up to its first comma).
export function listingTitle(show) {
  if (show.title) return line(show.title, 100);
  const artist = line(show.artist, 60);
  const venue = line(String(show.venue || '').split(',')[0], 60);
  return artist ? (venue ? `${artist} live at ${venue}` : `${artist}, live`) : venue ? `Live at ${venue}` : 'A live gig on the NutPub';
}

// The listing's tags for the gig as it is now. Pure: the same gig gives the same tags, so the server can check what
// the browser signed. `times`: the stage's step times (Show Time's), ISO; `opens`: the start time, unix seconds.
export function listingTags({ d, show, stage, times = {}, opens = null, link, image = null, pubkey, relays }) {
  const status = STATUS[stage] || 'planned';
  const title = listingTitle(show);
  // Planned: the start time. Live and ended: when it went live (Start stream, Start show, or the start time itself).
  const starts = status === 'planned' ? opens : unix(times.open) ?? unix(times.on) ?? opens;
  const ends = status === 'ended' ? unix(times.closed) ?? starts : null;
  return [
    ['d', d],
    ['title', title],
    ['summary', `Tickets and the stream: ${link}`],
    ...(image ? [['image', image]] : []),
    ...(starts ? [['starts', String(starts)]] : []),
    ...(ends ? [['ends', String(ends)]] : []),
    ['status', status],
    ['t', 'music'], ['t', 'livemusic'],
    ['r', link],
    ['p', pubkey, relays[0] || '', 'Host'],
    ['relays', ...relays],
    ['alt', `A live gig on the NutPub: ${title}. ${link}`],
  ];
}
// An ended copy of a listing already sent (the switch turned off, or the gig it was for is over and gone).
export function endedTags(tags, at) {
  const out = tags.filter((t) => t[0] !== 'ends').map((t) => (t[0] === 'status' ? ['status', 'ended'] : t));
  const i = out.findIndex((t) => t[0] === 'status');
  out.splice(i, 0, ['ends', String(at)]);
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tagOf = (ev, name) => ev?.tags?.find((t) => t[0] === name)?.[1];

// What the artist's browser should sign now, or null: nothing has changed since the last one sent (a live one is
// signed again after RESIGN). `state`: { gig, d, event, endAt }, kept in kv `nostrLive`. Pure apart from `fresh`
// (a new random d) and `now`; returns the state to keep with it.
export function wanted({ on, gig, state, build, now, fresh = () => randomHex(8) }) {
  const last = state.event;
  // An old listing to end first: the switch is off, or the gig it was for has gone (Finish gig, a new date).
  if (last && tagOf(last, 'status') !== 'ended' && (!on || state.gig !== gig)) {
    const endAt = state.endAt ?? now;
    return { state: { ...state, endAt }, tags: endedTags(last.tags, endAt) };
  }
  if (!on) return { state, tags: null };
  const s = state.gig === gig && state.d ? state : { gig, d: fresh(), event: null, endAt: null };
  const tags = build(s.d);
  const stale = tagOf(s.event, 'status') === 'live' && s.event.created_at < now - RESIGN;
  return { state: s, tags: s.event && same(s.event.tags, tags) && !stale ? null : tags };
}

// A signed listing from the artist's browser: signed (BIP-340), a live event, by the artist's Nostr key, just now,
// newer than the last one, with no words of its own and exactly the tags the server built (so no stream link).
export async function checkListing(ev, { tags, pubkey, last = null, at = Math.floor(Date.now() / 1000) }) {
  if (!(await verifyEvent(ev))) return 'bad_signature';
  if (ev.kind !== LIVE_KIND) return 'wrong_kind';
  if (!pubkey || ev.pubkey !== pubkey) return 'wrong_key';
  if (Math.abs(ev.created_at - at) > FRESH) return 'too_old';
  if (last && ev.created_at <= last.created_at) return 'not_newer';
  if (!tags) return 'nothing_to_send';
  if (ev.content !== '' || !same(ev.tags, tags)) return 'wrong_tags';
  return null;
}

// The gig as it is now, for the listing: on or off, who it's for, and how to build its tags.
async function gigNow(c) {
  const { show, path } = await current(c);
  const [stage, times, nightStart, key, practice] = await Promise.all([stageNow(show), kv.get('stageTimes', {}), kv.get('nightStart', ''), artistKey(), practiceGig()]);
  const nostr = await nutzapInfo(key); // the artist's Nostr key and relays: the Nutzap note's
  const site = siteUrl(c);
  const photos = await photoUrls();
  const pic = photos.wide1 || photos.wide2 || (await photoUrl());
  const on = show.nostrLive ?? !practice;
  const build = (d) => listingTags({ d, show, stage, times, opens: opensAt(show), link: `${site}${path}`, image: pic ? `${site}${pic}` : null,
    pubkey: nostr.pubkey, relays: nostr.relays });
  return { on, practice, stage, nostr, gig: `${nightStart}|${show.page}|${show.date}`, build };
}
const MISSING = { gig: null, d: null, event: null, endAt: null };

export function mountNostrLive(route, admin) {
  // Show Time asks (the artist's browser only: the key never reaches a producer's): what to sign now, if anything.
  route('GET', '/api/admin/nostr-live', admin, async (c) => {
    const g = await gigNow(c);
    const state = await kv.get('nostrLive', MISSING);
    if (!g.nostr) return json({ on: g.on, practice: g.practice, want: null, why: 'no_key' }); // no Nutzap note yet
    const now = Math.floor(Date.now() / 1000);
    const w = wanted({ on: g.on, gig: g.gig, state, build: g.build, now });
    if (!same(w.state, state)) await kv.set('nostrLive', w.state);
    const sent = w.state.gig === g.gig ? w.state.event : null; // this gig's: an old gig's ending isn't Show Time's news
    return json({ on: g.on, practice: g.practice, want: w.tags && { kind: LIVE_KIND, content: '', tags: w.tags },
      sent: sent ? { status: tagOf(sent, 'status'), at: sent.created_at, starts: Number(tagOf(sent, 'starts')) || null, ends: Number(tagOf(sent, 'ends')) || null } : null,
      last: w.state.event?.created_at ?? null, relays: g.nostr.relays, pubkey: g.nostr.pubkey });
  });
  route('PUT', '/api/admin/nostr-live', admin, async (c) => {
    const ev = (await body(c))?.event;
    const g = await gigNow(c);
    const state = await kv.get('nostrLive', MISSING);
    const now = Math.floor(Date.now() / 1000);
    const w = g.nostr ? wanted({ on: g.on, gig: g.gig, state, build: g.build, now }) : { state, tags: null };
    const why = await checkListing(ev, { tags: w.tags, pubkey: g.nostr?.pubkey, last: w.state.event, at: now });
    if (why) return json({ error: why, detail: 'That Nostr listing didn’t check out.' }, why === 'nothing_to_send' ? 409 : 400);
    // Sent again after it ended (switched back on): the next end gets a time of its own.
    await kv.set('nostrLive', { ...w.state, event: ev, ...(tagOf(ev, 'status') === 'ended' ? {} : { endAt: null }) });
    return json({ ok: true, listed: tagOf(ev, 'status'), relays: g.nostr.relays });
  });
}
