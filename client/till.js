// The bar's till (gig 3, 17 Nov): this laptop's camera reads the drink the fan's phone plays as an animated NUT-16 QR
// (client/pint.js), a small pint filling as the pieces arrive. Once the coin is whole, the bar takes that scanned coin at
// the mint with its own key, which lives in this browser's 'nutpub-bar' wallet. No server in between: the server is only
// told afterwards, so Show Time's list and the fan's page follow. At a real bar a phone or handheld does this.
// The camera: qr-scanner (MIT), the browser's own reader where there is one. The frames: cashu-ts's own decoder,
// copied unchanged from its pull request #1309 (vendor/cashu-ts-nut16).
import QrScanner from 'qr-scanner';
import { getDecodedToken, getDecodedTokenBinary, getEncodedToken } from '@cashu/cashu-ts';
import { FountainDecoder } from '../vendor/cashu-ts-nut16/src/utils/fountain.ts';

const $ = (id) => document.getElementById(id);
const sats = (v) => `${Number(v || 0).toLocaleString('en-GB')} sats`;

// api: Show Time's admin fetch; bar: the bar's wallet; mintUrl: the gig's mint; done(): the strip refreshes.
export function till({ api, bar, mintUrl, done, sounds }) {
  let scanner = null, decoder = new FountainDecoder(), busy = false;
  const say = (t, ok = false) => { $('till-say').textContent = t; $('till-say').classList.toggle('ok', ok); };
  const fill = (k) => {
    const h = 80 * Math.min(1, k);
    $('till-beer').setAttribute('y', 90 - h); $('till-beer').setAttribute('height', h);
    $('till-head').setAttribute('y', 90 - h - (k > 0 ? 6 : 0)); $('till-head').setAttribute('height', k > 0 ? 6 : 0);
  };
  const ids = async () => (await (await fetch(`${mintUrl.replace(/\/$/, '')}/v1/keysets`)).json()).keysets.map((k) => k.id);

  async function take(bytes) {
    busy = true;
    say('Taking the coin at the mint…');
    try {
      const keysets = await ids();
      const coin = getDecodedTokenBinary(bytes, keysets);
      // The hand-over needs no server (Rajesh 17 Nov): the coin says which key it's locked to (NUT-11), and the bar takes
      // it at the mint with that key, held here. Only then is the server told, so Show Time's list and the phone follow.
      const lock = (() => { try { const [kind, s] = JSON.parse(coin.proofs[0].secret); return kind === 'P2PK' ? s.data : null; } catch { return null; } })();
      if (!lock || !(await bar.coco.keyring.getKeyPair(lock))) throw new Error('That coin isn’t locked to this bar’s key.');
      const total = coin.proofs.reduce((a, p) => a + Number(p.amount), 0);
      let spent = false;
      try { await bar.collect(getEncodedToken(coin), lock); }
      catch (e) { if (!/spent/i.test(e.message)) throw e; spent = true; }
      // Which of tonight's drinks it was, for the list: the same coin the fan paid (the server keeps a locked copy).
      const same = (d) => { try { return getDecodedToken(d.token, keysets).proofs.some((p) => p.secret === coin.proofs[0]?.secret); } catch { return false; } };
      const d = (await api('GET', '/api/admin/drinks')).find(same);
      if (d && !spent) await api('POST', '/api/admin/locked/collected', { ids: [d.locked], by: 'bar' }).catch(() => {});
      if (spent) { sounds.trombone(); say(`${d ? `Drink ${d.id}` : 'That drink'}: already poured, mate. The mint says it’s spent.`); }
      else { sounds.clink(); say(`Poured ✓ · ${sats(total)}: the coin is the bar’s now. Watch the phone.`, true); }
      setTimeout(() => { $('till').hidden = true; }, 5000); // the Judges line says it from here
      stop();
      done();
    } catch (e) {
      say(e.message);
      decoder.reset(); fill(0);
    } finally { busy = false; }
  }

  function read(text) {
    if (busy || !FountainDecoder.isFrame(text)) return;
    try {
      if (!decoder.receive(text)) return;
    } catch { decoder.reset(); return; } // a frame from another coin: start again on this one
    fill(decoder.progress);
    say(`Reading the drink · ${Math.round(decoder.progress * 100)}%`);
    if (decoder.isComplete) take(decoder.result);
  }

  async function open() {
    $('till').hidden = false; $('till-open').hidden = true;
    decoder = new FountainDecoder(); fill(0);
    say('Hold the phone’s drink up to this laptop’s camera.');
    try {
      scanner = new QrScanner($('till-cam'), (r) => read(r.data), { returnDetailedScanResult: true, maxScansPerSecond: 20, preferredCamera: 'user' });
      await scanner.start();
    } catch {
      say('The camera didn’t open: allow it in the browser’s address bar, or use Pour by hand.');
    }
  }
  function stop() { scanner?.stop(); scanner?.destroy(); scanner = null; }
  $('till-open').onclick = open;
  if (/(^|\.)localhost$/.test(location.hostname)) window.nutpubTillRead = read; // local testing only: feed it frames without a camera
  $('till-close').onclick = () => { stop(); $('till').hidden = true; done(); };
}
