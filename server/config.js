// Settings from the Worker's environment (wrangler.jsonc `vars`; ADMIN_KEY is a secret). Set once per request.
export let MINT_URL = '';
export let SITE_URL = null;
export let MINT_TEST = true;
export let ADMIN_KEY = '';
export let VERSION = '0';
export let ASSETS;
// The wallet card: our Apple Pass Type ID, the team it belongs to, and its key and certificate (secrets, PEM).
export let PASS_TYPE = '';
export let PASS_TEAM = '';
export let PASS_KEY = '';
export let PASS_CERT = '';
// Google Wallet: our issuer ID, the signer's email (both public) and its private key (a secret, PEM).
export let GWALLET_ISSUER = '';
export let GWALLET_EMAIL = '';
export let GWALLET_KEY = '';

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
  ASSETS = env.ASSETS;
  PASS_TYPE = env.PASS_TYPE || '';
  PASS_TEAM = env.PASS_TEAM || '';
  PASS_KEY = env.PASS_KEY || '';
  PASS_CERT = env.PASS_CERT || '';
  GWALLET_ISSUER = env.GWALLET_ISSUER || '';
  GWALLET_EMAIL = env.GWALLET_EMAIL || '';
  GWALLET_KEY = env.GWALLET_KEY || '';
}
