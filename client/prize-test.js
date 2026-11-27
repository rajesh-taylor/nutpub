// Branch cashu-ts-rc14 only (session 66): a test prize card on Pub TV, for the NUT-16 distance test. /<stage>/screen?prize=1
// covers the screen with one card playing a fountain QR of a sample token: random coins (with DLEQ proofs, as wallets send them) from the test mint, so it
// decodes in any scanner but nobody can spend it. Never a real token. Settings from the address: fps (6), frag (183,
// payload bytes per frame), coins (12, as on qr.cashutools.dev). Esc or a click closes it.
import { FountainEncoder } from '../vendor/cashu-ts-nut16/src/utils/fountain.ts';
import QRCode from 'qrcode';
import { drawFrame, pintGlass } from './pint.js';

// &look=square: plain square modules, black on white, quiet zone 4 (as most QR codes); &ec=L: lower error correction,
// so a smaller symbol with bigger modules. Both only to compare against the pint's look at a distance.
function drawSquare(canvas, text, ec) {
  const { modules } = QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: ec });
  const n = modules.size, quiet = 4, cells = n + quiet * 2;
  const px = Math.max(4, Math.floor((canvas.clientWidth || 220) * (devicePixelRatio || 1) / cells));
  const side = cells * px;
  if (canvas.width !== side) { canvas.width = side; canvas.height = side; }
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, side, side);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules.get(r, c)) g.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
  return n;
}

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function prizeTest(params) {
  const fps = Math.min(12, Math.max(1, Number(params.get('fps')) || 6));
  const frag = Math.min(400, Math.max(50, Number(params.get('frag')) || 183));
  const square = params.get('look') === 'square';
  const ec = params.get('ec') === 'L' ? 'L' : 'M';
  // &glass=1: the pint's QR at the fan's page size (240 px glass), locked to a key as a real drink is (P2PK secrets).
  const glass = params.has('glass');
  const coins = Math.min(40, Math.max(1, Number(params.get('coins')) || (glass ? 6 : 12)));
  const lockTo = `02${hex(32)}`;
  const secret = () => (glass ? JSON.stringify(['P2PK', { nonce: hex(32), data: lockTo, tags: [['sigflag', 'SIG_INPUTS']] }]) : hex(32));
  const id = `00${hex(7)}`;
  const proofs = Array.from({ length: coins }, () => ({ id, amount: 2 ** Math.floor(Math.random() * 12), secret: secret(), C: `02${hex(32)}`, dleq: { e: hex(32), s: hex(32), r: hex(32) } }));
  const total = proofs.reduce((s, p) => s + p.amount, 0);
  const encoder = FountainEncoder.forToken({ mint: 'https://testnut.cashu.space', unit: 'sat', memo: 'Prize drop test (unspendable)', proofs }, { fragmentSize: frag });

  const style = document.createElement('style');
  style.textContent = `.prize-test { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(5, 9, 20, .92); }
    .prize-test .card { background: #efe3c8; color: #050914; border-radius: 2vh; padding: 2.4vh 2.4vh 1.6vh; text-align: center; font-family: var(--plex, system-ui); }
    .prize-test h2 { margin: 0 0 .4vh; font-family: var(--bebas, inherit); font-size: 6vh; letter-spacing: .04em; line-height: 1; }
    .prize-test:not(.glass) canvas { display: block; width: min(76vh, 90vw); height: min(76vh, 90vw); margin: 1vh auto; }
    .prize-test p { margin: 0; font-size: 2vh; }
    .prize-test.glass .card { background: #050914; color: #efe3c8; padding: 24px; }
    .prize-test.glass p { font-size: 13px; max-width: 280px; margin: 12px auto 0; }`;
  const box = Object.assign(document.createElement('div'), { className: 'prize-test' });
  box.innerHTML = `<div class="card"><h2>Prize drop · test</h2><canvas width="1" height="1" aria-label="Animated QR of a sample token"></canvas>
    <p>Sample token: ${coins} random coins (${total.toLocaleString('en-GB')} sats), nothing to win · fountain · ${frag} B · ${encoder.fragmentCount} frames · ${fps} fps · <span class="look"></span></p></div>`;
  document.body.append(style, box);
  let canvas = box.querySelector('canvas');
  if (glass) {
    box.classList.add('glass');
    const pint = pintGlass({ artist: 'TEST' });
    canvas.replaceWith(pint);
    canvas = pint.querySelector('canvas.pint-code');
    box.querySelector('h2').textContent = 'Pint · test';
  }
  const look = box.querySelector('.look');
  const draw = () => {
    if (document.hidden) return;
    const text = encoder.nextFrame();
    if (!glass && (square || ec === 'L')) look.textContent = `square · EC ${ec} · ${drawSquareOrDots(text)} modules`;
    else { drawFrame(canvas, text); look.textContent = 'dots · EC M'; }
  };
  const drawSquareOrDots = (text) => drawSquare(canvas, text, ec);
  draw();
  const timer = setInterval(draw, 1000 / fps);
  const close = () => { clearInterval(timer); box.remove(); style.remove(); };
  box.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
