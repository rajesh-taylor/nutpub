import { randomBytes } from 'node:crypto';

// The Kitty: the one mint the NutPub trusts. Fallback: KITTY_URL=http://127.0.0.1:3338
export const KITTY_URL = (process.env.KITTY_URL || 'https://mint.minibits.cash/Bitcoin').replace(/\/+$/, '');
// SuitCoin: Rupert's own mint (a second fake cdk-mintd). Never accepted at the door.
export const SUIT_URL = (process.env.SUIT_URL || 'http://127.0.0.1:3339').replace(/\/+$/, '');
export const PORT = Number(process.env.PORT || 8787);
// Private links (stage, gifts) carry this after the #. Set ADMIN_KEY to keep it across restarts.
export const ADMIN_KEY = process.env.ADMIN_KEY || randomBytes(12).toString('hex');

export const TIERS = {
  judge: { name: 'Ecash Idol Judges', door: 21, segment: 1 },
  pleb: { name: 'Plebs', door: 4, segment: 4 },
};
