// The artist's Nostr mute list (NIP-51, kind 10000, session 55c), read by their own browser from public relays and
// sent to the gig, which checks its signature (BIP-340) and that it's by the npub given in Cellar. Nothing is signed.
// Cellar's Use it and Refresh, and Show Time each time it opens (so a newer list is picked up before the gig).
import { fetchNewest } from './nostr.js';

export const MUTE_KIND = 10000;
// { npub, found, people, words, at } after sending the newest list, or the gig's answer if no list was found.
export async function refreshMuteList(api, pubkey, had = null) {
  const ev = await fetchNewest(MUTE_KIND, pubkey, 4000);
  if (!ev || (had && ev.created_at <= had)) return null;
  return api('PUT', '/api/admin/mute-list', { event: ev });
}
