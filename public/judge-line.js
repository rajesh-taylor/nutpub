// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// Gig 3 (Rajesh 17 Nov) runs from Show Time: each step a line of story, then the one thing to do, with the fan's QR (for
// the judge's phone; no phone, Fan's page ↗) and Pour by hand right in the line. No camera on the laptop.
// r: /api/admin/setlist's answer; page: 'setup', 'show' or 'takings'.
export async function judgeLine(r, page) {
  const list = r?.setlist;
  if (!list?.only) return;
  const judge = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/judge`;
  const back = document.querySelector('.head-back');
  if (back) Object.assign(back, { href: judge, textContent: '← The four gigs' });
  if (page === 'takings') document.getElementById('head-fan')?.remove(); // the night's over: nothing left on the fan's page
  else fanBeside();
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
  const steps = pickle ? 7 : 5; // gig 3 (Rajesh 18 Nov): the ticket before Start show, and the fan's sats home, are steps of their own
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
  // Gig 3's story, one line a step (Rajesh 17 Nov; redone 18 Nov). No camera anywhere: the phone is optional, the bar
  // pours by hand. The ticket comes before the show; its drink reaches the phone when the show starts.
  const STORY = {
    1: 'Longy has set up his gig: a £35 ticket that includes a drink from the bar, and a free live stream with comments and tips. Scroll down to see.',
    2: 'You’re now a fan, buying a ticket for his show. Your phone holds your ticket and your browser wallet.',
    3: 'Ticket bought. Your drink is already paid for and locked to the bar. It reaches your phone when the show starts.',
    4: 'Your phone now holds your drink: a real coin, locked to the bar.',
    5: 'Poured. The bar took the coin at the mint with its own key; nobody in between held it.',
    6: 'The night’s over. The fan’s change is still in their browser wallet.',
    7: 'Closing time. Longy’s ticket money and tips are locked to his key; the drink money went to the bar.',
  };
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const drinks = () => fetch('/api/admin/drinks', { headers: { 'X-Admin': key } }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
  const fanQr = () => Object.assign(document.createElement('img'), { className: 'jl-qr', src: '/api/fan-qr.svg', alt: 'A QR code: the fan’s page, for your phone' });
  // Pour by hand, right in the line: it presses the bar strip's own button (barstrip.js), so nothing to scroll to.
  const pourBtn = () => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: 'Pour by hand' });
    b.onclick = () => { [...document.querySelectorAll('#bar-drinks button')].find((x) => /^Pour by hand/.test(x.textContent))?.click(); b.disabled = true; b.textContent = 'Pouring…'; };
    return b;
  };
  const draw = async () => {
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
    if (pickle) {
      if (page === 'setup') return say(1, 'Then click 2 · Show Time, at the top.', '', '', { story: STORY[1] });
      if (page === 'takings') return say(closed ? 7 : 5, closed ? 'Flick through ₿ £ $ €. Then press Move to my own wallet and follow it to Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[7] : '' });
      // Rajesh 18 Nov: the judges press the artist's own button, at the top; no button of the line's own.
      if (closed) return say(6, 'On your phone: press Move my sats and take them to Cashu.me. Then click 3 · Your takings, at the top.', '', '', { story: STORY[6] });
      const d = await drinks();
      if (!d.length) return say(2, 'Scan this with your phone’s camera, then buy the venue ticket from there. No phone? Press Fan’s page ↗, top right.', '', '', { story: STORY[2], extra: fanQr() });
      if (!on) return say(3, 'Press Start show, the green button below.', '', '', { story: STORY[3] });
      if (!d.some((x) => x.poured)) return say(4, 'Press Pour by hand: that’s the bar scanning it. Then watch the phone.', '', '', { story: STORY[4], extra: pourBtn() });
      return say(5, 'Press play on the video if you like. On your phone: Tip tab, tap 2,100 sats. Then press End night, the purple button below.', '', '', { story: STORY[5] });
    }
    if (page === 'setup') say(1, `This is where ${name} sets the prices. Nothing to change.`, 'On to Show Time →', '/show');
    else if (page === 'show') {
      if (closed) say(5, 'The night’s over.', 'On to Your takings →', '/takings');
      else if (!on) say(2, 'Press Start show, the green button below.');
      else if (!fanDone()) say(3, 'Press Fan’s page ↗, top right, and follow the list there. Then come back here.');
      else say(4, 'The fan’s list is all ticked: press End night, the purple button below.');
    } else if (!closed) say(4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
    else say(5, 'Press Move to Cashu.me, then Finish gig. That takes you to the next gig.');
  };
  await draw();
  // Show Time's line follows its buttons and the fan's tab; the others only change when the page is opened again.
  if (page === 'show') {
    setInterval(() => { if (!document.hidden) draw(); }, pickle ? 3000 : 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}

// No phone (Rajesh 18 Nov): on a laptop, Fan's page ↗ opens a phone-sized window at the screen's right edge, beside
// Show Time, so a judge sees the pint pour while pressing Pour by hand, with no tabs to switch. The artist's page moves
// over while it's open, so nothing sits under it. On a phone, or a narrow window, it stays a plain new tab.
function fanBeside() {
  const a = document.getElementById('head-fan');
  if (!a) return;
  const W = 400, GAP = 12;
  let fan = null, watch = null;
  const room = () => {
    const open = fan && !fan.closed;
    const right = (screen.availLeft || 0) + screen.availWidth - W - GAP; // where the fan's window starts
    const over = open ? Math.max(0, window.screenX + window.outerWidth - right) : 0;
    document.body.style.paddingRight = over && window.innerWidth - over > 700 ? `${over}px` : '';
    if (!open) clearInterval(watch);
  };
  a.addEventListener('click', (e) => {
    if (window.innerWidth < 900 || matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    const h = Math.min(860, screen.availHeight - 40);
    const left = (screen.availLeft || 0) + screen.availWidth - W - GAP, top = (screen.availTop || 0) + 20;
    fan = window.open(a.href, 'nutpub-fan', `popup,width=${W},height=${h},left=${left},top=${top}`);
    if (!fan) { window.open(a.href, '_blank'); return; } // a popup blocker: a tab, as before
    fan.focus();
    clearInterval(watch);
    watch = setInterval(room, 1000);
    room();
  });
}
