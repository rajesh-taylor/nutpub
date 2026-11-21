// The first drink as the coin itself (gig 3, 17 Nov; look B on the Artifact "NutPub Drink QR"): the locked drink token
// plays as an animated QR inside a pint glass. "Cheers from <artist>" in the foam, the NutPub mark at the base, halfway
// between the code and the glass's foot; neither touches the code. The frames are NUT-16's proposed fountain format,
// made by cashu-ts's own encoder (vendor/cashu-ts-nut16, copied unchanged from its pull request #1309); the QR grid comes
// from the qrcode library. Only the drawing is ours: rounded dots and rounded corner eyes, dark on cream.
import { getDecodedToken, getTokenMetadata } from '@cashu/cashu-ts';
import { FountainEncoder } from '../vendor/cashu-ts-nut16/src/utils/fountain.ts';
import { drawFrame } from './dots.js'; // the rounded dots, shared with Move to my phone
const FPS = 6; // calm to look at, quick to read (Rajesh 17 Nov: every frame is a new code, so it can only change less often)
const NS = 'http://www.w3.org/2000/svg';
const esc = (t) => t.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

// The glass, on a 100 × 128 grid: the code's square is 73 wide from y 27 to 100; the foot's inner line is at y 124.
// empty: before the ticket's bought, a small dashed outline, no words (Rajesh 17 Nov: the lines beside it say it all).
export function pintGlass({ artist = '', empty = false } = {}) {
  const box = document.createElement('div');
  box.className = `pint${empty ? ' empty' : ''}`;
  const code = empty
    ? Object.assign(document.createElement('div'), { className: 'pint-code' })
    : Object.assign(document.createElement('canvas'), { className: 'pint-code', width: 1, height: 1 });
  if (!empty) code.setAttribute('aria-label', 'Your first drink: an animated QR code for the bar');
  const foam = empty ? '' : `CHEERS FROM ${artist || 'THE ARTIST'}`;
  box.innerHTML = `<svg class="pint-glass" viewBox="0 0 100 128" aria-hidden="true">
    <path class="pint-side" d="M8 22 L13 120 Q13 125 18 125 L82 125 Q87 125 87 120 L92 22" fill="none" stroke-width="2.4"/>
    <path class="pint-foam" d="M6 22 Q10 6 26 10 Q34 0 48 6 Q60 -1 70 8 Q88 4 94 22 Z"/>
    <text class="pint-cheers" x="50" y="16.5" text-anchor="middle" dominant-baseline="central" font-size="6.6" letter-spacing=".45">${esc(foam.toUpperCase())}</text>
    <text class="pint-mark" x="50" y="112.5" text-anchor="middle" dominant-baseline="central" font-size="7.6" letter-spacing="1">THE NUTPU<tspan fill="#f7931a">₿</tspan></text>
  </svg>`;
  box.prepend(code);
  return box;
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
