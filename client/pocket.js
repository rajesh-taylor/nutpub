// Pocket: this browser's wallet. Balance, a Lightning top-up (on the test mint the invoice pays itself),
// and Take it home (the whole pocket as one note for any Cashu wallet).
import { openWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
const say = (text) => { $('status').textContent = text; };

const health = await fetch('/api/health').then((r) => r.json());
$('mint').textContent = `${health.mint.name} · ${health.mint.description}`;
// The wallet belongs to the address this page was opened at (localhost and the public address are two wallets).
$('where').textContent = location.host;

const wallet = await openWallet(health.mint.url);
const show = async () => { $('balance').textContent = await wallet.balance(); };
await show();
wallet.on('proofs:saved', show);
$('actions').hidden = false;

$('topup').addEventListener('click', async () => {
  $('topup').disabled = true;
  try {
    say('Asking the mint for a Lightning invoice…');
    const { id } = await wallet.topup(100);
    say('Invoice made. The test mint pays it itself…');
    for (let i = 0; i < 30 && !(await wallet.topupDone(id)); i += 1) await new Promise((r) => setTimeout(r, 1000));
    await show();
    say('+100 test sats in your pocket.');
  } catch (e) {
    say(`Top-up failed: ${e.message}`);
  } finally {
    $('topup').disabled = false;
  }
});

$('home').addEventListener('click', async () => {
  try {
    const out = await wallet.takeHome();
    if (!out) return say('Nothing in your pocket to take home.');
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
