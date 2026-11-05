// Opens the setup page in the Mac's browser, with the admin key after the # (it never reaches a server log).
// The key is ADMIN_KEY in .env (the same as the Worker's secret).
//   npm run setup            opens the live site's
//   npm run setup -- --local opens the one `npm start` runs (http://localhost:8787)
//   npm run setup -- --qr    opens it as a QR picture, for a phone's camera (not on a shared screen: it holds the key)
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);
const key = process.env.ADMIN_KEY;
if (!key) { console.error('No ADMIN_KEY in .env.'); process.exit(1); }
const site = process.argv.includes('--local') ? 'http://localhost:8787' : `https://${process.env.SITE_HOST || 'thenutpub.com'}`;
const link = `${site}/setup.html#k=${key}`;
if (process.argv.includes('--qr')) {
  // A picture, not terminal text: phones couldn't read the terminal's. Black on white, in a folder only this user
  // can read, and deleted after a minute because it holds the key.
  const dir = mkdtempSync(join(tmpdir(), 'nutpub-setup-'));
  const file = join(dir, 'setup-qr.png');
  await QRCode.toFile(file, link, { width: 600, margin: 4, errorCorrectionLevel: 'L' });
  execFileSync('open', [file]);
  console.log(`Scan the picture with the phone's camera: ${site}/setup.html (the key is in the code). Close it when done; the file is deleted in 60 seconds.`);
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 60_000);
} else {
  execFileSync('open', [link]);
  console.log(`Opened ${site}/setup.html in your browser.`);
}
