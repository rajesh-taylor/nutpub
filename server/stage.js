// One artist's stage: a SQLite Durable Object with the same tables as Longy's D1 (schema.sql), made by Put on a gig
// (stages.js). Every request for <id>.thenutpub.com comes here and runs app.js on this stage's own database; the
// daily clean-up and the sign-in's one-time code come here too, from the Worker (index.js, stages.js).
import { DurableObject } from 'cloudflare:workers';
import schema from '../schema.sql';
import { configure, SITE_URL } from './config.js';
import { sqliteStage, withStage, kv } from './db.js';
import { randomHex } from './http.js';
import { serve } from './app.js';
import { useStream, stopPractice, closeStream } from './live.js';
import { makeHandoff } from './handoff.js';
import { closeNights } from './closing.js';
import { setlist } from './setlist.js';
import { currentShow, stageNow } from './shows.js';

// The stage's own id and setup key, in its kv table. Never 'stage': that's the gig's doors/open/on/closed.
const SELF = 'stage-self';

export class Stage extends DurableObject {
  // This stage's database, or null if it was never made (any other <id>.thenutpub.com): nothing is written then.
  open() {
    if (this.db) return this.db;
    const { sql } = this.ctx.storage;
    const read = (key) => { const r = sql.exec('SELECT value FROM kv WHERE key = ?', key).toArray()[0]; return r ? JSON.parse(r.value) : null; };
    let self;
    try { self = read(SELF); } catch { return null; } // no tables yet
    if (!self) {
      // Stages made 14 Nov kept this under 'stage', the name the gig's doors/open state also uses (kv.get('stage')):
      // /api/stage showed it to anyone, and a stage button would have written over it. Moved, with a new setup key
      // (the old one was public): the artist signs in again with their passkey (Back to your stage).
      const old = read('stage');
      if (!old?.id) return null;
      self = { ...old, adminKey: randomHex(32) };
      this.ctx.storage.transactionSync(() => {
        sql.exec('INSERT INTO kv (key, value) VALUES (?, ?)', SELF, JSON.stringify(self));
        sql.exec("DELETE FROM kv WHERE key = 'stage'");
      });
    }
    sql.exec(schema); // tables added since it was made (every statement is IF NOT EXISTS)
    return (this.db = sqliteStage(this.ctx.storage, { id: self.id, adminKey: self.adminKey, made: self.made || null }));
  }
  ready() { configure(this.env); useStream(this.env); return this.open(); }

  // Made once, by Put on a gig or a gig card on /judge (only: that one gig): the tables, the stage's id and its setup
  // key (the artist's, as Longy's ADMIN_KEY is). Gives back a one-time code that signs the artist in on their new stage.
  async setup(id, only = null) {
    configure(this.env);
    const { sql } = this.ctx.storage;
    sql.exec(schema);
    sql.exec('INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)', SELF, JSON.stringify({ id, adminKey: randomHex(32), made: new Date().toISOString() }));
    this.db = null;
    const db = this.ready();
    await withStage(db, () => setlist(this.env, only)); // the example gigs (or the one), this stage's own copies
    return this.handoff();
  }
  // Back to your stage: a fresh one-time code (5 minutes, once), traded on the stage's page for the setup key.
  async handoff() {
    const db = this.ready();
    return db ? withStage(db, () => makeHandoff()) : null;
  }
  // The artist's passkey opens this stage (stages.js, session 53): its name, for Cellar's Artist passkey row.
  async passkey(name) {
    const db = this.ready();
    if (db) await withStage(db, () => kv.set('artist-passkey', { name: String(name || ''), at: new Date().toISOString() }));
  }
  // Back to your gigs: what the list says about this stage (artist · venue · on now), and a fresh one-time code.
  async welcome() {
    const db = this.ready();
    if (!db) return null;
    return withStage(db, async () => {
      const { show } = await currentShow();
      const list = await kv.get('setlist', null);
      const now = await stageNow(show);
      const state = list?.only && list.done?.includes(list.at) ? 'done' : now === 'closed' ? 'over' : now === 'on' ? 'on' : 'soon';
      return { gig: list?.only ? list.at : null, artist: show.artist || '', venue: String(show.venue || '').split(',')[0].trim(), state, code: await makeHandoff() };
    });
  }
  async close(at) {
    const db = this.ready();
    return db ? withStage(db, () => closeNights(at)) : null;
  }
  // Closed for good, 7 days after it was made (stages.js): Stream's recordings and input, then every row and the alarm.
  // Its address then goes to the home page, as an address that was never a stage does.
  async shut() {
    const db = this.ready();
    if (db) await withStage(db, () => closeStream());
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.db = null;
  }
  // The practice stream's 20 minutes are up (live.js).
  async alarm() {
    const db = this.ready();
    if (db) await withStage(db, () => stopPractice());
  }
  async fetch(req) {
    const db = this.ready();
    if (!db) return Response.redirect(SITE_URL || new URL('/', req.url).origin, 302); // no such stage: the home page
    return withStage(db, () => serve(req, this.env));
  }
}
