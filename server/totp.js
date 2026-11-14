// The door QR's time code (RFC 6238, TOTP): HMAC-SHA-256 over the 30-second step, 8 digits. WebCrypto only, so the
// same file runs on the phone (the ticket page draws its door QR every 30 seconds, no signal needed) and on the
// server (the door's check). Each venue ticket has a secret of its own, beside its door code.
export const STEP = 30;
export const DIGITS = 8;
export const stepAt = (ms) => Math.floor(ms / 1000 / STEP);

const bytes = (hex) => Uint8Array.from(hex.match(/../g) || [], (b) => parseInt(b, 16));

export async function totp(secretHex, step, { digits = DIGITS, hash = 'SHA-256' } = {}) {
  const key = await crypto.subtle.importKey('raw', bytes(secretHex), { name: 'HMAC', hash }, false, ['sign']);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const o = mac[mac.length - 1] & 0x0f; // RFC 4226's dynamic truncation
  const n = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}

// The door takes a code from the last minute (this step or the one before), or the next one for a phone a little fast.
const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export async function totpOk(secretHex, code, ms = Date.now()) {
  if (!secretHex || !new RegExp(`^\\d{${DIGITS}}$`).test(code)) return false;
  const t = stepAt(ms);
  let ok = false;
  for (const s of [t - 1, t, t + 1]) ok = same(await totp(secretHex, s), code) || ok;
  return ok;
}
