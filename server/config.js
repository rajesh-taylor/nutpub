import { randomBytes } from 'node:crypto';

// The Kitty: the one mint the NutPub trusts. Fallback: KITTY_URL=http://127.0.0.1:3338
export const KITTY_URL = (process.env.KITTY_URL || 'https://mint.minibits.cash/Bitcoin').replace(/\/+$/, '');
// SuitCoin: Rupert's own mint (a second fake cdk-mintd). Never accepted at the door.
export const SUIT_URL = (process.env.SUIT_URL || 'http://127.0.0.1:3339').replace(/\/+$/, '');
export const PORT = Number(process.env.PORT || 8787);
// Private links (stage, gifts) carry this after the #. Set ADMIN_KEY to keep it across restarts.
export const ADMIN_KEY = process.env.ADMIN_KEY || randomBytes(12).toString('hex');
// Longy's Lightning address: when the goal's hit, his takings go there (NUT-05). Unset: they stay as ecash.
export const LONGY_LN = (process.env.LONGY_LN || '').trim();
// Curtains go up by themselves when this many phones are through the door (0: only the stage button).
export const CURTAINS_AT = Number(process.env.CURTAINS_AT || 0);

// Ticket: in the room, pay once (free first pint, a round for the band). Livestream pass: watch from anywhere,
// pay as you go. A ticket holder can tune into the livestream too, at the pass rate.
export const TIERS = {
  ticket: { name: 'Ticket', door: 21, segment: 1 },
  stream: { name: 'Livestream pass', door: 1, segment: 1 },
};
