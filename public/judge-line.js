// The judge's line (Rajesh 15 Nov): on a judge's stage (a gig card on /judge) each of the artist's three pages says, in
// one line under its header, the one next thing to do. It replaces the stage page's list of steps: the poster's button
// opens Plan gig, and the lines lead through Show Time, the fan's page and Takings. Never on an artist's own stage.
// r: /api/admin/setlist's answer; page: 'setup', 'show' or 'takings'.
export async function judgeLine(r, page) {
  const list = r?.setlist;
  if (!list?.only) return;
  const judge = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/judge`;
  const back = document.querySelector('.head-back');
  if (back) Object.assign(back, { href: judge, textContent: '← The three gigs' });
  if (page === 'takings') document.getElementById('head-fan')?.remove(); // the night's over: nothing left on the fan's page
  const name = { longy: 'Longy', frankie: 'Frankie', yours: 'Frankie' }[list.at] || 'the artist';
  const line = Object.assign(document.createElement('p'), { className: 'judge-line' });
  line.setAttribute('role', 'status');
  document.querySelector('header').after(line);
  // The fan's list, all ticked: the fan's page keeps it in this browser (viewer.js, the to-do box).
  const fanDone = () => ['nutpub-todo', 'nutpub-todo-home'].some((k) => { try { return !!JSON.parse(localStorage.getItem(k) || 'null')?.all; } catch { return false; } });
  let said = '';
  const say = (n, text, btn, href) => {
    if (said === n + text) return;
    said = n + text;
    line.replaceChildren(Object.assign(document.createElement('b'), { textContent: n ? `Judges · ${n} of 5` : 'Judges' }), Object.assign(document.createElement('span'), { textContent: text }));
    if (btn) line.append(Object.assign(document.createElement('a'), { className: 'btn primary', href, textContent: btn }));
  };
  const draw = async () => {
    const s = await fetch('/api/stage').then((x) => x.json()).catch(() => null);
    if (!s) return;
    const closed = s.stage === 'closed';
    const on = s.stage === 'on';
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
    setInterval(() => { if (!document.hidden) draw(); }, 5000);
    addEventListener('storage', draw);
    addEventListener('focus', draw);
    document.addEventListener('click', () => setTimeout(draw, 800));
  }
}
