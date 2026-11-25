// Tip by card (session 62): on a gig whose artist connected Stripe in Cellar. The fan picks an amount and pays in
// Stripe's own card box (card, Apple Pay or Google Pay; no email). The money goes straight to the artist's Stripe
// account; the NutPub asks Stripe itself whether it was paid before saying thank you.
const pounds = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;
const el = (tag, props = {}, ...kids) => { const x = Object.assign(document.createElement(tag), props); x.append(...kids); return x; };
const post = (path, data) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }));

let stripeJs = null; // Stripe's own script, from Stripe (it must be): loaded the first time a fan opens the box
const loadStripe = () => stripeJs || (stripeJs = new Promise((ok, no) => {
  const s = el('script', { src: 'https://js.stripe.com/v3/', onload: () => ok(window.Stripe), onerror: () => { stripeJs = null; no(new Error('Stripe didn’t load.')); } });
  document.head.append(s);
}));

// The tip row splits in two (Rajesh 25 Nov): sats on the left, a hairline, then By card: £5, £10 or Other. Each opens
// Stripe's card box under the row with that amount ready. With no Stripe connected none of this runs.
export function cardTips({ row, button, also = [], pk, account, artist, paid, chat }) {
  const who = artist || 'the artist';
  let pence = 500, box = null, stripe = null, elements = null, ready = null;

  // The row: the sats buttons keep their place, now under "In sats"; the old card button goes.
  button.hidden = true;
  const amounts = el('span', { className: 'card-amounts' });
  const split = el('div', { className: 'tip-split' });
  row.before(split);
  split.append(el('div', { className: 'tip-side' }, el('small', { className: 'tip-k', textContent: 'In sats' }), row),
    el('div', { className: 'tip-side card-side' }, el('small', { className: 'tip-k', textContent: 'By card' }), amounts));

  // The row's hint was about the one custom amount; now there are two, so it says which.
  const hint = split.parentElement.querySelector('.hint');
  if (hint) hint.textContent = 'Tip custom amount: any amount of sats, from the comment box, with words or without.';
  const head = el('span', { className: 'tip-k' });
  const other = el('input', { type: 'number', min: 1, max: 100, step: 1, inputMode: 'numeric', placeholder: '1 to 100', id: 'card-other', autocomplete: 'off' });
  const otherRow = el('label', { className: 'card-other' }, el('span', { textContent: '£' }), other);
  const pay = el('button', { type: 'button', className: 'btn primary' });
  const field = el('div', { className: 'card-field' });
  const note = el('p', { className: 'card-note', role: 'status' });
  const badge = el('img', { src: '/badges/powered-by-stripe.svg', alt: 'Powered by Stripe', height: 22 });

  const show = (p) => {
    pence = p;
    const ok = Number.isInteger(p) && p >= 100 && p <= 10000;
    head.textContent = ok ? `${pounds(p)} to ${who}` : `How much to ${who}?`;
    pay.textContent = ok ? `Tip ${pounds(p)}` : 'Tip';
    pay.disabled = !ok;
    if (ok) elements?.update({ amount: p });
  };
  const pick = (key) => {
    for (const b of amounts.children) b.setAttribute('aria-pressed', String(b.dataset.k === key));
    otherRow.hidden = key !== 'other';
    show(key === 'other' ? Math.round(Number(other.value) * 100) : Number(key));
    open().then(() => { if (key === 'other') other.focus({ preventScroll: true }); });
  };
  for (const [key, label] of [['500', '£5'], ['1000', '£10'], ['other', 'Other']]) {
    const b = el('button', { type: 'button', className: 'btn quiet', textContent: label, onclick: () => pick(key) });
    b.dataset.k = key;
    amounts.append(b);
  }
  other.oninput = () => show(Math.round(Number(other.value) * 100));

  async function open() {
    if (box) { box.querySelector('.card-thanks')?.remove(); for (const x of box.children) if (x !== otherRow) x.hidden = false; box.hidden = false; }
    else {
      box = el('div', { className: 'card-tip-box' }, head, otherRow, field, el('p', { className: 'card-pay' }, pay, badge), note);
      split.after(box);
      note.textContent = 'Opening Stripe’s card box…';
      ready = loadStripe().then((Stripe) => {
        stripe = Stripe(pk, { stripeAccount: account });
        elements = stripe.elements({ mode: 'payment', amount: pence >= 100 ? pence : 500, currency: 'gbp', appearance: {
          theme: 'night', variables: { colorPrimary: '#d9953a', colorBackground: '#0b1426', colorText: '#efe3c8', borderRadius: '6px' },
        } });
        elements.create('payment', { layout: 'tabs' }).mount(field);
        note.textContent = '';
      }).catch(() => { note.textContent = 'Stripe’s card box didn’t open. Try again in a minute.'; box.remove(); box = null; });
    }
    await ready;
    box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const close = () => { box.hidden = true; for (const b of amounts.children) b.setAttribute('aria-pressed', 'false'); };

  pay.onclick = async () => {
    if (!elements || pay.disabled) return;
    pay.disabled = true; note.textContent = 'Paying…';
    const fail = (m) => { pay.disabled = false; note.textContent = m; };
    const { error: wrong } = await elements.submit(); // Stripe checks the card box first
    if (wrong) return fail(wrong.message);
    const made = await post('/api/card-tip', { pence }).catch(() => ({}));
    if (!made.secret) return fail(made.error || 'That didn’t go through. Try again in a minute.');
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, clientSecret: made.secret, redirect: 'if_required',
      confirmParams: { return_url: location.href } });
    if (error) return fail(error.message);
    const seen = await post('/api/card-tip/check', { id: paymentIntent.id }).catch(() => ({}));
    if (seen.status !== 'succeeded') return fail('Stripe is still taking it. If your card was charged, the artist has it.');
    // The thank-you is a moment, not a footnote: it takes the box's place until the fan moves on. The chat box is sats
    // only (a card needs its own boxes), so one button takes them there to say something with it, for free.
    paid?.(seen.pence);
    elements.getElement('payment')?.clear();
    other.value = '';
    pay.disabled = false; note.textContent = '';
    for (const x of box.children) x.hidden = true;
    const say = el('button', { type: 'button', className: 'btn', textContent: 'Say something in the chat' });
    const done = el('button', { type: 'button', className: 'btn quiet', textContent: 'Done' });
    const thanks = el('div', { className: 'card-thanks', role: 'status' },
      el('b', { textContent: 'Thank you!' }),
      el('span', { textContent: `${pounds(seen.pence)} to ${who} by card. Stripe sends it straight to them.` }),
      el('span', { className: 'card-thanks-btns' }, say, done));
    box.append(thanks);
    done.onclick = () => { thanks.remove(); close(); };
    say.onclick = () => { thanks.remove(); close(); chat?.(); };
    say.focus({ preventScroll: true });
    thanks.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  for (const b of also) { b.classList.add('on'); b.textContent = 'Tip by card'; b.removeAttribute('title'); b.onclick = () => { split.scrollIntoView({ block: 'center', behavior: 'smooth' }); pick('500'); }; }
}
