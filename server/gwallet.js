// The room ticket in Google Wallet: a "Save to Google Wallet" link, a JWT signed with our signer's key (RS256,
// WebCrypto; 1 to 3 ms of CPU on Cloudflare, 11 Nov). Nothing is sent to Google from here: the phone takes the link
// to Google, which adds the card. Same door QR, artist, venue and date as the Apple card; nothing about who bought it.
// One card design (a "class") per version of the gig's details: an id from their hash, so a change makes a new one
// for new tickets (a link can't change a class Google already has; updating cards comes with the REST API later).
import { SITE_URL, GWALLET_ISSUER, GWALLET_EMAIL, GWALLET_KEY } from './config.js';
import { json } from './http.js';
import { roomTicket, startOf, nextMorning, DOOR_NOTE } from './wallet.js';

const text = (value) => ({ defaultValue: { language: 'en-GB', value } });
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

// The class (the gig) and the object (this ticket), as Google's eventTicket types.
export async function gwalletCard(show, code, site, issuer) {
  const { when } = startOf(show);
  const page = show.page ? `${site}/${show.page}` : site;
  const artist = show.artist || 'The show';
  // "Name & address of venue" is one box: the name is up to the first comma.
  const [vName, ...vRest] = (show.venue || '').split(',');
  const venue = show.venue ? { name: text(vName.trim()), address: text(vRest.join(',').trim() || vName.trim()) } : undefined;
  const cls = {
    issuerName: 'The NutPub', reviewStatus: 'UNDER_REVIEW', eventName: text(artist), hexBackgroundColor: '#050914',
    ...(venue ? { venue } : {}),
    ...(when ? { dateTime: { start: when } } : {}),
  };
  const version = hex(await crypto.subtle.digest('SHA-256', utf8(JSON.stringify(cls)))).slice(0, 16);
  cls.id = `${issuer}.gig-${(show.page || 'show').replace(/[^\w-]/g, '')}-${version}`;
  const obj = {
    id: `${issuer}.t-${code}`, classId: cls.id, state: 'ACTIVE',
    // No barcode (11 Nov): a reminder; the way in is the ticket page's QR, new every 30 seconds.
    ...(show.date ? { validTimeInterval: { end: { date: nextMorning(show.date) } } } : {}), // greyed out the morning after
    textModulesData: [
      { id: 'ticket', header: 'Ticket', body: 'Room · one entry' },
      ...(show.description ? [{ id: 'notes', header: `From ${artist}`, body: show.description }] : []),
      { id: 'door', header: 'At the door', body: DOOR_NOTE },
    ],
    linksModuleData: { uris: [{ id: 'page', uri: page, description: 'The gig page' }] },
  };
  return { cls, obj };
}

// The signer's key, read once per Worker.
let keyFor = null;
const signingKey = (pem) => {
  if (keyFor?.pem !== pem) {
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (ch) => ch.charCodeAt(0));
    keyFor = { pem, key: crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']) };
  }
  return keyFor.key;
};

export async function saveLink({ cls, obj }, { email, keyPem, site }) {
  const claims = { iss: email, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000), origins: [site],
    payload: { eventTicketClasses: [cls], eventTicketObjects: [obj] } };
  const body = `${b64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${b64url(utf8(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(keyPem), utf8(body));
  return `https://pay.google.com/gp/v/save/${body}.${b64url(sig)}`;
}

export function mountGoogleWallet(route) {
  // GET /api/door/ticket.gwallet?code=<door code>: the same checks as the Apple card, then off to Google.
  route('GET', '/api/door/ticket.gwallet', async (c) => {
    if (!GWALLET_ISSUER || !GWALLET_EMAIL || !GWALLET_KEY) return json({ error: 'no_wallet', detail: 'Google Wallet is not set up on this server.' }, 503);
    const { show, code, refused } = await roomTicket(c);
    if (refused) return refused;
    const site = SITE_URL || c.url.origin;
    const link = await saveLink(await gwalletCard(show, code, site, GWALLET_ISSUER), { email: GWALLET_EMAIL, keyPem: GWALLET_KEY, site });
    return new Response(null, { status: 302, headers: { Location: link, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  });
}
