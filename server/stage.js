// One artist's stage: a SQLite Durable Object with the same tables as Longy's D1 (schema.sql), made by Put on a gig
// (stages.js). Every request for <id>.thenutpub.com comes here and runs app.js on this stage's own database; the
// daily clean-up and the sign-in's one-time code come here too, from the Worker (index.js, stages.js).
import { DurableObject } from 'cloudflare:workers';
import schema from '../schema.sql';
import { configure, SITE_URL } from './config.js';
import { sqliteStage, withStage } from './db.js';
import { randomHex } from './http.js';
import { serve } from './app.js';
import { useStream } from './live.js';
import { makeHandoff } from './handoff.js';
import { closeNights } from './closing.js';

export class Stage extends DurableObject {
  // This stage's database, or null if it was never made (any other <id>.thenutpub.com): nothing is written then.
  open() {
    if (this.db) return this.db;
    const { sql } = this.ctx.storage;
    let row;
    try { row = sql.exec("SELECT value FROM kv WHERE key = 'stage'").toArray()[0]; } catch { return null; } // no tables yet
    if (!row) return null;
    sql.exec(schema); // tables added since it was made (every statement is IF NOT EXISTS)
    const { id, adminKey } = JSON.parse(row.value);
    return (this.db = sqliteStage(this.ctx.storage, { id, adminKey }));
  }
  ready() { configure(this.env); useStream(this.env); return this.open(); }

  // Made once, by Put on a gig: the tables, the stage's id and its setup key (the artist's, as Longy's ADMIN_KEY is).
  // Gives back a one-time code that signs the artist in on their new stage.
  async setup(id) {
    configure(this.env);
    const { sql } = this.ctx.storage;
    sql.exec(schema);
    sql.exec("INSERT OR IGNORE INTO kv (key, value) VALUES ('stage', ?)", JSON.stringify({ id, adminKey: randomHex(32), made: new Date().toISOString() }));
    this.db = null;
    return this.handoff();
  }
  // Back to your stage: a fresh one-time code (5 minutes, once), traded on the stage's page for the setup key.
  async handoff() {
    const db = this.ready();
    return db ? withStage(db, () => makeHandoff()) : null;
  }
  async close(at) {
    const db = this.ready();
    return db ? withStage(db, () => closeNights(at)) : null;
  }
  async fetch(req) {
    const db = this.ready();
    if (!db) return Response.redirect(SITE_URL || new URL('/', req.url).origin, 302); // no such stage: the home page
    return withStage(db, () => serve(req, this.env));
  }
}
