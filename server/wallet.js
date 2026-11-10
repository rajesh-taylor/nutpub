// The room ticket as a wallet card (.pkpass): Apple Wallet, and open wallets on Android (Catima, PassAndroid) read
// the same file. Made on the spot from the ticket's door code; nothing is kept. The card holds the door QR (the
// same link as the page's), the artist, venue and date: no name, no email, nothing about who bought it.
import { SITE_URL, PASS_KEY, PASS_CERT, PASS_TEAM, PASS_TYPE } from './config.js';
import { one } from './db.js';
import { json } from './http.js';
import { showOf, opensAt, gigOver, current } from './shows.js';
import { makePkpass } from './pass.js';
import { PASS_IMAGES } from './pass-images.js';

const CODE = /^[0-9a-f]{24}$/;
const b64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const IMAGES = Object.fromEntries(Object.entries(PASS_IMAGES).map(([k, v]) => [k, b64(v)]));
const field = (key, label, value, more = {}) => ({ key, label, value, ...more });

// pass.json for one ticket. Colours: the site's night blue, cream and amber.
export function passJson(show, code, site) {
  // The one start time in UK time, with its offset (+00:00 or +01:00); shown as UK time on any phone.
  const at = opensAt(show);
  const hhmm = show.streams || show.starts;
  const offset = at ? (Date.parse(`${show.date}T${hhmm}:00Z`) / 1000 - at) / 3600 : 0;
  const when = at ? `${show.date}T${hhmm}:00+0${offset}:00` : show.date ? `${show.date}T12:00:00+00:00` : null;
  const door = `${site}/door.html#t=${code}`;
  const page = show.page ? `${site}/${show.page}` : site;
  const artist = show.artist || 'The show';
  return {
    formatVersion: 1, passTypeIdentifier: PASS_TYPE, teamIdentifier: PASS_TEAM, serialNumber: code,
    organizationName: 'The NutPub', description: `Ticket: ${artist}`,
    foregroundColor: 'rgb(239, 227, 200)', labelColor: 'rgb(217, 149, 58)', backgroundColor: 'rgb(5, 9, 20)',
    ...(when ? { relevantDate: when, expirationDate: nextMorning(show.date) } : {}),
    barcodes: [{ format: 'PKBarcodeFormatQR', message: door, messageEncoding: 'iso-8859-1', altText: 'The NutPub' }],
    barcode: { format: 'PKBarcodeFormatQR', message: door, messageEncoding: 'iso-8859-1', altText: 'The NutPub' }, // iOS 8 and older
    eventTicket: {
      primaryFields: [field('artist', 'ARTIST', artist)],
      secondaryFields: [
        ...(when ? [field('when', 'DATE', when, { dateStyle: 'PKDateStyleMedium', timeStyle: at ? 'PKDateStyleShort' : 'PKDateStyleNone', ignoresTimeZone: true })] : []),
        ...(show.venue ? [field('venue', 'VENUE', show.venue)] : []),
      ],
      auxiliaryFields: [field('ticket', 'TICKET', 'Room · one entry')],
      backFields: [
        ...(show.venue ? [field('b-venue', 'Venue', show.venue)] : []),
        ...(when ? [field('b-when', 'Date and time', when, { dateStyle: 'PKDateStyleFull', timeStyle: at ? 'PKDateStyleShort' : 'PKDateStyleNone', ignoresTimeZone: true })] : []),
        ...(show.description ? [field('b-notes', `From ${artist}`, show.description)] : []),
        field('b-page', 'The gig page', page),
        field('b-door', 'At the door', 'The QR on the front gets you in once. The gig page shows the same QR if this card is lost.'),
      ],
    },
  };
}
// Wallet greys the card out the morning after the gig.
const nextMorning = (date) => {
  const d = new Date(`${date}T06:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace('.000', '');
};

export function mountWallet(route) {
  // GET /api/door/ticket.pkpass?code=<door code>: the code is the ticket's own (the page has it); without the door
  // check on, or for an online ticket, there is no card, as there is no QR.
  route('GET', '/api/door/ticket.pkpass', async (c) => {
    const code = c.url.searchParams.get('code') || '';
    if (!CODE.test(code)) return json({ error: 'bad_code' }, 400);
    if (!PASS_KEY || !PASS_CERT) return json({ error: 'no_wallet', detail: 'Wallet cards are not set up on this server.' }, 503);
    const show = await showOf(c);
    if (!(show.ticket.on && show.door.on)) return json({ error: 'off', detail: 'This gig has no door check, so no card.' }, 409);
    if (await gigOver(await current(c))) return json({ error: 'over', detail: 'This gig is over.' }, 410);
    if (!(await one("SELECT 1 AS x FROM tickets WHERE code = ? AND kind = 'room'", code))) return json({ error: 'unknown' }, 404);
    const file = await makePkpass({ 'pass.json': passJson(show, code, SITE_URL || c.url.origin), ...IMAGES }, { keyPem: PASS_KEY, certPem: PASS_CERT });
    return new Response(file, { headers: { 'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="ticket.pkpass"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
}
