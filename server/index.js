// The NutPub's server: a Cloudflare Worker (free plan). Each artist's stage keeps its own database: Longy's is D1 at
// thenutpub.com, as it always was; every other stage (<id>.thenutpub.com, made by Put on a gig) is a SQLite Durable
// Object of its own (stage.js), so two stages' tickets, chat and takings never mix. Here the request's address picks
// the stage; app.js does the rest, the same for every stage.
import { configure, SITE_URL } from './config.js';
import { withStage, d1Stage, addColumns } from './db.js';
import { serve } from './app.js';
import { useStream } from './live.js';
import { closeNights } from './closing.js';
import { stageIdOf, stageStub, closeOldStages } from './stages.js';

export { Stage } from './stage.js';

// Longy's D1: columns added since it was made (db.js), checked once per Worker start. Failed: tried again next request.
let d1Columns = null;
const d1Ready = (d1) => (d1Columns ??= addColumns(d1Stage(d1)).catch((e) => { d1Columns = null; console.log(`columns: ${String(e.message || e).slice(0, 200)}`); }));

export default {
  async fetch(req, env) {
    configure(env);
    const url = new URL(req.url);
    const id = stageIdOf(url.hostname);
    if (id) return stageStub(env, id).fetch(req);
    // Any other name under thenutpub.com (the route *.thenutpub.com catches them all): www is the home page; the rest
    // (mint.thenutpub.com's tunnel, say) go on to their own server, untouched, as before the stages.
    const apex = SITE_URL && new URL(SITE_URL).hostname;
    if (apex && url.hostname === `www.${apex}`) return Response.redirect(`${SITE_URL}${url.pathname}${url.search}`, 301);
    if (apex && url.hostname.endsWith(`.${apex}`)) return fetch(req);
    await d1Ready(env.DB);
    return withStage(d1Stage(env.DB), () => serve(req, env));
  },
  // Once a day (wrangler.jsonc, triggers): each stage's night records and recordings, 7 days after its gig (closing.js).
  async scheduled(event, env, ctx) {
    configure(env); useStream(env);
    const log = (who) => (e) => console.log(`closing ${who}: ${String(e.stack || e).slice(0, 300)}`);
    ctx.waitUntil((async () => {
      await d1Ready(env.DB);
      await withStage(d1Stage(env.DB), () => closeNights(event.scheduledTime)).catch(log('longy'));
      await closeOldStages(env, event.scheduledTime).catch(log('stages')); // 7 days after they're made
      const { results } = await env.DB.prepare('SELECT id FROM stages').all();
      for (const { id } of results) await stageStub(env, id).close(event.scheduledTime).catch(log(id));
    })());
  },
};
