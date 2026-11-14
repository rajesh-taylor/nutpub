// The artist's key, made on the stage's setlist the first time (as Takings does): every payment is locked to it, so
// the fan's tab can buy a ticket before the artist has opened Takings. Kept in this browser's Takings wallet.
import { openWallet } from './wallet.js';

export async function artistKeyHere(adminKey) {
  const show = await fetch('/api/show').then((r) => r.json());
  if (show.artistKey) return show.artistKey;
  const health = await fetch('/api/health').then((r) => r.json());
  const artist = await openWallet(health.mint.url, 'nutpub-takings');
  const { publicKeyHex } = await artist.coco.keyring.generateKeyPair();
  const r = await fetch('/api/admin/artist-key', { method: 'PUT', headers: { 'X-Admin': adminKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ pubkey: publicKeyHex }) });
  return r.ok ? publicKeyHex : null;
}
