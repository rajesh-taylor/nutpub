// Move to my phone (session 44): the whole wallet as one note, played as an animated QR for the Cashu wallet on the fan's
// phone, screen to camera, no server in between. NUT-16 as phone wallets read it today (Cashu.me, Minibits, macadamia):
// UR codes, made by bc-ur, the library Cashu.me itself uses, the same way: the note's own text as UR bytes, parts of 150
// bytes. A note of two coins or fewer is one still QR of the note itself, as those wallets show one.
// Once phone wallets read the proposed NUT-16 (the drink's frames, pint.js), this switches to it (Rajesh 21 Nov).
import { UR, UREncoder } from '@gandlaf21/bc-ur';
import { drawFrame } from './dots.js';

export const PART = 150; // bytes a part, as Cashu.me
const FPS = 6; // the drink's pace (pint.js)

// The note's frames: next() gives the text of the next QR.
export function framesOf(token, coins) {
  if (coins <= 2) return { still: true, count: 1, next: () => token };
  const encoder = new UREncoder(UR.from(token), PART, 0);
  return { still: false, count: encoder.fragmentsLength, next: () => encoder.nextPart() };
}

// Plays the note on the canvas until stop() (or the canvas leaves the page). Pauses while the tab is hidden.
export function playNote(canvas, token, coins) {
  const frames = framesOf(token, coins);
  const tick = () => {
    if (!canvas.isConnected) return stop();
    if (document.hidden) return;
    drawFrame(canvas, frames.next(), 'byte');
  };
  tick();
  const timer = frames.still ? null : setInterval(tick, 1000 / FPS);
  function stop() { if (timer) clearInterval(timer); }
  return { stop, frames: frames.count };
}
