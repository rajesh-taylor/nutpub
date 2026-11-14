// The venue ticket as a wallet card (.pkpass): Apple Wallet, and open wallets on Android (Catima, PassAndroid) read
// the same file. Made on the spot from the ticket's door code; nothing is kept. The card holds the door QR (the
// same link as the page's), the artist, venue and date: no name, no email, nothing about who bought it.
import { siteUrl } from './db.js';
import { PASS_KEY, PASS_CERT, PASS_TEAM, PASS_TYPE } from './config.js';
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
// The one start time in UK time, with its offset (+00:00 or +01:00); shown as UK time on any phone. No time: midday.
export function startOf(show) {
  const at = opensAt(show);
  const hhmm = show.streams || show.starts;
  const offset = at ? (Date.parse(`${show.date}T${hhmm}:00Z`) / 1000 - at) / 3600 : 0;
  return { at, when: at ? `${show.date}T${hhmm}:00+0${offset}:00` : show.date ? `${show.date}T12:00:00+00:00` : null };
}

// What both wallets say about the door.
export const DOOR_NOTE = 'Open the gig page on the phone you bought with and press Show at the door. Its QR changes every 30 seconds, so a screenshot won\u2019t get in. If the venue may have no signal, open it before you go in and keep it open.';

export function passJson(show, code, site) {
  const { at, when } = startOf(show);
  const page = show.page ? `${site}/${show.page}` : site;
  const artist = show.artist || 'The show';
  return {
    formatVersion: 1, passTypeIdentifier: PASS_TYPE, teamIdentifier: PASS_TEAM, serialNumber: code,
    organizationName: 'The NutPub', logoText: 'The NutPub', // small, top left, out of the QR's way
    description: `Ticket: ${artist}`,
    foregroundColor: 'rgb(239, 227, 200)', labelColor: 'rgb(217, 149, 58)', backgroundColor: 'rgb(5, 9, 20)',
    ...(when ? { relevantDate: when, expirationDate: nextMorning(show.date) } : {}),
    // No QR (11 Nov): a card's QR can't change, so it could be copied. The card is the reminder; the way in is the
    // ticket page's QR, new every 30 seconds.
    eventTicket: {
      primaryFields: [field('artist', 'ARTIST', artist)],
      secondaryFields: [
        ...(when ? [field('when', 'DATE', when, { dateStyle: 'PKDateStyleMedium', timeStyle: at ? 'PKDateStyleShort' : 'PKDateStyleNone', ignoresTimeZone: true })] : []),
      ],
      // The venue on a line of its own: beside the date it ran into it on an iPhone.
      auxiliaryFields: show.venue ? [field('venue', 'VENUE', show.venue)] : [],
      backFields: [
        ...(show.venue ? [field('b-venue', 'Venue', show.venue)] : []),
        ...(when ? [field('b-when', 'Date and time', when, { dateStyle: 'PKDateStyleFull', timeStyle: at ? 'PKDateStyleShort' : 'PKDateStyleNone', ignoresTimeZone: true })] : []),
        ...(show.description ? [field('b-notes', `From ${artist}`, show.description)] : []),
        field('b-ticket', 'Ticket', 'Room · one entry'),
        field('b-page', 'The gig page', page),
        field('b-door', 'At the door', DOOR_NOTE),
      ],
    },
  };
}
// Wallet greys the card out the morning after the gig.
export const nextMorning = (date) => {
  const d = new Date(`${date}T06:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().replace('.000', '');
};

// The checks both wallets make: a venue ticket's own door code, the door check on, the gig not over.
export async function roomTicket(c) {
  const code = c.url.searchParams.get('code') || '';
  if (!CODE.test(code)) return { refused: json({ error: 'bad_code' }, 400) };
  const show = await showOf(c);
  if (!(show.ticket.on && show.door.on)) return { refused: json({ error: 'off', detail: 'This gig has no door check, so no card.' }, 409) };
  if (await gigOver(await current(c))) return { refused: json({ error: 'over', detail: 'This gig is over.' }, 410) };
  if (!(await one("SELECT 1 AS x FROM tickets WHERE code = ? AND kind = 'room'", code))) return { refused: json({ error: 'unknown' }, 404) };
  return { show, code };
}

export function mountWallet(route) {
  // GET /api/door/ticket.pkpass?code=<door code>: the code is the ticket's own (the page has it); without the door
  // check on, or for a Watch online ticket, there is no card, as there is no QR.
  route('GET', '/api/door/ticket.pkpass', async (c) => {
    if (!PASS_KEY || !PASS_CERT) return json({ error: 'no_wallet', detail: 'Wallet cards are not set up on this server.' }, 503);
    const { show, code, refused } = await roomTicket(c);
    if (refused) return refused;
    const file = await makePkpass({ 'pass.json': passJson(show, code, siteUrl(c)), ...IMAGES }, { keyPem: PASS_KEY, certPem: PASS_CERT });
    return new Response(file, { headers: { 'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="ticket.pkpass"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
}
