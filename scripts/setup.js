// Opens the setup page in the Mac's browser, with the admin key after the # (it never reaches a server log).
// The key is ADMIN_KEY in .env (the same as the Worker's secret).
//   npm run setup            opens the live site's
//   npm run setup -- --local opens the one `npm start` runs (http://localhost:8787)
//   npm run setup -- --qr    draws it as a QR code, for a phone's camera (not on a shared screen: it holds the key)
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);
const key = process.env.ADMIN_KEY;
if (!key) { console.error('No ADMIN_KEY in .env.'); process.exit(1); }
const site = process.argv.includes('--local') ? 'http://localhost:8787' : `https://${process.env.SITE_HOST || 'thenutpub.com'}`;
const link = `${site}/setup.html#k=${key}`;
if (process.argv.includes('--qr')) {
  console.log(await QRCode.toString(link, { type: 'terminal', small: true, errorCorrectionLevel: 'L' }));
  console.log(`Scan with the phone's camera: ${site}/setup.html (the key is in the code).`);
} else {
  execFileSync('open', [link]);
  console.log(`Opened ${site}/setup.html in your browser.`);
}
