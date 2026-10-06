// The wallet page: this browser's wallet. Balance and Take it home (all of it as one note for any Cashu wallet).
// Topping up is on the viewer page, where the sats get spent.
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
$('home').hidden = $('where-note').hidden = false;

$('home').addEventListener('click', async () => {
  try {
    const out = await wallet.takeHome();
    if (!out) return say('Nothing in your wallet to take home.');
    $('token').value = out.token;
    $('takeout').hidden = false;
    await show();
    say(`${out.amount} sats as one note. Copy it into any Cashu wallet.`);
  } catch (e) {
    say(`Take it home failed: ${e.message}`);
  }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('token').value); say('Copied.'); }
  catch { $('token').select(); say('Select and copy the note above.'); }
});
