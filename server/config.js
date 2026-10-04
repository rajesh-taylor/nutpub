// Settings from the environment (.env, loaded by scripts/start.js). Every one has a default that works on a laptop.
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DATA = `${ROOT}data`;

export const PORT = Number(process.env.PORT || 8787);
export const MINT_PORT = Number(process.env.MINT_PORT || 3340);

const trim = (url) => String(url).replace(/\/+$/, '');
// The mint's public URL: it is written into every token and payment request.
export const MINT_URL = trim(process.env.MINT_URL || `http://127.0.0.1:${MINT_PORT}`);
// Where this server itself talks to the mint: straight to the local port, not round the tunnel.
export const MINT_API = trim(process.env.MINT_API || `http://127.0.0.1:${MINT_PORT}`);

// The site's public address, for QR codes and links (never location.origin: a phone on localhost would hand out
// its own localhost). Unset: whatever the page was loaded from.
export const SITE_URL = process.env.SITE_HOST ? `https://${process.env.SITE_HOST}` : null;

// Our own test mint (fake Lightning, no real value). Every page then carries the TEST banner. MINT_TEST=0 turns it off
// for a real mint (not in v1.0).
export const MINT_TEST = process.env.MINT_TEST !== '0';
