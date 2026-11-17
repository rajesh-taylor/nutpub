// Ours: the two token helpers fountain.ts imports. getEncodedTokenBinary is in the cashu-ts we run (5.0.0-rc.4).
// getTokenBinaryFromString arrives with the pull request; The NutPub passes Token objects, never strings, so it's not
// needed here and says so if it's ever called.
export { getEncodedTokenBinary } from '@cashu/cashu-ts';
export function getTokenBinaryFromString(): Uint8Array {
  throw new Error('NUT-16 copy: pass a Token object to FountainEncoder.forToken, not a token string');
}
