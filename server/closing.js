// Closing the gig: a night's records are kept 7 days after it ends, then deleted, and so is its recording. Run once a
// day by the Worker's cron (wrangler.jsonc, `triggers`). Stream's own setting (deleteRecordingAfterDays) can't go below
// 30, so the recordings are deleted here. Sats the artist hasn't collected (`locked`, collected_at null) stay: they're
// the artist's money, sealed to their key, until they take them.
import { one, run, sql, batch, kv } from './db.js';
import { currentShow, gigOver } from './shows.js';
import { recordings, deleteRecording } from './live.js';

export const KEEP_DAYS = 7;
const DAY = 86_400_000;

// The night's records, all at once (the gig ended 7 days ago).
const NIGHT = ['tickets', 'passkeys', 'nostr', 'nutzaps', 'drinks', 'live_paid', 'watchers', 'paid', 'tips', 'messages'];

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
    // One line per gig kept for good (Takings, later): its date and totals, nothing about anyone.
    const { show } = await currentShow();
    const totals = await one(`SELECT
      (SELECT COUNT(*) FROM tickets WHERE kind = 'room') AS room, (SELECT COUNT(*) FROM tickets WHERE kind = 'home') AS home,
      (SELECT COUNT(*) FROM tickets WHERE checked_at IS NOT NULL) AS inside,
      (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE at >= ?) AS sats, (SELECT COALESCE(SUM(sats), 0) FROM locked WHERE kind = 'tip' AND at >= ?) AS tips`,
      await kv.get('nightStart', ''), await kv.get('nightStart', ''));
    // Stream's minutes for budgeting: how long tonight's recordings run (Stream bills storage by the minute).
    const since = await kv.get('nightStart', '');
    const recorded = await recordings().then((vs) => vs.filter((v) => !since || v.created >= since)
      .reduce((m, v) => m + Math.max(0, v.duration || 0) / 60, 0)).catch(() => null);
    await kv.set('gigs', [...(await kv.get('gigs', [])), { date: show.date, page: show.page, ended, tickets: { room: totals.room, home: totals.home, inside: totals.inside },
      sats: totals.sats, tips: totals.tips, recordedMinutes: recorded === null ? null : Math.round(recorded) }]);
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
