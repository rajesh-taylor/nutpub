// The first drink as the coin itself (gig 3, 17 Nov; look B on the Artifact "NutPub Drink QR"): the locked drink token
// plays as an animated QR inside a pint glass. "Cheers from <artist>" in the foam, the NutPub mark at the base, halfway
// between the code and the glass's foot; neither touches the code. The frames are NUT-16's proposed fountain format,
// made by cashu-ts's own encoder (vendor/cashu-ts-nut16, copied unchanged from its pull request #1309); the QR grid comes
// from the qrcode library. Only the drawing is ours: rounded dots and rounded corner eyes, dark on cream.
import QRCode from 'qrcode';
import { getDecodedToken, getTokenMetadata } from '@cashu/cashu-ts';
import { FountainEncoder } from '../vendor/cashu-ts-nut16/src/utils/fountain.ts';

const INK = '#050914';
const CREAM = '#efe3c8';
const FPS = 6; // calm to look at, quick to read (Rajesh 17 Nov: every frame is a new code, so it can only change less often)
const NS = 'http://www.w3.org/2000/svg';
const esc = (t) => t.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

// The glass, on a 100 × 128 grid: the code's square is 73 wide from y 27 to 100; the foot's inner line is at y 124.
// empty: before the ticket's bought, a dashed outline with "Your first drink appears here".
export function pintGlass({ artist = '', empty = false } = {}) {
  const box = document.createElement('div');
  box.className = `pint${empty ? ' empty' : ''}`;
  const code = empty
    ? Object.assign(document.createElement('div'), { className: 'pint-code', innerHTML: '<span>Your first drink appears here</span>' })
    : Object.assign(document.createElement('canvas'), { className: 'pint-code', width: 1, height: 1 });
  if (!empty) code.setAttribute('aria-label', 'Your first drink: an animated QR code for the bar');
  const foam = empty ? (artist ? `ON ${artist}` : '') : `CHEERS FROM ${artist || 'THE ARTIST'}`;
  box.innerHTML = `<svg class="pint-glass" viewBox="0 0 100 128" aria-hidden="true">
    <path class="pint-side" d="M8 22 L13 120 Q13 125 18 125 L82 125 Q87 125 87 120 L92 22" fill="none" stroke-width="2.4"/>
    <path class="pint-foam" d="M6 22 Q10 6 26 10 Q34 0 48 6 Q60 -1 70 8 Q88 4 94 22 Z"/>
    <text class="pint-cheers" x="50" y="16.5" text-anchor="middle" dominant-baseline="central" font-size="6.6" letter-spacing=".45">${esc(foam.toUpperCase())}</text>
    <text class="pint-mark" x="50" y="112.5" text-anchor="middle" dominant-baseline="central" font-size="7.6" letter-spacing="1">THE NUTPU<tspan fill="#f7931a">₿</tspan></text>
  </svg>`;
  box.prepend(code);
  return box;
}

// One frame's QR, drawn on the canvas: alphanumeric mode as one segment (as NUT-16 asks), error correction M.
function drawFrame(canvas, text) {
  const { modules } = QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' });
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

// A V4 token names its keysets by short ids: this cashu-ts reads them once it has the mint's keyset list (one request).
export async function tokenOf(text) {
  const { mint } = getTokenMetadata(text);
  const r = await fetch(`${mint.replace(/\/$/, '')}/v1/keysets`);
  if (!r.ok) throw new Error('The mint didn’t answer');
  return getDecodedToken(text, (await r.json()).keysets.map((k) => k.id));
}

// Plays the token's frames on the glass's canvas until stop() (or the canvas leaves the page). Pauses while the tab is
// hidden. A token that won't decode shows nothing and says so through onError.
export async function playCoin(glass, token, { onError } = {}) {
  const canvas = glass.querySelector('canvas.pint-code');
  let encoder;
  try { encoder = FountainEncoder.forToken(await tokenOf(token)); }
  catch (e) { onError?.(e); return { stop() {} }; }
  const tick = () => {
    if (!canvas.isConnected) return stop();
    if (document.hidden) return;
    drawFrame(canvas, encoder.nextFrame());
  };
  tick();
  const timer = setInterval(tick, 1000 / FPS);
  function stop() { clearInterval(timer); }
  return { stop, frames: encoder.fragmentCount };
}
