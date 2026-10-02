// The photos behind each screen, as Rajesh picked them on /pick.html (data/heroes.json on the server):
// the door, and a slow crossfade behind Now playing (lights up ends on the first of those).
export function heroes(h = {}) {
  const door = h.door || [];
  const live = h.live || [];
  const box = document.querySelector('.backdrop');
  if (!box) return;
  const root = document.documentElement.style;
  if (live[0]) root.setProperty('--lights', `url(/img/${live[0]}.jpg)`);
  if (h.lastorders) root.setProperty('--lastorders', `url(/img/${h.lastorders}.jpg)`);
  const sets = [['door', door], ['live', live]].filter(([, files]) => files.length);
  for (const [name, files] of sets) {
    document.body.classList.add(`heroes-${name}`);
    const slides = files.map((f) => {
      const d = document.createElement('div');
      d.className = `slide ${name}`;
      d.style.backgroundImage = `url(/img/${f}.jpg)`;
      box.prepend(d);
      return d;
    });
    let k = 0;
    slides[0].classList.add('on');
    if (slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) continue;
    setInterval(() => {
      slides[k].classList.remove('on');
      k = (k + 1) % slides.length;
      slides[k].classList.add('on');
    }, 7000);
  }
}
