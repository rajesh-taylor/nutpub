// Nostr sign-in for the chat, in the browser (12 Nov). Two ways to sign, and the page never sees the fan's secret key:
// - a Nostr extension (NIP-07: Alby, nos2x, … on a computer), which gives the page the fan's public key and signs;
// - Nostr Connect (NIP-46, 13 Nov), for phones and computers without one: a QR or a tap that opens the fan's signer app
//   (Amber, Primal, nsec.app). The page and the app talk through public relays, every message encrypted to the other
//   (NIP-44, from nostr-tools, the audited implementation; its known answers in test/nip44.test.js). The page's own
//   key for that talk is a fresh throwaway, kept in this browser for the night so a Nutzap can be signed later.
// Their profile (kind 0) comes from a few public relays, straight from this browser; the server checks both
// signatures (server/nostr.js), whichever way they were signed.
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://purplepag.es'];
// For Nostr Connect: relays the signer apps use by default (nsec.app's own, then two big public ones).
const CONNECT_RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://relay.primal.net'];
// What the page asks the signer app to sign: the sign-in note (NIP-98) and a Nutzap (NIP-61). Nothing else.
const PERMS = ['sign_event:27235', 'sign_event:9321'];
// Our messages to a signer stay well inside NIP-44's audited limit (65,535 bytes).
const MAX = 60_000;
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));

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

// ---- The signer in use on this page: the extension, or the fan's signer app through Nostr Connect.
let remote = null; // a BunkerSigner, once connected
const KEY = 'nutpub-nostr-connect';
const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const nip46 = () => Promise.all([import('nostr-tools/nip46'), import('nostr-tools/pure'), import('nostr-tools/pool')]);

// The signer for a Nutzap: the extension, or the app this browser connected to (reconnected after a reload).
export async function signer() {
  if (window.nostr) return window.nostr;
  if (remote) return remote;
  const kept = load();
  if (!kept?.sk || !kept?.bp?.pubkey) return null;
  const [{ BunkerSigner }, , { SimplePool }] = await nip46();
  remote = BunkerSigner.fromBunker(unhex(kept.sk), kept.bp, { pool: new SimplePool({ enableReconnect: true }) });
  return remote;
}
// Sign with whichever signer, inside the size limit.
export async function sign(s, template) {
  if (JSON.stringify(template).length > MAX) throw new Error('Too long to sign.');
  return s.signEvent(template);
}

// Sign in: the key, the profile, then one signed note for this site (NIP-98), sent with the pass.
export async function signIn(pass, s = null) {
  s = s || (await extension(0));
  if (!s) throw new Error('No Nostr extension in this browser.');
  const pubkey = await s.getPublicKey();
  const profile = await fetchProfile(pubkey);
  const auth = await sign(s, { kind: 27235, created_at: Math.floor(Date.now() / 1000), content: '',
    tags: [['u', `${location.origin}/api/nostr`], ['method', 'POST']] });
  const r = await fetch('/api/nostr', { method: 'POST', headers: { 'X-Pass': pass, 'Content-Type': 'application/json' }, body: JSON.stringify({ auth, profile }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || 'Nostr sign-in didn’t work.');
  return j; // { name, npub }
}

// Nostr Connect: a nostrconnect:// link for the fan's signer app (as a QR, or a tap on a phone). `done` settles once
// the app says yes and the sign-in is checked; `cancel` stops waiting. `onAuth`: some apps (nsec.app) first send a
// page of their own to confirm in; we open it.
export async function connect(pass, { onAuth } = {}) {
  const [{ BunkerSigner, createNostrConnectURI }, { generateSecretKey, getPublicKey }, { SimplePool }] = await nip46();
  const sk = generateSecretKey();
  const uri = createNostrConnectURI({ clientPubkey: getPublicKey(sk), relays: CONNECT_RELAYS,
    secret: hex(crypto.getRandomValues(new Uint8Array(16))), perms: PERMS, name: 'The NutPub', url: location.origin });
  const stop = new AbortController();
  const pool = new SimplePool({ enableReconnect: true });
  const done = (async () => {
    const s = await BunkerSigner.fromURI(sk, uri, { pool, onauth: onAuth }, stop.signal);
    remote = s;
    save({ sk: hex(sk), bp: s.bp });
    try { return await signIn(pass, s); } catch (e) { forget(); throw e; }
  })();
  return { uri, done, cancel: () => { stop.abort(); try { pool.destroy(); } catch {} } };
}
function forget() { try { remote?.close(); } catch {} remote = null; save(null); }

// Send a signed note to public relays (a Nutzap, "Nutzap me here"). Settles once one relay says OK, or after `ms`.
export function publish(ev, relays, ms = 4000) {
  return new Promise((resolve) => {
    let left = relays.length;
    let ok = false;
    const socks = [];
    const end = () => { clearTimeout(timer); for (const s of socks) try { s.close(); } catch {} resolve(ok); };
    const timer = setTimeout(end, ms);
    if (!left) end();
    for (const url of relays) {
      let ws;
      try { ws = new WebSocket(url); } catch { if (--left === 0) end(); continue; }
      socks.push(ws);
      ws.onopen = () => ws.send(JSON.stringify(['EVENT', ev]));
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m[0] === 'OK' && m[1] === ev.id) { if (m[2]) ok = true; ws.close(); if (--left === 0) end(); } };
      ws.onerror = () => { if (--left === 0) end(); };
    }
  });
}

export const signOut = (pass) => { forget(); return fetch('/api/nostr', { method: 'DELETE', headers: { 'X-Pass': pass } }); };
export const whoAmI = (pass) => fetch('/api/nostr', { headers: { 'X-Pass': pass } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
// Signed in through a signer app earlier in this browser (the server keeps the name for the night).
export const connected = () => !!load()?.bp?.pubkey;
