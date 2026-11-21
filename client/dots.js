// The NutPub's QR look (17 Nov): rounded dots and rounded corner eyes, dark on cream. The grid comes from the qrcode
// library; only the drawing is ours. Used by the drink in its pint glass (pint.js) and Move to my phone (phone-qr.js).
import QRCode from 'qrcode';

export const INK = '#050914';
export const CREAM = '#efe3c8';

// One QR, drawn on the canvas as one segment. mode: 'alphanumeric' (the proposed NUT-16 frames, upper case) or 'byte'
// (UR parts and notes as phone wallets show them). Error correction M.
export function drawFrame(canvas, text, mode = 'alphanumeric') {
  const { modules } = QRCode.create([{ data: text, mode }], { errorCorrectionLevel: 'M' });
  const n = modules.size, quiet = 2, cells = n + quiet * 2;
  const px = Math.max(4, Math.floor((canvas.clientWidth || 220) * (devicePixelRatio || 1) / cells));
  const side = cells * px;
  if (canvas.width !== side) { canvas.width = side; canvas.height = side; }
  const g = canvas.getContext('2d');
  g.fillStyle = CREAM; g.fillRect(0, 0, side, side);
  g.fillStyle = INK;
  const eye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!modules.get(r, c) || eye(r, c)) continue;
    g.beginPath(); g.arc((c + quiet + .5) * px, (r + quiet + .5) * px, px * .46, 0, Math.PI * 2); g.fill();
  }
  const round = (x, y, w, rad) => { g.beginPath(); g.roundRect(x, y, w, w, rad); g.fill(); };
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = (c + quiet) * px, y = (r + quiet) * px;
    g.fillStyle = INK; round(x, y, 7 * px, 2 * px);
    g.fillStyle = CREAM; round(x + px, y + px, 5 * px, 1.4 * px);
    g.fillStyle = INK; round(x + 2 * px, y + 2 * px, 3 * px, px);
  }
}
