// Top bar on every page: THE NUTPUB wordmark (home) in the middle, 🇬🇧/🇩🇪 on the right, and on the
// presenter's devices only, ‹ › through the demo steps on the left.
(() => {
  const STEPS = [
    ['/stage.html', 'Stage', true],
    ['/', 'Door', false],
    ['/rupert.html', 'Rupert', false],
    ['/bar.html', 'Bar', false],
    ['/fund.html', 'Float', true],
  ];
  const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };

  // A page opened with #k=… is the presenter's device: remember the key so the arrows can carry it.
  const k = new URLSearchParams(location.hash.slice(1)).get('k');
  if (k) store('nutpub-k', k);
  const key = store('nutpub-k');

  const lang = store('nutpub-lang') || 'en';
  document.documentElement.dataset.lang = lang;
  document.documentElement.lang = lang;

  const bar = document.createElement('nav');
  bar.className = 'topnav';
  const here = STEPS.findIndex(([p]) => p === location.pathname);
  const link = (i) => {
    const [path, , admin] = STEPS[(i + STEPS.length) % STEPS.length];
    return admin && key ? `${path}#k=${key}` : path;
  };
  const name = (i) => STEPS[(i + STEPS.length) % STEPS.length][1];

  bar.innerHTML = `
    <div class="left">${key && here >= 0 ? `
      <a class="step" href="${link(here - 1)}" aria-label="Back to ${name(here - 1)}">‹</a>
      <a class="step" href="${link(here + 1)}" aria-label="On to ${name(here + 1)}">›</a>` : ''}</div>
    <a class="wordmark" href="/" aria-label="The NutPub, home">THE NUTPUB</a>
    <div class="right">
      <button class="flag" type="button" data-l="en" aria-label="English">🇬🇧</button>
      <button class="flag" type="button" data-l="de" aria-label="Deutsch">🇩🇪</button>
    </div>`;
  bar.querySelectorAll('.flag').forEach((b) => (b.onclick = () => {
    document.documentElement.dataset.lang = b.dataset.l;
    document.documentElement.lang = b.dataset.l;
    store('nutpub-lang', b.dataset.l);
    dispatchEvent(new Event('nutpub-lang'));
  }));
  document.body.prepend(bar);

  // Tabs Claude opens for testing or design say so across the top (?tab=test or ?tab=design): close them later.
  const tag = new URLSearchParams(location.search).get('tab');
  if (tag) {
    const strip = document.createElement('div');
    strip.className = 'tabtag';
    strip.textContent = tag === 'design' ? 'DESIGN WORK ONLY · close this tab later' : 'TEST · close this tab later';
    document.body.prepend(strip);
  }
})();
