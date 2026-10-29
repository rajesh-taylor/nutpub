// Settings from the Worker's environment (wrangler.jsonc `vars`; ADMIN_KEY is a secret). Set once per request.
export let MINT_URL = '';
export let SITE_URL = null;
export let MINT_TEST = true;
export let ADMIN_KEY = '';
export let VERSION = '0';
export let ASSETS;

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
}
