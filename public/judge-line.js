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
  const say = (n, text, btn, href, { story = '', extra = null } = {}) => {
    if (said === n + story + text) return;
    said = n + story + text;
    const words = Object.assign(document.createElement('span'), { className: 'jl-say' });
    if (story) words.append(Object.assign(document.createElement('i'), { className: 'jl-story', textContent: story }));
    words.append(Object.assign(document.createElement('span'), { textContent: text }));
    line.replaceChildren(Object.assign(document.createElement('b'), { textContent: n ? `Judges · ${n} of 5` : 'Judges' }), words);
    if (extra) line.append(extra);
    if (btn) line.append(Object.assign(document.createElement('a'), { className: 'btn primary', href, textContent: btn }));
  };
  // Gig 3's story, one line a step (Rajesh 17 Nov). No camera anywhere: the phone is optional, the bar pours by hand.
  const STORY = {
    1: 'Longy sets up his gig with a £35 ticket on the door, an offer for the first drink and a free livestream with comments and tips enabled. Scroll down to see what’s filled in.',
    2: 'You’re now the fan with a ticket for his show tonight. Your phone is your ticket and your wallet.',
    3: 'The gig’s filling up. Your phone holds Longy’s offer of a drink: a real coin, locked to the bar, playing as an animated QR.',
    4: 'Poured. The bar took the coin at the mint with its own key. Nobody in between ever held it.',
    5: 'Closing time. Longy’s earnings from ticket sales and tips are locked to his key; the drink is the bar’s.',
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
      if (page === 'takings') return say(5, closed ? 'Move to Cashu.me, then Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[5] : '' });
      if (closed) return say(5, 'The night’s over.', 'On to Your takings →', '/takings', { story: STORY[5] });
      if (!on) return say(2, 'Press Start show, the green button below.', '', '', { story: STORY[2] });
      const d = await drinks();
      if (!d.length) return say(2, 'On your phone: scan this with the camera, then buy the venue ticket. No phone? Press Fan’s page ↗, top right.', '', '', { story: STORY[2], extra: fanQr() });
      if (!d.some((x) => x.poured)) return say(3, 'The bar pours it: press Pour by hand, then watch the phone.', '', '', { story: STORY[3], extra: pourBtn() });
      return say(4, 'On your phone: tip Longy (the stream’s free tonight). Then press End night, the purple button below.', '', '', { story: STORY[4] });
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
