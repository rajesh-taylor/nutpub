// All sound is made in the browser (Web Audio): nothing to license.
let ctx;

// Call at the start of a tap, before any await, so iOS lets the sound play.
export function unlockAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Sad trombone: three falling notes, then a long wobbling slide down.
export function trombone() {
  const ac = unlockAudio();
  const t0 = ac.currentTime + 0.05;
  const notes = [[311, 0.0, 0.32], [294, 0.36, 0.32], [277, 0.72, 0.32], [262, 1.08, 1.1]];
  const out = ac.createGain();
  out.gain.value = 0.5;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1400;
  tone.Q.value = 4;
  tone.connect(out).connect(ac.destination);

  for (const [f, at, len] of notes) {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    const g = ac.createGain();
    const s = t0 + at;
    osc.frequency.setValueAtTime(f, s);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.6, s + 0.04);
    g.gain.setValueAtTime(0.6, s + len - 0.08);
    g.gain.linearRampToValueAtTime(0, s + len);
    if (len > 0.5) {
      osc.frequency.linearRampToValueAtTime(f * 0.94, s + len);
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = 7;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(s + 0.2);
      lfo.stop(s + len);
    }
    osc.connect(g).connect(tone);
    osc.start(s);
    osc.stop(s + len + 0.02);
  }
}

// Glass clink: two bright partials that ring and fade.
export function clink() {
  const ac = unlockAudio();
  const t0 = ac.currentTime + 0.02;
  for (const [f, v, d] of [[2637, 0.25, 0.9], [3951, 0.15, 0.6], [5274, 0.08, 0.4]]) {
    for (const at of [0, 0.16]) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.frequency.value = f * (at ? 1.01 : 1);
      g.gain.setValueAtTime(v * (at ? 0.6 : 1), t0 + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
      osc.connect(g).connect(ac.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + d + 0.05);
    }
  }
}
