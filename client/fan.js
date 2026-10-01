// Fan page: the phone's wallet, the gift it arrived with, and the door.
import { openWallet } from './wallet.js';
import { unlockAudio, trombone } from './sound.js';

const $ = (id) => document.getElementById(id);
const show = (id) => document.querySelectorAll('[data-screen]').forEach((el) => (el.hidden = el.id !== id));

const LINES = {
  wrong_mint: 'Not money this NutPub takes!',
  bad_dleq: 'Still not allowed past the doormen.',
  no_dleq: 'No hologram, no entry.',
  reused: 'That ecash has already been through this door.',
  too_little: 'Not enough sats for that tier.',
  mint_unreachable: 'Can’t reach the Kitty. Try again.',
};

let wallet, config;

async function refresh() {
  $('balance').textContent = `${await wallet.balance()} sats`;
}

async function claimGift() {
  const token = decodeURIComponent(location.hash.slice(1));
  if (!token.startsWith('cashuB') && !token.startsWith('cashuA')) return;
  history.replaceState(null, '', location.pathname); // the gift is live money: don't leave it in the address bar
  $('status').textContent = 'Opening your gift…';
  try {
    await wallet.receive(token);
    $('status').textContent = 'Gift received. Pick your tier.';
  } catch (e) {
    $('status').textContent = `That gift didn’t open: ${e.message}`;
  }
}

async function enter(tier) {
  unlockAudio();
  const url = `/api/door?tier=${tier}`;
  $('status').textContent = 'Knocking…';
  try {
    let res = await fetch(url);
    if (res.status === 402) {
      const creq = res.headers.get('X-Cashu');
      $('status').textContent = 'Paying the door…';
      const token = await wallet.pay(creq);
      res = await fetch(url, { headers: { 'X-Cashu': token } });
    }
    const body = await res.json();
    if (res.ok) {
      $('in-tier').textContent = body.name;
      $('status').textContent = '';
      show('inside');
    } else {
      trombone();
      $('status').textContent = LINES[body.error] || body.detail || body.error;
    }
  } catch (e) {
    $('status').textContent = e.message.includes('Insufficient') ? 'Not enough sats on this phone.' : e.message;
  }
  refresh();
}

async function main() {
  config = await fetch('/api/config').then((r) => r.json());
  $('judge-price').textContent = `${config.tiers.judge.door} sats in, then ${config.tiers.judge.segment} sat / 10 s`;
  $('pleb-price').textContent = `${config.tiers.pleb.segment} sats / 10 s`;
  wallet = await openWallet(config.kitty);
  await claimGift();
  await refresh();
  $('judge').onclick = () => enter('judge');
  $('pleb').onclick = () => enter('pleb');
  show('door');
}

window.addEventListener('hashchange', () => claimGift().then(refresh));
main().catch((e) => ($('status').textContent = `Wallet failed to start: ${e.message}`));
