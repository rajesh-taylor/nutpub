// Settings from the Worker's environment (wrangler.jsonc `vars`; ADMIN_KEY is a secret). Set once per request.
export let MINT_URL = '';
export let SITE_URL = null;
export let MINT_TEST = true;
export let ADMIN_KEY = '';
export let VERSION = '0';
// The NutPub's share of what fans pay, in percent (wrangler.jsonc FEE_PERCENT). Shown on Takings; not taken yet.
export let FEE_PERCENT = 5;
export let ASSETS;
// What streaming costs, in pence: a Worker secret (npx wrangler secret put PRICING), never in the repo. JSON:
// { replayHour, replayMin, viewerHour }: the replay's lowest price an hour of the show and its lowest price at all, and
// what one viewer watching for an hour costs (a free-to-watch stream, paid up front). Unset: no minimum, nothing to
// pay up front. shows.js does the sums.
export let PRICING = { replayHour: 0, replayMin: 0, viewerHour: 0 };
// The NutPub's own public key (a secret, NUTPUB_KEY): what the artist pays up front is locked to it (NUT-11).
export let NUTPUB_KEY = '';
// Free to watch, paid up front (session 35): kept, but off for NutNovember (Rajesh 19 Nov: too much for judges); to be
// rethought in December. Off: nothing to pay, no Free to watch card, the test mint's viewer limit as before. The var
// UPFRONT=1 turns it on (the tests do).
export let UPFRONT = false;
// The wallet card: our Apple Pass Type ID, the team it belongs to, and its key and certificate (secrets, PEM).
export let PASS_TYPE = '';
export let PASS_TEAM = '';
export let PASS_KEY = '';
export let PASS_CERT = '';
// Google Wallet: our issuer ID, the signer's email (both public) and its private key (a secret, PEM).
export let GWALLET_ISSUER = '';
export let GWALLET_EMAIL = '';
export let GWALLET_KEY = '';
// Stripe Connect (session 62): card money goes straight to the artist's own Stripe account. Secrets, set by Rajesh
// (nutpub-local.env locally, wrangler secrets live). Test keys only: a live key leaves cards off.
export let STRIPE_SECRET_KEY = '';
export let STRIPE_PUBLISHABLE_KEY = '';

const trim = (url) => String(url).replace(/\/+$/, '');
export function configure(env) {
  // The mint's public URL: it is written into every token and payment request. A public test mint (fake
  // Lightning, no real value) since 29 Oct: the NutPub never runs a mint of its own.
  MINT_URL = trim(env.MINT_URL);
  // The site's public address, for QR codes and links. Unset: whatever the page was loaded from.
  SITE_URL = env.SITE_URL ? trim(env.SITE_URL) : null;
  // Every page then carries the TEST banner. MINT_TEST=0 turns it off for a real mint (not in v1.0).
  MINT_TEST = env.MINT_TEST !== '0';
  ADMIN_KEY = env.ADMIN_KEY || '';
  VERSION = env.VERSION || '0';
  FEE_PERCENT = Number.isFinite(Number(env.FEE_PERCENT)) && env.FEE_PERCENT !== '' ? Math.min(Math.max(Number(env.FEE_PERCENT), 0), 50) : 5;
  ASSETS = env.ASSETS;
  PRICING = (() => {
    let p = {};
    try { p = JSON.parse(env.PRICING || '{}'); } catch {}
    const n = (v) => Math.max(0, Number(v) || 0);
    return { replayHour: n(p.replayHour), replayMin: n(p.replayMin), viewerHour: n(p.viewerHour) };
  })();
  UPFRONT = env.UPFRONT === '1';
  NUTPUB_KEY = /^0[23][0-9a-f]{64}$/.test(String(env.NUTPUB_KEY || '').toLowerCase()) ? env.NUTPUB_KEY.toLowerCase() : '';
  PASS_TYPE = env.PASS_TYPE || '';
  PASS_TEAM = env.PASS_TEAM || '';
  PASS_KEY = env.PASS_KEY || '';
  PASS_CERT = env.PASS_CERT || '';
  GWALLET_ISSUER = env.GWALLET_ISSUER || '';
  GWALLET_EMAIL = env.GWALLET_EMAIL || '';
  GWALLET_KEY = env.GWALLET_KEY || '';
  const test = (k, ...starts) => (starts.some((p) => String(k || '').startsWith(p)) ? String(k).trim() : '');
  STRIPE_SECRET_KEY = test(env.STRIPE_SECRET_KEY, 'sk_test_', 'rk_test_');
  STRIPE_PUBLISHABLE_KEY = test(env.STRIPE_PUBLISHABLE_KEY, 'pk_test_');
}
