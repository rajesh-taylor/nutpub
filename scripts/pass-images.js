// The wallet card's stand-in pictures (a gold disc on the site's night blue), written to server/pass-images.js as
// base64, since a Worker can't read files. Apple needs icon.png (29 px, with @2x and @3x); it shows in notifications
// and Mail, not on the card. Real artwork waits for the design sessions. Run: node scripts/pass-images.js
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const NIGHT = [5, 9, 20], GOLD = [217, 149, 58];
function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const t = Math.max(0, Math.min(1, (0.72 - d) * size / 2 + 0.5)); // a soft edge
      row.push(...NIGHT.map((n, i) => Math.round(n + (GOLD[i] - n) * t)));
    }
    rows.push(...row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const files = { 'icon.png': png(29), 'icon@2x.png': png(58), 'icon@3x.png': png(87) };
writeFileSync(new URL('../server/pass-images.js', import.meta.url),
  `// Made by scripts/pass-images.js: the wallet card's stand-in pictures, base64.\nexport const PASS_IMAGES = ${JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.toString('base64')])), null, 1)};\n`);
