// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// Gig 3 (Rajesh 17 Nov) runs from Show Time: each step a line of story, then the one thing to do, with the fan's QR (for
// the judge's own phone) and Pour by hand right in the line; the fan's phone sits on Show Time itself (Rajesh 18 Nov). No camera on the laptop.
// r: /api/admin/setlist's answer; page: 'setup', 'show' or 'takings'.
let toPlay = false; // gig 3: the fan's phone scrolled back to its player once, at step 6
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
  // Gig 3, the night at the venue (gigs 3 and 4 folded together, Rajesh 19 Nov): the price, the door, the stream's
  // payment, the ticket, the door scan, the drink, the tip, the fan's change, Your takings.
  const tv = list.at === 'longy'; // gig 1 (Rajesh 19 Nov): a look at the venue's TV page (Chat & Big Time Charlies) before End night
  const tvSeen = () => { try { return !!localStorage.getItem('nutpub-tv-seen'); } catch { return false; } };
  document.getElementById('screen-open')?.addEventListener('click', () => { try { localStorage.setItem('nutpub-tv-seen', '1'); } catch {} });
  const steps = pickle ? 8 : g2 ? 7 : tv ? 6 : 5;
  const say = (n, text, btn, href, { story = '', note = '', extra = null } = {}) => {
    const key = n + [].concat(story).map((x) => (typeof x === 'string' ? x : x.textContent)).join('') + note + text;
    if (said === key) return;
    said = key;
    const words = Object.assign(document.createElement('span'), { className: 'jl-say' });
    if (story) { const st = Object.assign(document.createElement('span'), { className: 'jl-story' }); st.append(...[].concat(story)); words.append(st); }
    if (note) words.append(Object.assign(document.createElement('span'), { className: 'jl-story', textContent: note })); // what the page shows below (gig 3's step 8)
    words.append(Object.assign(document.createElement('span'), { textContent: text }));
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
    6: 'The show’s on, and the beer token’s on the fan’s phone, locked to the bar. First, some music.',
    7: 'Thirsty? The fan’s phone holds the beer token: a real coin, locked to the bar.',
    poured: 'Poured. The bar took the coin at the mint with its own key; nobody in between held it.',
    8: 'Closing time. Longy’s ticket earnings and tips are locked to his key; the poured token’s £5 went to the bar.',
    // Session 40 (Rajesh 20 Nov): what Takings shows below. The no-show is client/noshow.js, paid at End night.
    takings: 'Below: tonight’s takings, a no-show’s beer token, Longy’s since last orders, and after Finish gig, the night’s receipt under Past gigs.',
  };
  // Gigs 1 and 2 (Rajesh 19 Nov): a line of story above each step too.
  const TOLD = list.at === 'longy' ? {
    setup: 'Longy’s playing Peggy Sue’s tonight, but it’s online only: a £20 ticket for fans at home.',
    start: 'Show time. Fans are waiting at home, wallets in their browsers.',
    fan: 'You’re a fan at home now: no app, no account. A real fan tops up the browser wallet from any Lightning or Cashu wallet; here test sats are already in it.',
    end: 'Every sat tonight went straight to Longy’s key. The NutPub only checked it.',
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
        if (own) return own.click();
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
  // A button that copies a link (gig 2's Fountain link), with the link beside it to select by hand.
  const copyBtn = (text) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: 'Copy the link' });
    b.onclick = async () => { try { await navigator.clipboard.writeText(text); b.textContent = 'Copied ✓'; } catch { b.textContent = 'Select it, left'; } };
    return b;
  };
  // The fan's leftover sats went home (viewer.js marks it in this browser), and Takings' Move is done (its own page).
  const fanHome = () => ['nutpub-todo', 'nutpub-todo-home'].some((k) => { try { return !!JSON.parse(localStorage.getItem(k) || 'null')?.home; } catch { return false; } });
  const movedAll = () => { const m = document.getElementById('done-moved'); return !!m && !m.hidden; };
  const draw = async () => {
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
    if (pickle) {
      if (page === 'takings' && (await admin('/api/admin/setlist'))?.setlist?.done?.includes(list.at)) {
        const bread = Object.assign(document.createElement('abbr'), { title: 'Cockney rhyming slang: bread and honey, money', textContent: 'bread' });
        return say('', 'Before you go, meet the Regulars: AI agents buy tickets here too.', 'Meet the Regulars →', judge.replace(/\/judge$/, '/agents'),
          { story: ['Longy’s ', bread, ' is in his own wallet.'] });
      }
      if (page === 'takings') return say(closed ? 8 : 7, closed ? 'Close any Cashu.me tab first. Then flick through ₿ £ $ €, press Move to my own wallet and follow it to Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[8] : '', note: closed ? STORY.takings : '' });
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
      if (!on) return say(5, 'Press Start show, the green button below.', '', '', { story: STORY[5] });
      // Step 6 (Rajesh 20 Nov): Longy's set first. Hello in the chat, so the clip plays a while; the fan's list (this browser) says
      // when it's said. Either chat counts: the fan's phone or the desktop view below (Rajesh 18 Nov).
      // Only tonight's: each list's pass is that fan's pass now, so a hello from an earlier gig on this stage doesn't count.
      const hello = ['', '-home'].some((k) => { try { const t = JSON.parse(localStorage.getItem(`nutpub-todo${k}`) || 'null'); return !!t?.hello && t.pass === localStorage.getItem(`nutpub-pass${k}`); } catch { return false; } });
      const tipped = hello && ((await admin('/api/admin/takings'))?.locked?.tip?.count || 0) > 0; // tonight's tips, real coins
      // Rajesh 21 Nov: the fan's phone is still scrolled down where the ticket was bought, near the beer token's card:
      // once, on reaching step 6, it goes back to the top, with the play button in view.
      if (!hello && !toPlay) { toPlay = true; try { document.getElementById('phone')?.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} }
      if (!tipped) return say(6, hello ? 'Now tip Longy 2,100 sats in the fan’s Tip tab.'
        : 'On the fan’s phone, on the right: press play, then say hello in its Chat tab.', '', '', { story: STORY[6] });
      // Step 7: the bar, then End night.
      const d = await drinks();
      if (!d.some((x) => x.poured)) return say(7, 'Press Pour by hand: that’s the bar scanning it. Then watch the fan’s phone.', '', '',
        { story: STORY[7], extra: pressBtn('Pour by hand', '#bar-drinks button', /^Pour by hand/, 'Pouring…') });
      return say(7, 'Now press End night, the purple button below.', '', '', { story: STORY.poured });
    }
    if (g2) {
      if (page === 'setup') {
        const pin = document.getElementById('pin-text');
        // The pin's box is inside Comments and moderators: it only shows with comments on.
        if (!document.querySelector('[data-path="comments"]')?.checked) {
          return say(1, 'Turn on Comments in the live chat, under Comments and moderators: the Pinned message box is in there.', '', '', { story: TOLD.setup });
        }
        const pinned = /fountain\.fm\//.test(pin?.value || '');
        pin?.classList.toggle('pin-hint', !pinned); // the empty box shimmers until the link's in (app.css)
        if (pin && !pinned) pin.placeholder = 'Paste in Frankie’s Fountain link here';
        if (!pinned) return say(1, `Paste Frankie’s Fountain link into Pinned message, under Comments and moderators: ${FOUNTAIN}`, '', '', { story: TOLD.setup, extra: copyBtn(FOUNTAIN) });
        return say(1, 'Now click 2 · Show Time, up above.', '', '', { story: TOLD.pinned });
      }
      if (page === 'show') {
        if (closed && fanHome()) document.getElementById('head-fan')?.remove(); // nothing left on the fan's page
        if (closed) return fanHome() ? say(5, 'Click 3 · Your takings, at the top.')
          : say(5, 'Back on the fan’s page: press Move my sats, move them to Cashu.me, then close that tab.', '', '', { story: TOLD.home });
        if (!on) return say(2, 'Press Start show, the green button below.', '', '', { story: TOLD.start });
        if (!fanDone()) return say(3, 'Press Fan’s page ↗, top right, and follow the strip there. Then come back here.', '', '', { story: TOLD.fan });
        return say(4, 'The fan’s list is all ticked: press End night, the purple button below.', '', '', { story: TOLD.end });
      }
      if (!closed) return say(4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
      return movedAll() ? say(7, 'Close the Cashu.me tab, then press Finish gig.', '', '', { story: TOLD.paid })
        : say(6, 'Close the fan’s Cashu.me tab first: the demo works with one Cashu.me tab at a time. Then press Move to my own wallet.', '', '', { story: TOLD.takings });
    }
    // Rajesh 18 Nov: the judges press the artist's own tabs, at the top, from the first gig on.
    // Fan's page ↗ only while the show's on (Rajesh 20 Nov): not on Plan gig, not before Start show, not after End night.
    const fanBtn = document.getElementById('head-fan');
    if (fanBtn) fanBtn.style.display = page === 'show' && on && !closed ? '' : 'none';
    if (page === 'setup') say(1, `This is where ${name} sets prices, ticketing, comments & mods, show splits and more. Scroll down to view; nothing needs changing. Then click 2 · Show Time, up above.`, '', '', { story: TOLD.setup });
    else if (page === 'show') {
      if (closed) say(tv ? 6 : 5, 'The night’s over. Click 3 · Your takings, at the top.');
      else if (!on) say(2, 'Press Start show, the green button below.', '', '', { story: TOLD.start });
      else if (!fanDone()) say(3, 'Press Fan’s page ↗, top right, and follow the strip there. Then come back here.', '', '', { story: TOLD.fan });
      else if (tv && !tvSeen()) say(4, 'Press the Chat & Big Time Charlies widget, just above the three big buttons. Have a look, then come back to this tab.', '', '', { story: 'The tips and the chat go up on the pub’s TVs too.' });
      else say(tv ? 5 : 4, 'The fan’s list is all ticked: press End night, the purple button below.', '', '', { story: TOLD.end });
    } else if (!closed) say(tv ? 5 : 4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
    else say(tv ? 6 : 5, `Press Move to Cashu.me, then close the Cashu.me tab, come back here and press Finish gig.`, '', '', { story: TOLD.takings });
  };
  await draw();
  // Show Time's line follows its buttons and the fan's tab; the others only change when the page is opened again.
  if (g2 && page === 'setup') {
    document.getElementById('pin-text')?.addEventListener('input', () => draw());
    document.querySelector('[data-path="comments"]')?.addEventListener('change', () => draw());
  }
  if (pickle && page === 'takings') document.addEventListener('nutpub:finished', () => draw());
  if (page === 'show' || (pickle && page === 'setup') || (g2 && ['setup', 'takings'].includes(page))) { // gig 3's Plan gig: the price and the door move it on (session 36)
    setInterval(() => { if (!document.hidden) draw(); }, pickle ? 3000 : 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}

