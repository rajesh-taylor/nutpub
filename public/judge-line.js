// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// Gig 3 (Rajesh 17 Nov) runs from Show Time: each step a line of story, then the one thing to do, with the fan's QR (for
// the judge's own phone) and Pour by hand right in the line; the fan's phone sits on Show Time itself (Rajesh 18 Nov). No camera on the laptop.
// r: /api/admin/setlist's answer; page: 'setup', 'show' or 'takings'.
export async function judgeLine(r, page) {
  const list = r?.setlist;
  if (!list?.only) return;
  const judge = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/judge`;
  const back = document.querySelector('.head-back');
  if (back) Object.assign(back, { href: judge, textContent: '← The three gigs' });
  if (page === 'takings') document.getElementById('head-fan')?.remove(); // the night's over: nothing left on the fan's page
  // No gig poster on a judge's stage (Rajesh 17 Nov): never part of the demo. Hidden, not removed: Plan gig still fills it.
  document.getElementById('poster-panel')?.style.setProperty('display', 'none');
  const name = { longy: 'Longy', frankie: 'Frankie', pickle: 'Longy', yours: 'Frankie' }[list.at] || 'the artist';
  const pickle = list.at === 'pickle';
  const line = Object.assign(document.createElement('div'), { className: 'judge-line' });
  line.setAttribute('role', 'status');
  document.querySelector('header').after(line);
  // The fan's list, all ticked: the fan's page keeps it in this browser (viewer.js, the to-do box).
  const fanDone = () => ['nutpub-todo', 'nutpub-todo-home'].some((k) => { try { return !!JSON.parse(localStorage.getItem(k) || 'null')?.all; } catch { return false; } });
  let said = '';
  // n: the step; text: the one thing to do; story: gig 3's line of the story, before it; extra: a QR or a button.
  const replay = list.at === 'frankie'; // gig 2 shows the replay (session 34): a step of its own after End night
  // Gig 3, the night at the venue (gigs 3 and 4 folded together, Rajesh 19 Nov): the price, the door, the stream's
  // payment, the ticket, the door scan, the drink, the tip, the fan's change, Your takings.
  const steps = pickle ? 11 : replay ? 6 : 5;
  const say = (n, text, btn, href, { story = '', extra = null } = {}) => {
    if (said === n + story + text) return;
    said = n + story + text;
    const words = Object.assign(document.createElement('span'), { className: 'jl-say' });
    if (story) words.append(Object.assign(document.createElement('span'), { className: 'jl-story', textContent: story }));
    words.append(Object.assign(document.createElement('span'), { textContent: text }));
    line.replaceChildren(Object.assign(document.createElement('b'), { textContent: n ? `Judges · ${n} of ${steps}` : 'Judges' }), words);
    if (extra) line.append(extra);
    if (btn) line.append(Object.assign(document.createElement('a'), { className: 'btn primary', href, textContent: btn }));
  };
  // Gig 3's story, one line a step (Rajesh's words, 19 Nov). No laptop camera: the judge's own phone, if any, is the
  // doormen's; the fan is the phone beside Show Time; the bar pours by hand.
  const STORY = {
    1: 'Longy’s playing The Fickle Pickle tonight. This time the doormen are checking every ticket.',
    2: 'A ticket’s only as good as the door that checks it.',
    3: 'Fans at home watch free, with no ads. Longy pays for the stream before the gig, from his own wallet.',
    4: 'Paid, locked to the NutPub’s key. Nobody in between held it.',
    5: 'You’re a fan at the door of The Fickle Pickle. At the venue, the stream waits for a ticket: fans who’ve paid to be there get the stream on their phones too.',
    6: 'Ticket bought, with the first drink in it. Its door QR changes every 30 seconds, so a screenshot won’t get in.',
    7: 'Let them in. The door saw an authorised ticket and the price paid, never a name.',
    8: 'The fan’s phone now holds the first drink: a real coin, locked to the bar.',
    9: 'Poured. The bar took the coin at the mint with its own key; nobody in between held it.',
    10: 'The night’s over. The fan’s change is still in their browser wallet.',
    11: 'Closing time. Longy’s ticket earnings and tips are locked to his key; the drink money went to the bar.',
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
    start: 'Show time. Nobody pays until they press play.',
    fan: 'You’re a fan at home. The video comes in 10-second pieces.',
    end: 'You paid for the minutes you watched, straight to Frankie’s key.',
    replay: 'The night’s over, but Frankie’s replay runs for 7 days.',
    takings: 'That’s two ways to get paid. Gig 3 gets NUT-heavy: a door that checks a 30-second code, and a first drink that’s a coin on a QR.',
  } : {};
  // The free stream's price and whether it's paid (upfront.js), for steps 1 and 2.
  const freeStream = () => fetch('/api/admin/free-stream', { headers: { 'X-Admin': key } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const pounds = (p) => `£${(p / 100).toFixed(2).replace(/\.00$/, '')}`;
  // Pay, right in the line: it presses Plan gig's own Pay button (setup.js), on the Free to watch card.
  const payBtn = (f) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: `Pay ${pounds(f.due)}` });
    b.onclick = () => { const own = document.getElementById('free-pay'); own?.scrollIntoView({ block: 'center', behavior: 'smooth' }); own?.click(); b.disabled = true; b.textContent = 'Paying…'; };
    return b;
  };
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
  const draw = async () => {
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
    if (pickle) {
      if (page === 'takings') return say(closed ? 11 : 9, closed ? 'Close any Cashu.me tab first. Then flick through ₿ £ $ €, press Move to my own wallet and follow it to Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[11] : '' });
      const show = (await admin('/api/show'))?.show;
      const f = await freeStream();
      if (!show) return;
      // Steps 1 to 4 on Plan gig: the price, exactly £30 (Longy's part; the drink's £5 on top), the door, the payment.
      const priced = Number(show.ticket?.fiat) === 30;
      const doorOn = !!show.door?.on;
      const paid = !(f && !f.covered && f.pence);
      if (!priced || !doorOn || !paid) {
        if (page !== 'setup') return say(1, 'Back on Plan gig: the venue ticket, the door and the free stream first.', 'Back to Plan gig →', '/setup');
        if (!priced) return say(1, 'Type Longy’s part of the venue ticket: exactly £30. The first drink’s £5 goes on top, so fans pay £35.', '', '', { story: STORY[1] });
        if (!doorOn) return say(2, 'Turn on Scan tickets at the door, just below the price.', '', '', { story: STORY[2] });
        return say(3, 'On your phone: scan the DOOR pass with the camera, if you like. Then press Pay.', '', '', { story: STORY[3], extra: payBtn(f) });
      }
      if (page === 'setup') return say(4, 'Then click 2 · Show Time, at the top.', '', '', { story: STORY[4] });
      // Rajesh 18 Nov: the judges press the artist's own button, at the top; no button of the line's own.
      if (closed) return say(10, 'On the fan’s phone: press Move my sats and take them to Cashu.me. Then click 3 · Your takings, at the top.', '', '', { story: STORY[10] });
      const tickets = (await admin('/api/admin/door')) || [];
      if (!tickets.length) return say(5, 'On the fan’s phone, on the right: buy the venue ticket.', '', '', { story: STORY[5] });
      if (!tickets.some((t) => t.checked_at)) return say(6, 'On your phone: scan the fan’s door QR on the right. No phone, Judge? Press Let in by hand.', '', '',
        { story: STORY[6], extra: pressBtn('Let in by hand', '#door-tickets button', /^Let in by hand/, 'Letting in…') });
      if (!on) return say(7, 'Press Start show, the green button below.', '', '', { story: STORY[7] });
      const d = await drinks();
      if (!d.some((x) => x.poured)) return say(8, 'Press Pour by hand: that’s the bar scanning it. Then watch the fan’s phone.', '', '',
        { story: STORY[8], extra: pressBtn('Pour by hand', '#bar-drinks button', /^Pour by hand/, 'Pouring…') });
      // Rajesh 18 Nov: hello in the chat first, so the clip plays a while; the fan's list (this browser) says when it's said.
      // Either chat counts: the fan's phone or the desktop view below (Rajesh 18 Nov).
      // Only tonight's: each list's pass is that fan's pass now, so a hello from an earlier gig on this stage doesn't count.
      const hello = ['', '-home'].some((k) => { try { const t = JSON.parse(localStorage.getItem(`nutpub-todo${k}`) || 'null'); return !!t?.hello && t.pass === localStorage.getItem(`nutpub-pass${k}`); } catch { return false; } });
      return say(9, hello ? 'Now tip Longy 2,100 sats in the fan’s Tip tab. Then press End night, the purple button below.'
        : 'On the fan’s phone, on the right: press play, then say hello in its Chat tab.', '', '', { story: STORY[9] });
    }
    // Rajesh 18 Nov: the judges press the artist's own tabs, at the top, from the first gig on.
    if (page === 'setup') say(1, `This is where ${name} sets the prices. Nothing to change. Then click 2 · Show Time, at the top.`, '', '', { story: TOLD.setup });
    else if (page === 'show') {
      if (closed && replay) say(5, `Back on the fan’s page, press play: one 402 for the whole replay, twice through. Then click 3 · Your takings, at the top.`, '', '', { story: TOLD.replay });
      else if (closed) say(5, 'The night’s over. Click 3 · Your takings, at the top.');
      else if (!on) say(2, 'Press Start show, the green button below.', '', '', { story: TOLD.start });
      else if (!fanDone()) say(3, 'Press Fan’s page ↗, top right, and follow the strip there. Then come back here.', '', '', { story: TOLD.fan });
      else say(4, 'The fan’s list is all ticked: press End night, the purple button below.', '', '', { story: TOLD.end });
    } else if (!closed) say(4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
    else say(replay ? 6 : 5, `${replay ? 'The replay has its own tile. ' : ''}Press Move to Cashu.me, then Finish gig.`, '', '', { story: TOLD.takings });
  };
  await draw();
  // Show Time's line follows its buttons and the fan's tab; the others only change when the page is opened again.
  if (page === 'show' || (pickle && page === 'setup')) { // gig 3's Plan gig: the price, the door and Pay move it on (sessions 35-36)
    setInterval(() => { if (!document.hidden) draw(); }, pickle ? 3000 : 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}

