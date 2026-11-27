// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// Gig 3 (Rajesh 17 Nov) runs from Show Time: each step a line of story, then the one thing to do, with the fan's QR (for
// the judge's own phone) and Pour by hand right in the line; the fan's phone sits on Show Time itself (Rajesh 18 Nov). No camera on the laptop.
// r: /api/admin/setlist's answer; page: 'cellar', 'setup', 'show' or 'takings'.
let toPlay = false; // gig 3: the fan's phone scrolled back to its player once, at step 6
let toDrink = false; // and down to the drink once, at the pour (step 7)
export async function judgeLine(r, page) {
  const list = r?.setlist;
  if (!list?.only) return;
  const judge = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/judge`;
  const back = document.querySelector('.head-back');
  if (back) Object.assign(back, { href: judge, textContent: '← The three gigs' });
  if (page === 'takings') document.getElementById('head-fan')?.remove(); // the night's over: nothing left on the fan's page
  document.getElementById('after')?.style.setProperty('display', 'none'); // Show Time's night-over words (Stop your stream…): not on a judge's stage (Rajesh 19 Nov)
  // No gig poster on a judge's stage (Rajesh 17 Nov): never part of the demo. Hidden, not removed: Plan gig still fills it.
  document.getElementById('poster-panel')?.style.setProperty('display', 'none');
  // No Replay card on a judge's stage (Rajesh 20 Nov: less to take in); real artists keep it.
  document.getElementById('replay-card')?.style.setProperty('display', 'none');
  const name = { longy: 'Longy', frankie: 'Frankie', pickle: 'Longy', yours: 'Frankie' }[list.at] || 'the artist';
  const pickle = list.at === 'pickle';
  // Gig 3 (Rajesh 27 Nov): the fan's phone sits on Show Time, so a Fan's page button only pulls a judge off its list.
  if (pickle) document.getElementById('head-fan')?.remove();
  const line = Object.assign(document.createElement('div'), { className: 'judge-line' });
  line.setAttribute('role', 'status');
  document.querySelector('header').after(line);
  // The fan's list, all ticked: the fan's page keeps it in this browser (viewer.js, the to-do box).
  const fanDone = () => ['nutpub-todo', 'nutpub-todo-home'].some((k) => { try { return !!JSON.parse(localStorage.getItem(k) || 'null')?.all; } catch { return false; } });
  let said = '';
  // n: the step; text: the one thing to do; story: gig 3's line of the story, before it; extra: a QR or a button.
  // Gig 2 (Rajesh 20 Nov): no replay; the Fountain pin first, then one thing a step, the fan's sats home and Move apart.
  const g2 = list.at === 'frankie';
  const FOUNTAIN = 'https://fountain.fm/artist/YPv5hRTJVHSoWeB86g6m';
  const PIN = `Frankie’s Fountain page: ${FOUNTAIN}`; // Rajesh 25 Nov: the pin says what the link is
  // Gig 3, the night at the venue (gigs 3 and 4 folded together, Rajesh 19 Nov): the price, the door, the stream's
  // payment, the ticket, the door scan, the drink, the tip, the fan's change, Your takings.
  const tv = list.at === 'longy'; // gig 1 (Rajesh 19 Nov): a look at Pub TV, the venue's TV page, before End night
  const tvSeen = () => { try { return !!localStorage.getItem('nutpub-tv-seen'); } catch { return false; } };
  // Session 58 (Rajesh 23 Nov): gig 1 shows the chat's Quiet before End night; chatstrip.js marks this stage once it's pressed.
  const quieted = () => { try { return localStorage.getItem('nutpub-quieted') === location.host; } catch { return false; } };
  // Gig 1's Cellar step: the words sheet opened and shut once; leaving for Plan gig counts too (Open again then skips Cellar).
  const CELLAR = 'nutpub-cellar-seen';
  const cellarSeen = () => { try { return !!localStorage.getItem(CELLAR); } catch { return false; } };
  const seeCellar = () => { try { localStorage.setItem(CELLAR, '1'); } catch {} };
  if (tv && page === 'cellar') document.getElementById('words-sheet')?.addEventListener('close', () => { seeCellar(); said = ''; draw(); });
  // Gig 1's words sheet (session 51): the judges' next press is Not now, so it's the yellow one, first; "I've written
  // them down" goes quiet (pressed, it asks for two typed words). Real artists keep the words first.
  if (tv && page === 'cellar') {
    const done = document.getElementById('words-done'), later = document.getElementById('words-later');
    if (done && later) {
      later.className = 'btn primary';
      done.className = 'btn quiet last';
      done.before(later);
    }
  }
  if (tv && page !== 'cellar') seeCellar();
  document.getElementById('screen-open')?.addEventListener('click', () => { try { localStorage.setItem('nutpub-tv-seen', '1'); } catch {} });
  const steps = pickle ? 8 : g2 ? 8 : tv ? 10 : 5; // gig 1: 1 the 12 words, 2 on to Plan gig, 3 Plan gig, 4 Start show, 5–7 the fan's page, 8 End night, 9 Takings (session 47)
  const o = tv ? 2 : 0; // gig 1's Cellar step (session 47) comes first: its later steps move up one
  const say = (n, text, btn, href, { story = '', note = '', extra = null } = {}) => {
    const key = n + [].concat(story, text).map((x) => (typeof x === 'string' ? x : x.textContent)).join('') + note;
    if (said === key) return;
    said = key;
    const words = Object.assign(document.createElement('span'), { className: 'jl-say' });
    if (story) { const st = Object.assign(document.createElement('span'), { className: 'jl-story' }); st.append(...[].concat(story)); words.append(st); }
    if (note) words.append(Object.assign(document.createElement('span'), { className: 'jl-story', textContent: note })); // what the page shows below (gig 3's step 8)
    { const t = document.createElement('span'); t.append(...[].concat(text)); words.append(t); } // text may hold a word with its meaning (abbr)
    line.replaceChildren(Object.assign(document.createElement('b'), { textContent: n ? `Judges · ${n} of ${steps}` : 'Judges' }), words);
    if (extra) line.append(extra);
    if (btn) line.append(Object.assign(document.createElement('a'), { className: 'btn primary', href, textContent: btn }));
  };
  // Gig 3's story, one line a step (Rajesh's words, 19 Nov). No laptop camera: the judge's own phone, if any, is the
  // doormen's; the fan is the phone beside Show Time; the bar pours by hand.
  // Rajesh 19 Nov (late): Longy's deal with the venue, a beer token in the ticket; Drink at bar is off a judge's Plan gig.
  const STORY = {
    1: 'Gig 3 gets NUT-heavy: door entry by a QR code that refreshes every 30 seconds, so a screenshot can’t get in, and a £5 beer token that’s a coin, included in Longy’s £35 ticket.',
    2: 'A ticket’s only as good as the door that checks it. This QR turns a phone into the doormen’s scanner.',
    3: 'You’re a fan at the door of The Fickle Pickle. At the venue, the stream waits for a ticket: fans who’ve paid to be there get the stream on their phones too.',
    4: 'Ticket bought, with the beer token in it. It was signed blind, so not even the NutPub can tell who comes in. Its door QR changes every 30 seconds, so a screenshot won’t get in.',
    5: 'Let the Nutter in. The door saw a ticket signed by tonight’s gig and used once, never who bought it. The beer token reaches the fan’s phone when the show starts.',
    // Rajesh 20 Nov (session 40): Longy's set first, a breather, then the bar.
    // Session 58 (Rajesh 23 Nov): gig 3's stream is free, so its chat goes with a tip (55c); hello and the tip are one step.
    6: 'The show’s on, and the beer token’s on the fan’s phone. A free stream’s chat goes with a tip while no moderator is on, as tipping with hard money stops spam.',
    7: 'Thirsty? The fan’s phone holds the beer token: a real coin, locked to the bar’s key (NUT-11), so only the bar can spend it.',
    poured: 'Poured. The bar’s key unlocked the coin (NUT-11) and swapped it at the mint; the fan’s phone saw it spent (NUT-07). Nobody in between held it.',
    again: 'Turned away by the mint itself: a spent coin stays spent (NUT-07), so a drink QR, or a screenshot of it, pours once. No list behind the bar to fiddle.',
    8: 'Closing time. Longy’s ticket earnings and tips are locked to his key; the poured token’s £5 went to the bar.',
    // Session 40 (Rajesh 20 Nov): what Takings shows below. The no-show is client/noshow.js, paid at End night.
    takings: 'Below: tonight’s takings, a no-show’s beer token, Longy’s since last orders, and after Finish gig, the night’s receipt under Past gigs.',
  };
  // Gigs 1 and 2 (Rajesh 19 Nov): a line of story above each step too.
  // British slang with its meaning on hover or a tap, as the Kitchen's dicky bird (app.css abbr[data-means]).
  const gander = () => { const g = Object.assign(document.createElement('abbr'), { textContent: 'gander', tabIndex: 0 }); g.dataset.means = 'A look, as a goose (a gander) cranes its long neck to see'; return g; };
  const TOLD = list.at === 'longy' ? {
    // Session 47 (Rajesh 21 Nov): gig 1 opens on Cellar, the only gig that shows it.
    // Session 53: the passkey gets him in; the 12 words guard the money.
    cellar: 'Longy’s playing Peggy Sue’s tonight, online only. His passkey gets him in. The 12 words guard the money, and win the gig back if a device goes.',
    setup: 'Plan gig is tonight’s: a £20 ticket for fans at home.',
    start: 'Show time. Fans are waiting at home, wallets in their browsers.',
    fan: 'You’re a fan at home now: no app, no account. A real fan tops up the browser wallet from any Lightning or Cashu wallet; here test sats are already in it.',
    end: 'Every sat tonight went straight to Longy’s key. The NutPub only checked it.',
    quiet: 'Longy’s alone on stage, so the chat looks after itself: slurs and his own banned words never reach it, and mods he invites from Cellar step in with a passkey or Nostr Sign In.',
    takings: 'Closing time. The ticket and tips are Longy’s, locked to his key.',
  } : list.at === 'frankie' ? {
    setup: 'Frankie’s at The Fickle Pickle, and fans at home pay as they watch: 60 sats a minute.',
    pinned: 'Pinned over the chat, for every fan watching.',
    start: 'Show time. Nobody pays until they press play.',
    fan: 'You’re a fan at home. The video comes in 10-second pieces.',
    end: 'You paid for the minutes you watched, straight to Frankie’s key.',
    home: 'What the fan didn’t spend is the fan’s: it goes home to their own wallet.',
    takings: 'He’s able to earn income in 3 ways: venue tickets, per minute streaming and tips.', // Rajesh 20 Nov: shorter; the NUT-heavy line opens gig 3
    paid: 'Paid out: from Frankie’s browser to his own wallet, nobody in between.',
    receipt: 'Frankie keeps the night’s receipt. Finish gig folds it and stamps it PAID OUT.',
  } : {};
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const admin = (path) => fetch(path, { headers: { 'X-Admin': key } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const drinks = () => admin('/api/admin/drinks').then((d) => d || []);
  // Pour by hand and Let in by hand, right in the line: each presses Show Time's own button (barstrip.js).
  const pressBtn = (words, sel, re, busy) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: words });
    // Show Time's strip lists a new ticket within seconds: until it's there, ask again (up to 10 s).
    b.onclick = async () => {
      b.disabled = true; b.textContent = busy;
      for (let i = 0; i < 10; i++) {
        const own = [...document.querySelectorAll(sel)].find((x) => re.test(x.textContent));
        if (own) { own.click(); setTimeout(() => { b.disabled = false; b.textContent = words; }, 12000); return; } // session 58: never stuck on Pouring… (a slow test mint)
        await new Promise((r) => setTimeout(r, 1000));
      }
      b.disabled = false; b.textContent = words;
    };
    return b;
  };
  // A button on the fan's phone, the one beside Show Time (gig 3): pressed from the line.
  const fanBtn = (words, sel, busy) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: words });
    b.onclick = async () => {
      b.disabled = true; b.textContent = busy;
      for (let i = 0; i < 10; i++) {
        const own = document.getElementById('phone')?.contentDocument?.querySelector(sel);
        if (own && !own.hidden && !own.disabled) return own.click();
        await new Promise((r) => setTimeout(r, 1000));
      }
      b.disabled = false; b.textContent = words;
    };
    return b;
  };
  // A button that copies a link (gig 2's Fountain link), with the link beside it to select by hand. Session 46: then the
  // box it goes in comes into view (it sits below the first screen on a laptop), ready to paste.
  const copyBtn = (text, box) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: 'Copy the link' });
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Select it, left'; return; }
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box?.focus({ preventScroll: true });
    };
    return b;
  };
  // The fan's leftover sats went home (viewer.js marks it in this browser), and Takings' Move is done (its own page).
  const fanHome = () => ['nutpub-todo', 'nutpub-todo-home'].some((k) => { try { return !!JSON.parse(localStorage.getItem(k) || 'null')?.home; } catch { return false; } });
  const movedAll = () => { const m = document.getElementById('done-moved'); return !!m && !m.hidden; };
  // Gig 2's receipt (session 63b, Rajesh 26 Nov): Save receipt pressed on this stage, in this browser.
  const RECEIPT = `nutpub-receipt-saved:${location.hostname}`;
  const receiptSaved = () => { try { return !!localStorage.getItem(RECEIPT); } catch { return false; } };
  const draw = async () => {
    // Cellar (session 46): not a step of the night; a judge who looks in is told so.
    if (page === 'cellar') {
      document.getElementById('head-fan')?.style.setProperty('display', 'none');
      // Gig 1 (Rajesh 21 Nov, session 47): a look at the 12 words, no typing, then on to Plan gig.
      if (tv) return say(cellarSeen() ? 2 : 1, cellarSeen() ? 'Now click 1 · Plan gig, up above.' : 'Press Write down your 12 words, have a look, then Not now.', '', '', { story: TOLD.cellar });
      return say('', 'Nothing to do here: carry on from the tabs above.', '', '', { story: `What ${name} sets once lives in Cellar: his 12 words, photos, stream, producers and moderators.` });
    }
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
    if (pickle) {
      if (page === 'takings' && (await admin('/api/admin/setlist'))?.setlist?.done?.includes(list.at)) {
        const bread = Object.assign(document.createElement('abbr'), { textContent: 'bread', tabIndex: 0 }); bread.dataset.means = 'Money: Cockney rhyming slang, bread and honey';
        return say('', 'Before you go, read the Pub Board: AI agents buy tickets here too.', 'Read the board →', judge.replace(/\/judge$/, '/board'),
          { story: ['Longy’s ', bread, ' is in his own wallet.'] });
      }
      if (page === 'takings') {
        // Rajesh 27 Nov: before End night a judge could Move from here and lose the thread: Move waits for End night.
        for (const id of ['move-row', 'moved']) {
          const el = document.getElementById(id);
          if (closed) el?.style.removeProperty('display'); else el?.style.setProperty('display', 'none');
        }
        if (!closed) return say(7, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
        // Rajesh 27 Nov: after Move, a look at the receipt (no printing), then Finish gig.
        if (movedAll() && receiptSaved()) return say(8, 'Now press Finish gig.', '', '', { story: STORY[8] });
        if (movedAll()) return say(8, 'Press Save receipt to see it, then close the Print box.', '', '', { story: STORY[8] });
        return say(8, 'Close any Cashu.me tab first. Then flick through ₿ £ $ €, press Move to my own wallet and follow it to Finish gig.', '', '', { story: STORY[8], note: STORY.takings });
      }
      const show = (await admin('/api/show'))?.show;
      if (!show) return;
      // Step 1 on Plan gig (Rajesh 19 Nov): the ticket's price, exactly £35 (the £5 pint in it), and the door on.
      const ready = Number(show.ticket?.fiat) === 35 && !!show.door?.on;
      // Rajesh 20 Nov: the box to fill shimmers, as gig 2's pin does: the price first, then the door's switch.
      if (page === 'setup') {
        const priced = Number(show.ticket?.fiat) === 35;
        document.querySelector('[data-path="ticket.fiat"]')?.classList.toggle('pin-hint', !priced);
        document.getElementById('door-on')?.closest('.room-switch')?.classList.toggle('pin-hint', priced && !show.door?.on);
      }
      if (!ready) {
        if (page !== 'setup') return say(1, 'Back on Plan gig: the venue ticket’s price and the door first.', 'Back to Plan gig →', '/setup');
        return say(1, 'Type £35 for the In the Room venue ticket, then turn on Scan tickets at the door.', '', '', { story: STORY[1] });
      }
      // Rajesh 20 Nov: ask for the scan before Show Time (the phone stays optional); a button takes them to the pass.
      if (page === 'setup') {
        const toPass = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: 'Show me the DOOR pass ↓' });
        toPass.onclick = () => document.getElementById('door-pass-card')?.scrollIntoView({ block: 'center' });
        return say(2, 'Scan the DOOR pass with your phone’s camera and open its link: your phone is now the doormen’s scanner. Then click 2 · Show Time, at the top. No phone? Go straight to Show Time.', '', '', { story: STORY[2], extra: toPass });
      }
      // Rajesh 18 Nov: the judges press the artist's own button, at the top; no button of the line's own.
      // The fan's sats home is gig 2's step now (Rajesh 19 Nov): here the night's over, on to Your takings.
      if (closed) { // Rajesh 20 Nov: nothing left on the fan's page
        document.getElementById('head-fan')?.remove();
        return say(8, 'The night’s over. Click 3 · Your takings, at the top.');
      }
      // Blind-signed tickets (session 39): the door knows how many are in, never whose. No phone: the fan's phone shows a
      // door word (its own button, in the phone on the right) and Show Time lets it in.
      const door = (await admin('/api/admin/door')) || { sold: 0, inside: 0, words: [] };
      if (!door.sold) return say(3, 'On the fan’s phone, on the right: scroll down and buy the venue ticket.', '', '', { story: STORY[3] });
      // The fan's phone offers the one optional step first: Save your ticket as a passkey.
      const keep = document.getElementById('phone')?.contentDocument?.getElementById('keep');
      if (!door.inside && keep && !keep.hidden) return say(4, 'On the fan’s phone: save the ticket as a passkey if you like (Find my ticket brings it back on another phone), or press Not now.', '', '', { story: STORY[4] });
      if (!door.inside) {
        const waiting = door.words.some((w) => !w.in_at);
        const both = Object.assign(document.createElement('span'), { className: 'jl-btns' });
        if (!waiting) both.append(fanBtn('Show a door word', '#door-word-btn', 'Asking…'));
        both.append(pressBtn('Let in', '#door-tickets button', /Let in$/, 'Letting in…'));
        return say(4, waiting ? 'The fan’s phone shows a door word: press Let in.' : 'On your phone: scan the fan’s door QR on the right. No phone, Judge? Press Show a door word, then Let in.', '', '',
          { story: STORY[4], extra: both });
      }
      if (!on) return say(5, 'Press Start show, the yellow button below.', '', '', { story: STORY[5] });
      // Step 6 (Rajesh 20 Nov): Longy's set first. Hello in the chat, so the clip plays a while; the fan's list (this browser) says
      // when it's said. Either chat counts: the fan's phone or the desktop view below (Rajesh 18 Nov).
      // Only tonight's: each list's pass is that fan's pass now, so a hello from an earlier gig on this stage doesn't count.
      const hello = ['', '-home'].some((k) => { try { const t = JSON.parse(localStorage.getItem(`nutpub-todo${k}`) || 'null'); return !!t?.hello && t.pass === localStorage.getItem(`nutpub-pass${k}`); } catch { return false; } });
      const tipped = hello && ((await admin('/api/admin/takings'))?.locked?.tip?.count || 0) > 0; // tonight's tips, real coins
      // Rajesh 21 Nov: the fan's phone is still scrolled down where the ticket was bought, near the beer token's card:
      // once, on reaching step 6, it goes back to the top, with the play button in view.
      if (!hello && !toPlay) { toPlay = true; try { document.getElementById('phone')?.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }
      if (!tipped) return say(6, hello ? 'Now tip Longy 2,100 sats in the fan’s Tip tab.'
        : 'On the fan’s phone, on the right: press play, then say hello with a 2,100-sat tip in its Chat tab.', '', '', { story: STORY[6] });
      // Step 7: the bar, then End night.
      const d = await drinks();
      // Rajesh 27 Nov: the drink sits far below the fan's list; once, at the pour, the phone shows it.
      if (!d.some((x) => x.poured) && !toDrink) { toDrink = true; try { document.getElementById('phone')?.contentDocument?.getElementById('drink')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }
      if (!d.some((x) => x.poured)) return say(7, 'Press Pour by hand: the bar’s key, kept in this browser, signs the coin and swaps it at the mint, as the bar’s scanner would. Then watch the fan’s phone.', '', '',
        { story: STORY[7], extra: pressBtn('Pour by hand', '#bar-drinks button', /^Pour by hand/, 'Pouring…') });
      // Session 58 (Rajesh 23 Nov): the cheeky second pint is a step of its own; DevTools optional, opened before it.
      const second = (() => { try { return localStorage.getItem('nutpub-second-pint') === location.host; } catch { return false; } })();
      if (!second) return say(7, 'Cheeky second pint? First open developer tools (⌥⌘I), click Network and type “testnut” in its filter box. Then press Pour again: the mint’s swap comes back 400, already spent.', '', '',
        { story: STORY.poured, extra: pressBtn('Pour again', '#bar-drinks button', /pour again$/, 'Pouring…') });
      return say(7, 'Close developer tools (⌥⌘I again), then press End night, the yellow button below.', '', '', { story: STORY.again });
    }
    if (g2) {
      if (page === 'setup') {
        const pin = document.getElementById('pin-text');
        // The pin's box is inside Comments and moderators: it only shows with comments on.
        if (!document.querySelector('[data-path="comments"]')?.checked) {
          return say(1, 'Turn on Comments in the live chat, under Comments: the Pinned message box is in there.', '', '', { story: TOLD.setup });
        }
        const pinned = /fountain\.fm\//.test(pin?.value || '');
        pin?.classList.toggle('pin-hint', !pinned); // the empty box shimmers until the link's in (app.css)
        if (pin && !pinned) pin.placeholder = 'Paste in Frankie’s Fountain link here';
        if (!pinned) return say(1, `Paste Frankie’s Fountain link into Pinned message, under Comments: ${FOUNTAIN}`, '', '', { story: TOLD.setup, extra: copyBtn(PIN, pin) });
        return say(1, 'Now click 2 · Show Time, up above.', '', '', { story: TOLD.pinned });
      }
      if (page === 'show') {
        if (closed && fanHome()) document.getElementById('head-fan')?.remove(); // nothing left on the fan's page
        if (closed) return fanHome() ? say(5, 'Click 3 · Your takings, at the top.')
          : say(5, 'Back on the fan’s page: press Move my sats, move them to Cashu.me, then close that tab.', '', '', { story: TOLD.home });
        if (!on) return say(2, 'Press Start show, the yellow button below.', '', '', { story: TOLD.start });
        if (!fanDone()) return say(3, 'Press Fan’s page ↗, top right, and follow the strip there. Then come back here.', '', '', { story: TOLD.fan });
        return say(4, 'The fan’s list is all ticked: press End night, the yellow button below.', '', '', { story: TOLD.end });
      }
      if (!closed) return say(4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
      if (movedAll() && receiptSaved()) return say(8, 'Now press Finish gig.', '', '', { story: TOLD.receipt });
      return movedAll() ? say(7, 'Close the Cashu.me tab, then press Save receipt and choose Save as PDF in your browser’s Print box.', '', '', { story: TOLD.paid })
        : say(6, 'Close the fan’s Cashu.me tab first: the demo works with one Cashu.me tab at a time. Then press Move to my own wallet.', '', '', { story: TOLD.takings });
    }
    // Rajesh 18 Nov: the judges press the artist's own tabs, at the top, from the first gig on.
    // Fan's page ↗ only while the show's on (Rajesh 20 Nov): not on Plan gig, not before Start show, not after End night.
    const headFan = document.getElementById('head-fan'); // not "fanBtn": that name, above, makes gig 3's door-word button (session 51)
    if (headFan) headFan.style.display = page === 'show' && on && !closed ? '' : 'none';
    // Session 46: what's set once moved to Cellar, the first tab; Plan gig keeps tonight.
    if (page === 'setup') say(1 + o, tv ? ['Tickets, comments, stretch goals, splits and tips live here. Nothing needs changing, but take a ', gander(), ' before you click 2 · Show Time, up above.']
      : `This is where ${name} plans tonight: tickets, comments, stretch goals, splits and tips. What he sets once is in Cellar. Nothing needs changing: click 2 · Show Time, up above.`, '', '', { story: TOLD.setup });
    else if (page === 'show' && tv) { // gig 1 (session 47): Pub TV is part of the fan's steps now
      if (closed) say(10, 'The night’s over. Click 3 · Your takings, at the top.');
      else if (!on) say(4, 'Press Start show, the yellow button below.', '', '', { story: TOLD.start });
      else if (!fanDone()) say(5, 'Press Fan’s page ↗, top right, and follow the strip there: steps 5 to 7. Then come back here.', '', '', { story: TOLD.fan });
      else if (!quieted()) say(8, 'Press Quiet on the “Big up the A13 Massive!” line: that phone’s words leave every fan’s chat tonight. Then End night.', '', '', { story: TOLD.quiet });
      else say(9, 'Now press End night, the yellow button below.', '', '', { story: TOLD.end });
    } else if (page === 'show') {
      if (closed) say((tv ? 6 : 5) + o, 'The night’s over. Click 3 · Your takings, at the top.');
      else if (!on) say(2 + o, 'Press Start show, the yellow button below.', '', '', { story: TOLD.start });
      else if (!fanDone()) say(3 + o, 'Press Fan’s page ↗, top right, and follow the strip there. Then come back here.', '', '', { story: TOLD.fan });
      else if (tv && !tvSeen()) say(4 + o, 'Press the Pub TV widget, just above the three big buttons. Have a look, then come back to this tab.', '', '', { story: 'The tips and the chat go up on Pub TV too.' });
      else say((tv ? 5 : 4) + o, 'The fan’s list is all ticked: press End night, the yellow button below.', '', '', { story: TOLD.end });
    } else if (!closed) say(tv ? 9 : 4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
    // Session 45 (Rajesh 21 Nov): the button on screen first, then Cashu.me's own welcome, which a new judge meets there.
    else say(tv ? 10 : 5, 'Press Move to my own wallet, then Move to Cashu.me. First time on Cashu.me? Its welcome comes first. Then close the Cashu.me tab, come back here and press Finish gig.', '', '', { story: TOLD.takings });
  };
  await draw();
  // Show Time's line follows its buttons and the fan's tab; the others only change when the page is opened again.
  if (g2 && page === 'setup') {
    document.getElementById('pin-text')?.addEventListener('input', () => draw());
    document.querySelector('[data-path="comments"]')?.addEventListener('change', () => draw());
  }
  if (pickle && page === 'takings') document.addEventListener('nutpub:finished', () => draw());
  if ((g2 || pickle) && page === 'takings') document.getElementById('wrap-save')?.addEventListener('click', () => { try { localStorage.setItem(RECEIPT, '1'); } catch {} setTimeout(draw, 300); });
  if (page === 'show' || (pickle && page === 'setup') || (g2 && ['setup', 'takings'].includes(page))) { // gig 3's Plan gig: the price and the door move it on (session 36)
    setInterval(() => { if (!document.hidden) draw(); }, pickle ? 3000 : 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}

