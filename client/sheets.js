// The bottom bar: Pocket (this phone's wallet), The night (the live screen), Longy (the artist page).
import QRCode from 'qrcode';
import { t, sats, onLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// What tonight has cost this phone, kept on this phone only (the venue never adds up a fan's spend).
const KINDS = ['door', 'stream', 'pledges', 'tips'];
const load = () => { try { return JSON.parse(localStorage.getItem('nutpub-spent') || '{}'); } catch { return {}; } };
const save = (l) => { try { localStorage.setItem('nutpub-spent', JSON.stringify(l)); } catch {} };
export function spend(kind, n) { const l = load(); l[kind] = (l[kind] || 0) + n; save(l); renderLedger(); }
export function resetSpend() { save({}); renderLedger(); }
export const spent = (kind) => load()[kind] || 0;

function renderLedger() {
  const l = load();
  const rows = KINDS.filter((k) => l[k]).map((k) => `<dt>${t(`spent.${k}`)}</dt><dd>${sats(l[k])}</dd>`);
  const total = KINDS.reduce((s, k) => s + (l[k] || 0), 0);
  $('ledger').innerHTML = rows.length
    ? rows.join('') + `<dt class="total">${t('spent.total')}</dt><dd class="total">${sats(total)}</dd>`
    : `<dt class="none">${t('spent.none')}</dt>`;
}

let wallet, config, refreshPocket;
let open = '';
function openSheet(name) {
  open = name;
  for (const s of ['pocket', 'longy']) $(`sheet-${s}`).hidden = s !== name;
  document.querySelectorAll('.bottombar button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.sheet === name)));
  if (name === 'pocket') { renderLedger(); refreshPocket(); }
}

// Top up: a Lightning invoice from the NutPub Mint, paid from any wallet.
let paying = 0;
async function topup(amount) {
  const me = ++paying;
  $('pocket-status').textContent = t('topup.asking');
  try {
    const { id, request } = await wallet.topup(amount);
    $('invoice').hidden = false;
    await QRCode.toCanvas($('invoice-qr'), `lightning:${request}`.toUpperCase(), { margin: 1, width: 600, errorCorrectionLevel: 'L' });
    $('invoice-open').href = `lightning:${request}`;
    $('invoice-copy').onclick = () => navigator.clipboard?.writeText(request).then(() => ($('pocket-status').textContent = t('topup.copied')));
    $('invoice-status').textContent = t('topup.waiting', { n: amount });
    $('pocket-status').textContent = '';
    while (me === paying && open === 'pocket') {
      await new Promise((r) => setTimeout(r, 2500));
      if (await wallet.topupDone(id)) {
        $('invoice').hidden = true;
        $('pocket-status').textContent = t('topup.done', { n: amount });
        refreshPocket();
        return;
      }
    }
  } catch (e) {
    $('pocket-status').textContent = e.message;
  }
}

async function paste() {
  const token = $('paste-token').value.trim();
  if (!token) return;
  $('pocket-status').textContent = t('gift.opening');
  try {
    await wallet.receive(token);
    $('paste-token').value = '';
    $('pocket-status').textContent = t('paste.done');
  } catch (e) {
    $('pocket-status').textContent = t('gift.fail', { msg: e.message });
  }
  refreshPocket();
}

export function initSheets(w, cfg, refresh) {
  wallet = w;
  config = cfg;
  refreshPocket = refresh;
  const host = new URL(config.kitty).host;
  const mintLine = () => t('pocket.mint', { at: host.includes('minibits') ? 'Minibits' : t('pocket.test') });
  $('pocket-mint').textContent = mintLine();
  onLang(() => { $('pocket-mint').textContent = mintLine(); renderLedger(); });
  document.querySelectorAll('.bottombar button').forEach((b) => (b.onclick = () => {
    openSheet(b.dataset.sheet);
    if (!b.dataset.sheet) scrollTo({ top: 0, behavior: 'smooth' });
  }));
  document.querySelectorAll('#topup-amounts [data-amt]').forEach((b) => (b.onclick = () => topup(Number(b.dataset.amt))));
  $('paste-go').onclick = paste;
  // A top-up paid while the page was away: Coco mints it when we come back; show the new balance.
  wallet.on('mint-op:finalized', () => refreshPocket());
  renderLedger();
}
export const sheetOpen = () => open;
export const closeSheets = () => openSheet('');
