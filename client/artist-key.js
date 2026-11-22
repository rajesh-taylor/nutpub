// The artist's key, made on the stage's setlist the first time (as Takings does): every payment is locked to it, so
// the fan's tab can buy a ticket before the artist has opened Takings. Kept in this browser's Takings wallet.
// On a gig with the first drink (a judge's practice gig, 14 Nov) the bar's key too, in this browser's bar wallet (as
// Takings and Show Time's Pour do): the drink is locked to it, so the venue ticket's drink goes through at once.
import { openWallet } from './wallet.js';

async function keyHere(adminKey, have, wallet, route) {
  if (have) return have;
  const health = await fetch('/api/health').then((r) => r.json());
  const w = await openWallet(health.mint.url, wallet);
  const { publicKeyHex } = await w.coco.keyring.generateKeyPair();
  const r = await fetch(route, { method: 'PUT', headers: { 'X-Admin': adminKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ pubkey: publicKeyHex }) });
  return r.ok ? publicKeyHex : null;
}

export async function artistKeyHere(adminKey) {
  const show = await fetch('/api/show').then((r) => r.json());
  const artist = await keyHere(adminKey, show.artistKey, 'nutpub-takings', '/api/admin/artist-key');
  // The words' recovery key on record with the gig straight away (session 54), so the words can win it back later.
  if (artist && !show.artistKey) {
    const { wordsHere } = await import('./wallet.js');
    const w = wordsHere();
    if (w) await import('./recover.js').then((m) => m.recordWords(w, adminKey)).catch(() => {});
  }
  if (show.show?.drinks) await keyHere(adminKey, show.barKey, 'nutpub-bar', '/api/admin/bar-key');
  return artist;
}
