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
  const replay = list.at === 'frankie'; // gig 2 shows the replay (session 34): a step of its own after End night
  const steps = pickle ? 8 : replay ? 6 : 5; // gig 3 (Rajesh 18 Nov): the ticket before Start show, and the fan's sats home, are steps of their own; the free stream's payment too (session 35)
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
  // Session 35: the free stream's payment is step 1's action, and step 2 says it's paid; the rest move down one.
  const STORY = {
    1: 'Longy has set up his gig: a £35 ticket that includes a drink from the bar, and a free live stream with comments and tips. But free to watch isn’t free to run.',
    2: 'Paid from Longy’s own wallet, locked to the NutPub’s key. Nobody in between held it.',
    3: 'You’re now a fan, buying a ticket for his show. Your phone holds your ticket and your browser wallet.',
    4: 'Ticket bought. Your drink is already paid for and locked to the bar. It reaches your phone when the show starts.',
    5: 'Your phone now holds your drink: a real coin, locked to the bar.',
    6: 'Poured. The bar took the coin at the mint with its own key; nobody in between held it.',
    7: 'The night’s over. The fan’s change is still in their browser wallet.',
    8: 'Closing time. Longy’s ticket money and tips are locked to his key; the drink money went to the bar.',
  };
  // The free stream's price and whether it's paid (upfront.js), for steps 1 and 2.
  const freeStream = () => fetch('/api/admin/free-stream', { headers: { 'X-Admin': key } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const pounds = (p) => `£${(p / 100).toFixed(2).replace(/\.00$/, '')}`;
  const hours = (m) => (m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} hour${m === 60 ? '' : 's'}`);
  // Pay, right in the line: it presses Plan gig's own Pay button (setup.js), on the Free to watch card.
  const payBtn = (f) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: `Pay ${pounds(f.due)}` });
    b.onclick = () => { const own = document.getElementById('free-pay'); own?.scrollIntoView({ block: 'center', behavior: 'smooth' }); own?.click(); b.disabled = true; b.textContent = 'Paying…'; };
    return b;
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
      const f = page === 'takings' ? null : await freeStream();
      if (f && !f.covered && f.pence) {
        if (page !== 'setup') return say(1, 'Back on Plan gig: pay for the free stream first.', 'Back to Plan gig →', '/setup');
        return say(1, `Longy pays for it before the gig: up to ${f.viewers} viewers for ${hours(f.minutes + 60)} (his ${hours(f.minutes)}, plus a spare hour), from his own wallet.`, '', '', { story: STORY[1], extra: payBtn(f) });
      }
      if (page === 'setup') return say(2, 'Then click 2 · Show Time, at the top.', '', '', { story: STORY[2] });
      if (page === 'takings') return say(closed ? 8 : 6, closed ? 'Close any Cashu.me tab first. Then flick through ₿ £ $ €, press Move to my own wallet and follow it to Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[8] : '' });
      // Rajesh 18 Nov: the judges press the artist's own button, at the top; no button of the line's own.
      if (closed) return say(7, 'On the fan’s phone: press Move my sats and take them to Cashu.me. Then click 3 · Your takings, at the top.', '', '', { story: STORY[7] });
      const d = await drinks();
      if (!d.length) return say(3, 'On the fan’s phone, on the right: buy the venue ticket. Or use your own phone: scan this.', '', '', { story: STORY[3], extra: fanQr() });
      if (!on) return say(4, 'Press Start show, the green button below.', '', '', { story: STORY[4] });
      if (!d.some((x) => x.poured)) return say(5, 'Press Pour by hand: that’s the bar scanning it. Then watch the phone.', '', '', { story: STORY[5], extra: pourBtn() });
      // Rajesh 18 Nov: hello in the chat first, so the clip plays a while; the fan's list (this browser) says when it's said.
      // Either chat counts: the fan's phone or the desktop view below (Rajesh 18 Nov).
      // Only tonight's: each list's pass is that fan's pass now, so a hello from an earlier gig on this stage doesn't count.
      const hello = ['', '-home'].some((k) => { try { const t = JSON.parse(localStorage.getItem(`nutpub-todo${k}`) || 'null'); return !!t?.hello && t.pass === localStorage.getItem(`nutpub-pass${k}`); } catch { return false; } });
      return say(6, hello ? 'Now tip Longy 2,100 sats in the fan’s Tip tab. Then press End night, the purple button below.'
        : 'On the fan’s phone, on the right: press play, then say hello in its Chat tab.', '', '', { story: STORY[6] });
    }
    // Rajesh 18 Nov: the judges press the artist's own tabs, at the top, from the first gig on.
    if (page === 'setup') say(1, `This is where ${name} sets the prices. Nothing to change. Then click 2 · Show Time, at the top.`);
    else if (page === 'show') {
      if (closed && replay) say(5, `The night’s over, but ${name}’s replay runs for 7 days. Back on the fan’s page, press play: one 402 for the whole replay, twice through. Then click 3 · Your takings, at the top.`);
      else if (closed) say(5, 'The night’s over. Click 3 · Your takings, at the top.');
      else if (!on) say(2, 'Press Start show, the green button below.');
      else if (!fanDone()) say(3, 'Press Fan’s page ↗, top right, and follow the list there. Then come back here.');
      else say(4, 'The fan’s list is all ticked: press End night, the purple button below.');
    } else if (!closed) say(4, 'The night isn’t over yet: End night is on Show Time.', 'Back to Show Time →', '/show');
    else say(replay ? 6 : 5, `${replay ? 'The replay has its own tile. ' : ''}Press Move to Cashu.me, then Finish gig. That takes you to the next gig.`);
  };
  await draw();
  // Show Time's line follows its buttons and the fan's tab; the others only change when the page is opened again.
  if (page === 'show' || (pickle && page === 'setup')) { // gig 3's Plan gig: step 1's Pay moves it on (session 35)
    setInterval(() => { if (!document.hidden) draw(); }, pickle ? 3000 : 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}

