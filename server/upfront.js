// A free-to-watch stream, paid for up front (session 35, agreed with Rajesh 19 Nov): no gig may lose us money. On
// Plan gig the artist picks the most viewers at once; the price (shows.js freePence: by viewers and hours, plus the
// spare hour) is one 402 from the artist's own wallet, locked to the NutPub's key (NUT-11), never to this server.
// More viewers or a longer show later: the difference. Until it's paid the stream can't open (door.js, live.js).
import { kv } from './db.js';
import { json, now } from './http.js';
import { cashuGate } from './gate.js';
import { showOf, freeStatus } from './shows.js';
import { NUTPUB_KEY } from './config.js';

export function mountUpfront(route, admin, crew = admin) { // crew: the artist or their producer (session 55)
  route('GET', '/api/admin/free-stream', crew, async (c) => json(await freeStatus(await showOf(c))));

  route('GET', '/api/admin/free-stream/pay', admin,
    async (c) => {
      const show = await showOf(c);
      if (show.stream.mode !== 'free') return json({ error: 'not_free', detail: 'This gig’s stream isn’t free to watch.' }, 409);
      const s = await freeStatus(show);
      if (!s.pence) return json({ error: 'not_ready', detail: 'Set the most viewers and the stream’s end time first.' }, 409);
      if (s.covered) return json(s);
      if (!NUTPUB_KEY) return json({ error: 'no_key', detail: 'This site has no NutPub key yet (NUTPUB_KEY).' }, 409);
      c.status = s;
      return null;
    },
    cashuGate((c) => c.status.dueSats, async (c) => `${(await showOf(c)).title || 'The show'}: a free stream for ${c.status.viewers} viewers`,
      { lockTo: () => NUTPUB_KEY, kind: 'upfront', owner: () => 'The NutPub' }),
    async (c) => {
      const s = c.status;
      const was = (await kv.get('freePaid', null)) || { pence: 0, sats: 0 };
      await kv.set('freePaid', { pence: was.pence + s.due, sats: was.sats + c.paid, viewers: s.viewers, minutes: s.minutes, at: now() });
      return json({ ...(await freeStatus(await showOf(c))), paidNow: c.paid });
    });
}
