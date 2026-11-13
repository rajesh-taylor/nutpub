// Closing the gig: a night's records are kept 7 days after it ends, then deleted, and so is its recording. Run once a
// day by the Worker's cron (wrangler.jsonc, `triggers`). Stream's own setting (deleteRecordingAfterDays) can't go below
// 30, so the recordings are deleted here. Sats the artist hasn't collected (`locked`, collected_at null) stay: they're
// the artist's money, sealed to their key, until they take them.
import { one, run, sql, batch, kv } from './db.js';
import { currentShow, gigOver } from './shows.js';
import { recordings, deleteRecording } from './live.js';
import { FEE_PERCENT } from './config.js';

export const KEEP_DAYS = 7;
const DAY = 86_400_000;

// The night's records, all at once (the gig ended 7 days ago).
const NIGHT = ['tickets', 'passkeys', 'nostr', 'nutzaps', 'drinks', 'live_paid', 'watchers', 'paid', 'tips', 'messages'];

// One line per gig kept for good (Takings' Past gigs, and its receipt): the date, the venue and the totals, nothing
// about anyone. Written by Finish gig (or a new date) before the gig is cleared, or here 7 days on, once per gig: the
// gig's start (nightStart) is its id.
export async function keepGigLine(ended = new Date().toISOString()) {
  const start = await kv.get('nightStart', '');
  const gigs = await kv.get('gigs', []);
  if (gigs.some((g) => (g.start ?? null) === start && start)) return null;
  const { show } = await currentShow();
  const t = await one(`SELECT
    (SELECT COUNT(*) FROM tickets WHERE kind = 'room') AS room, (SELECT COUNT(*) FROM tickets WHERE kind = 'home') AS home,
    (SELECT COUNT(*) FROM tickets WHERE checked_at IS NOT NULL) AS inside,
    (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE kind = 'ticket' AND at >= ?1) AS ticketSats,
    (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE kind = 'tip' AND at >= ?1) AS tips,
    (SELECT COUNT(*) FROM locked WHERE kind = 'tip' AND at >= ?1) AS tipsN,
    (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE kind = 'piece' AND at >= ?1) AS homeSats,
    (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE kind = 'drink' AND collected_by = 'artist' AND at >= ?1) AS drinks`, start);
  const sats = t.ticketSats + t.tips + t.homeSats + t.drinks; // the artist's: drinks poured are the bar's
  if (!sats && !t.room && !t.home) return null; // nothing happened: no line
  // Stream's minutes for budgeting: how long this gig's recordings run (Stream bills storage by the minute).
  const recorded = await recordings().then((vs) => vs.filter((v) => !start || v.created >= start)
    .reduce((m, v) => m + Math.max(0, v.duration || 0) / 60, 0)).catch(() => null);
  const line = { start, ended, date: show.date, page: show.page, artist: show.artist, venue: (show.venue || '').split(',')[0].trim(),
    tickets: { room: t.room, home: t.home, inside: t.inside, sats: t.ticketSats }, tips: t.tips, tipsN: t.tipsN, home: t.homeSats,
    drinks: t.drinks, sats, feePercent: FEE_PERCENT, recordedMinutes: recorded === null ? null : Math.round(recorded) };
  await kv.set('gigs', [...gigs, line]);
  return line;
}

export async function closeNights(at = Date.now()) {
  const cutoff = new Date(at - KEEP_DAYS * DAY).toISOString();
  const done = [];
  // When the gig ended: stamped by End night (door.js), or here the first day its date has gone. A gig opened again,
  // or a next gig, takes the stamp away.
  const over = await gigOver(await currentShow());
  let ended = await kv.get('endedAt');
  if (!over && ended) { await run("DELETE FROM kv WHERE key = 'endedAt'"); ended = null; }
  if (over && !ended) ended = await kv.set('endedAt', new Date(at).toISOString());
  if (ended && ended < cutoff && (await kv.get('clearedFor')) !== ended) {
    await keepGigLine(ended);
    await batch([...NIGHT.map((t) => sql(`DELETE FROM ${t}`)), sql('DELETE FROM locked WHERE collected_at IS NOT NULL')]);
    await kv.set('clearedFor', ended); // once per gig
    done.push('night');
  }
  // Earlier nights (before the current gig's New night): their chat, tips and collected payments, 7 days on.
  const since = await kv.get('nightStart', '');
  if (since) {
    const old = since < cutoff ? since : cutoff;
    await batch([sql('DELETE FROM messages WHERE at < ?', old), sql('DELETE FROM tips WHERE at < ?', old),
      sql('DELETE FROM paid WHERE at < ?', old), sql('DELETE FROM locked WHERE collected_at IS NOT NULL AND at < ?', old)]);
  }
  // The recordings: each one 7 days after it was made. One that's still recording is left alone.
  try {
    for (const v of await recordings()) {
      if (v.status?.state === 'live-inprogress') continue;
      if (Date.parse(v.created) < at - KEEP_DAYS * DAY) { await deleteRecording(v.uid); done.push(`video ${v.uid.slice(0, 6)}`); }
    }
  } catch (e) {
    console.log(`closing: recordings ${String(e.message || e).slice(0, 120)}`);
  }
  if (done.length) console.log(`closing: deleted ${done.join(', ')}`);
  return { ended, deleted: done };
}
