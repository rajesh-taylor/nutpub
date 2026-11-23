// The door QR's 30-second step: the phone signs its venue ticket again each step (BIP-340, server/blind.js) and the
// door takes this step or the one either side. The old time code (RFC 6238) went in session 57; only the step is left.
export const STEP = 30;
export const stepAt = (ms) => Math.floor(ms / 1000 / STEP);
