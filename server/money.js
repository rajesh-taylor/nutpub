// Sats and money, one place for the server and the pages (the pages' bundles import this file too).
// A rate is what one bitcoin costs: { gbp, usd }. 1 bitcoin = 100,000,000 sats.
export const SATS = 100_000_000;

// £ (or $) to sats, to the nearest whole sat. Worked in pence so 10.10 doesn't become 10.0999…
export function satsFrom(amount, perBitcoin) {
  const pence = Math.round(Number(amount) * 100);
  if (!(pence > 0) || !(perBitcoin > 0)) return null;
  return Math.round((pence * (SATS / 100)) / perBitcoin);
}

// Sats to £ (or $), as a number of pence rounded to the nearest penny.
export function penceFrom(sats, perBitcoin) {
  if (!(sats >= 0) || !(perBitcoin > 0)) return null;
  return Math.round((sats * perBitcoin * 100) / SATS);
}

// How a figure reads on the page: whole pounds once it's £100 or more, pence below; never "£0.00" for a few sats.
export function money(sats, perBitcoin, symbol = '£') {
  const p = penceFrom(sats, perBitcoin);
  if (p == null) return '';
  if (sats > 0 && p < 1) return `<${symbol}0.01`;
  return p >= 10_000 ? `${symbol}${Math.round(p / 100).toLocaleString('en-GB')}` : `${symbol}${(p / 100).toFixed(2)}`;
}
