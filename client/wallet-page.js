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
try { const from = new URL(document.referrer); if (from.origin === location.origin && from.pathname !== location.pathname) $('back').href = from.pathname; } catch {}

const wallet = await openWallet(health.mint.url);
const show = async () => { $('balance').textContent = await wallet.balance(); };
await show();
wallet.on('proofs:saved', show);
$('home').hidden = $('receive').hidden = $('where-note').hidden = false;
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
    await show();
    say(`+${(await wallet.balance()) - before} sats added to your wallet.`);
  } catch (e) {
    say(/spent/i.test(e.message) ? 'That note was already used.' : `Couldn’t add it: ${e.message}`);
  }
  $('paste-go').disabled = false;
});

$('home').addEventListener('click', async () => {
  try {
    const out = await wallet.takeHome();
    if (!out) return say('Nothing in your wallet to take home.');
    $('token').value = out.token;
    $('takeout').hidden = false;
    $('paste').hidden = true;
    await show();
    say(`${out.amount} sats as one note. Copy it into any Cashu wallet.`);
  } catch (e) {
    say(`Couldn’t take them home: ${e.message}`);
  }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('token').value); say('Copied.'); }
  catch { $('token').select(); say('Select and copy the note above.'); }
});
