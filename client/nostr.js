// Nostr sign-in for the chat, in the browser (12 Nov). A Nostr extension (NIP-07: Alby, nos2x, …) gives the page the
// fan's public key and signs for them; the page never sees their secret key. Their profile (kind 0) comes from a few
// public relays, straight from this browser; the server checks both signatures (server/nostr.js).
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://purplepag.es'];

// An extension can inject window.nostr a moment after the page loads.
export async function extension(waitMs = 1500) {
  for (let t = 0; !window.nostr && t < waitMs; t += 250) await new Promise((r) => setTimeout(r, 250));
  return window.nostr || null;
}

// The newest profile any of the relays has for this key, or null after `ms`.
export function fetchProfile(pubkey, ms = 3000) {
  return new Promise((resolve) => {
    let best = null;
    let open = RELAYS.length;
    const socks = [];
    const done = () => { clearTimeout(timer); for (const s of socks) try { s.close(); } catch {} resolve(best); };
    const timer = setTimeout(done, ms);
    for (const url of RELAYS) {
      let ws;
      try { ws = new WebSocket(url); } catch { if (--open === 0) done(); continue; }
      socks.push(ws);
      const sub = `np${Math.random().toString(36).slice(2, 8)}`;
      ws.onopen = () => ws.send(JSON.stringify(['REQ', sub, { kinds: [0], authors: [pubkey], limit: 1 }]));
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m[0] === 'EVENT' && m[1] === sub && m[2]?.pubkey === pubkey && m[2]?.kind === 0) {
          if (!best || m[2].created_at > best.created_at) best = m[2];
        } else if (m[0] === 'EOSE' && m[1] === sub) { ws.close(); if (--open === 0) done(); }
      };
      ws.onerror = () => { if (--open === 0) done(); };
    }
  });
}

// Sign in: the key, the profile, then one signed note for this site (NIP-98), sent with the pass.
export async function signIn(pass) {
  const nostr = await extension(0);
  if (!nostr) throw new Error('No Nostr extension in this browser.');
  const pubkey = await nostr.getPublicKey();
  const profile = await fetchProfile(pubkey);
  const auth = await nostr.signEvent({ kind: 27235, created_at: Math.floor(Date.now() / 1000), content: '',
    tags: [['u', `${location.origin}/api/nostr`], ['method', 'POST']] });
  const r = await fetch('/api/nostr', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({ auth, profile }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || 'Nostr sign-in didn’t work.');
  return j; // { name, npub }
}
export const signOut = (pass) => fetch('/api/nostr', { method: 'DELETE', headers: { 'X-Pass': pass } });
export const whoAmI = (pass) => fetch('/api/nostr', { headers: { 'X-Pass': pass } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
