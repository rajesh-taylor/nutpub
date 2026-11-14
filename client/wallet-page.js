// The wallet page: this browser's wallet. Balance, Take sats home (all of it as one note for any Cashu wallet) and
// Receive ecash (a note from another wallet, this mint only).
// Topping up is on the viewer page, where the sats get spent.
import { getTokenMetadata } from '@cashu/cashu-ts';
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
const say = (text) => { $('status').textContent = text; };

const health = await fetch('/api/health').then((r) => r.json());
// The wallet belongs to the address this page was opened at (localhost and the public address are two wallets).
$('where').textContent = location.host;
// Back to the page that sent us here (an artist's page, once there are several); else the home page.
try { const from = new URL(document.referrer); if (from.origin === location.origin && from.pathname !== location.pathname) $('back').href = from.pathname + from.search; } catch {}

// Watching at home and in the room are two wallets: the page that sent us here says which (?as=home).
const wallet = await openWallet(health.mint.url, new URLSearchParams(location.search).get('as') === 'home' ? 'nutpub-home' : 'nutpub');
const show = async () => {
  const n = await wallet.balance();
  $('balance').textContent = n;
  $('cashu-me').disabled = !n && !$('token').value; // nothing here, and no note out waiting to be moved
};
await show();
wallet.on('proofs:saved', show);
$('home').hidden = $('receive').hidden = $('where-note').hidden = $('move').hidden = false;
$('receive').addEventListener('click', () => {
  $('paste').hidden = !$('paste').hidden;
  if (!$('paste').hidden) { $('takeout').hidden = true; $('paste-token').focus(); }
});

// Paste ecash: check it's this show's mint first (other mints need real Lightning to move over: not on the test mint).
const same = (a, b) => String(a).replace(/\/+$/, '') === String(b).replace(/\/+$/, '');
$('paste-go').addEventListener('click', async () => {
  const token = $('paste-token').value.trim();
  if (!token) return say('Paste a note first (it starts with cashuA or cashuB).');
  let meta;
  try { meta = getTokenMetadata(token); } catch { return say('That isn’t an ecash note.'); }
  if (!same(meta.mint, health.mint.url)) return say(`That note is from another mint (${meta.mint}). This wallet takes ${health.mint.name} only.`);
  $('paste-go').disabled = true;
  say('Adding it…');
  try {
    const before = await wallet.balance();
    await wallet.receive(token);
    $('paste-token').value = '';
    $('paste').hidden = true;
    $('takeout').hidden = true; // a note taken out earlier may be the one just pasted back: spent now
    $('token').value = '';
    await show();
    say(`+${(await wallet.balance()) - before} sats added to your wallet.`);
  } catch (e) {
    say(/spent/i.test(e.message) ? 'That note was already used.' : `Couldn’t add it: ${e.message}`);
  }
  $('paste-go').disabled = false;
});

// The whole wallet as one note (a note already out, not yet moved, is used again: the wallet is empty by then).
async function note() {
  if ($('token').value) return $('token').value;
  const out = await wallet.takeHome();
  if (!out) return null;
  $('token').value = out.token;
  $('takeout').hidden = false;
  $('paste').hidden = true;
  await show();
  return out.token;
}
$('home').addEventListener('click', async () => {
  try {
    if (!(await note())) say('Nothing in your wallet to take home.'); else say('');
  } catch (e) {
    say(`Couldn’t take them home: ${e.message}`);
  }
});
// Move to Cashu.me (Rajesh 14 Nov: the fan's wallet page as Takings). The tab opens on the tap (a phone blocks one opened
// later), then goes to Cashu.me with the note after the #, so it never reaches Cashu.me's server.
$('cashu-me').addEventListener('click', async () => {
  const tab = window.open('', '_blank');
  try {
    const token = await note();
    if (!token) { tab?.close(); return say('Nothing in your wallet to move.'); }
    const url = `https://wallet.cashu.me/#token=${token}`;
    if (tab) { tab.opener = null; tab.location.href = url; } else location.href = url;
    say('');
  } catch (e) {
    tab?.close();
    say(`Couldn’t move them: ${e.message}`);
  }
});
// Copy: the note to the clipboard; the box shows it too, for copying by hand.
$('copy').addEventListener('click', async () => {
  $('token').hidden = false;
  try { await navigator.clipboard.writeText($('token').value); say('Copied.'); }
  catch { $('token').select(); say('Select and copy the note above.'); }
});
