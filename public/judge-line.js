// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// Gig 3 (Rajesh 17 Nov) runs from Show Time alone: each step a line of story, then the one thing to do, with the fan's
// QR (for the judge's phone) and the bar's till right in the line. No Fan's page tab, no scrolling.
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
  if (pickle && page === 'show') document.getElementById('head-fan')?.remove(); // gig 3: the judge's phone is the fan
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
  // Gig 3's story, one line a step (Rajesh 17 Nov).
  const STORY = {
    1: 'In less than 10 minutes, Longy sets up his gig: a £35 ticket on the door, an offer for the first drink on him and free to watch for fans online.',
    2: 'You’re now the fan with a ticket for his show tonight. Your phone is your ticket and your wallet.',
    3: 'The gig’s filling up. At the bar your phone holds Longy’s offer of a drink. Your laptop in this demo acts as the bar and the QR code acts as a coin.',
    4: 'Poured. The coin went from the fan’s phone to the bar’s till. Nobody in between ever held it, and the hand-over itself needed no server.',
    5: 'Closing time. Longy’s earnings from ticket sales and tips are locked to his key; the drink is the bar’s.',
  };
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const drinks = () => fetch('/api/admin/drinks', { headers: { 'X-Admin': key } }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
  const fanQr = () => Object.assign(document.createElement('img'), { className: 'jl-qr', src: '/api/fan-qr.svg', alt: 'A QR code: the fan’s page, for your phone' });
  const tillBtn = () => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary', textContent: 'Open the till' });
    b.onclick = () => { const till = document.getElementById('till'); line.after(till); document.getElementById('till-open')?.click(); b.hidden = true; };
    return b;
  };
  const draw = async () => {
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
    if (pickle) {
      if (page === 'setup') return say(1, 'Nothing to change.', 'On to Show Time →', '/show', { story: STORY[1] });
      if (page === 'takings') return say(5, closed ? 'Move to Cashu.me, then Finish gig.' : 'The night isn’t over yet: End night is on Show Time.',
        closed ? '' : 'Back to Show Time →', '/show', { story: closed ? STORY[5] : '' });
      if (closed) return say(5, 'The night’s over.', 'On to Your takings →', '/takings', { story: STORY[5] });
      if (!on) return say(2, 'Press Start show, the green button below.', '', '', { story: STORY[2] });
      const d = await drinks();
      if (!d.length) return say(2, 'On your phone: scan this with the camera, then buy the venue ticket.', '', '', { story: STORY[2], extra: fanQr() });
      if (!d.some((x) => x.poured)) {
        if (said.startsWith('3')) return; // the till may be open under the line: leave it be
        return say(3, 'Open the till, then hold your phone’s drink up to this laptop’s camera.', '', '', { story: STORY[3], extra: tillBtn() });
      }
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
