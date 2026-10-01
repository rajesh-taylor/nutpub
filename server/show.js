// The show: who's in (passes), curtains up (T0, sent over SSE), and which 10-second segment is live.
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SEGMENT_MS = 10_000;
export const SEGMENT_DIR = fileURLToPath(new URL('../media/segments/', import.meta.url));
export const segmentCount = () => readdirSync(SEGMENT_DIR).filter((f) => f.endsWith('.wav')).length;

const passes = new Map(); // pass id -> { tier, paid: Set of segment numbers }
const clients = new Set(); // open SSE responses
export const show = { t0: null };

export function issuePass(tier) {
  const id = randomBytes(12).toString('hex');
  passes.set(id, { tier, paid: new Set() });
  broadcast();
  return id;
}
export const getPass = (id) => passes.get(id);

// The segment playing right now (or null before curtains up).
export const liveSegment = () => (show.t0 == null ? null : Math.floor((Date.now() - show.t0) / SEGMENT_MS));

export function curtainsUp() {
  // Start on a whole second at least 2 s ahead, so every phone can schedule the same moment.
  show.t0 ??= Math.ceil((Date.now() + 2000) / 1000) * 1000;
  broadcast();
}
export function newShow() {
  show.t0 = null;
  passes.clear();
  broadcast();
}

const state = () => ({ t0: show.t0, now: Date.now(), phones: passes.size, segmentMs: SEGMENT_MS });

function broadcast() {
  const msg = `data: ${JSON.stringify(state())}\n\n`;
  for (const res of clients) res.write(msg);
}

export function events(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(state())}\n\n`);
  clients.add(res);
  const beat = setInterval(() => res.write(': beat\n\n'), 15_000);
  req.on('close', () => { clearInterval(beat); clients.delete(res); });
}
export const snapshot = state;
