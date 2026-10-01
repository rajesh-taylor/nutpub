// Top bar on every page: 🥜 home, EN/DE pill, and (on the presenter's devices only) ‹ › through the demo steps.
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

  const bar = document.createElement('nav');
  bar.className = 'topnav';
  const here = STEPS.findIndex(([p]) => p === location.pathname);
  const link = (i) => {
    const [path, , admin] = STEPS[(i + STEPS.length) % STEPS.length];
    return admin && key ? `${path}#k=${key}` : path;
  };
  const name = (i) => STEPS[(i + STEPS.length) % STEPS.length][1];

  bar.innerHTML = `
    <a class="home" href="/" aria-label="NutPub home">🥜</a>
    ${key && here >= 0 ? `
      <a class="step" href="${link(here - 1)}" aria-label="Back to ${name(here - 1)}">‹</a>
      <span class="where">${here + 1}/${STEPS.length} ${name(here)}</span>
      <a class="step" href="${link(here + 1)}" aria-label="On to ${name(here + 1)}">›</a>` : '<span class="where"></span>'}
    <button class="pill" type="button" aria-label="Language">
      <span data-l="en">EN</span><span data-l="de">DE</span>
    </button>`;
  bar.querySelector('.pill').onclick = () => {
    const next = document.documentElement.dataset.lang === 'en' ? 'de' : 'en';
    document.documentElement.dataset.lang = next;
    store('nutpub-lang', next);
  };
  document.body.prepend(bar);
})();
