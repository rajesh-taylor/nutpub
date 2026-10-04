// Opens the setup page in the Mac's browser, with the admin key after the # (it never reaches a server log).
//   npm run setup            opens it here
//   npm run setup -- --qr    draws it as a QR code, for a phone's camera (not on a shared screen: it holds the key)
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);
const db = new DatabaseSync(`${ROOT}data/nutpub.db`, { readOnly: true });
const key = process.env.ADMIN_KEY || JSON.parse(db.prepare("SELECT value FROM kv WHERE key = 'adminKey'").get().value);
const site = process.env.TUNNEL && process.env.SITE_HOST ? `https://${process.env.SITE_HOST}` : `http://localhost:${process.env.PORT || 8787}`;
const link = `${site}/setup.html#k=${key}`;
if (process.argv.includes('--qr')) {
  console.log(await QRCode.toString(link, { type: 'terminal', small: true, errorCorrectionLevel: 'L' }));
  console.log(`Scan with the phone's camera: ${site}/setup.html (the key is in the code).`);
} else {
  execFileSync('open', [link]);
  console.log(`Opened ${site}/setup.html in your browser.`);
}
