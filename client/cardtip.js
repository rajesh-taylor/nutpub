// Tip by card (session 62): on a gig whose artist connected Stripe in Cellar. The fan picks an amount and pays in
// Stripe's own card box (card, Apple Pay or Google Pay; no email). The money goes straight to the artist's Stripe
// account; the NutPub asks Stripe itself whether it was paid before saying thank you, and only then puts the tip in the
// live chat, tagged with its pounds (session 62b). Two places open the box: the tip row's By card, and the comment
// box's £ card (with the fan's words).
const pounds = (p) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;
const el = (tag, props = {}, ...kids) => { const x = Object.assign(document.createElement(tag), props); x.append(...kids); return x; };
const post = (path, data, headers = {}) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) })
  .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }));
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const okPence = (p) => Number.isInteger(p) && p >= 100 && p <= 10000; // £1 to £100 (Stripe's least in pounds is 30p)
const toPence = (v) => (String(v).trim() ? Math.round(Number(v) * 100) : 0);
const LOOK = { theme: 'night', variables: { colorPrimary: '#d9953a', colorBackground: '#0b1426', colorText: '#efe3c8', borderRadius: '6px' } };

let stripeJs = null; // Stripe's own script, from Stripe (it must be): loaded the first time a fan opens a box
const loadStripe = () => stripeJs || (stripeJs = new Promise((ok, no) => {
  const s = el('script', { src: 'https://js.stripe.com/v3/', onload: () => ok(window.Stripe), onerror: () => { stripeJs = null; no(new Error('Stripe didn’t load.')); } });
  document.head.append(s);
}));

// Stripe's fields for one box, and paying with them: Stripe checks its fields, the NutPub makes the payment on the
// artist's account (and checks the words), Stripe takes the card, then the NutPub asks Stripe whether it was paid.
function stripeFields({ pk, account }) {
  let stripe = null, elements = null;
  const field = el('div', { className: 'card-field' });
  const ready = loadStripe().then((Stripe) => {
    stripe = Stripe(pk, { stripeAccount: account });
    elements = stripe.elements({ mode: 'payment', amount: 500, currency: 'gbp', appearance: LOOK });
    elements.create('payment', { layout: 'tabs' }).mount(field);
  });
  return {
    field, ready,
    amount: (p) => { if (okPence(p)) elements?.update({ amount: p }); },
    clear: () => elements?.getElement('payment')?.clear(),
    async pay(pence, text, headers) {
      if (!elements) return { error: 'Stripe’s card box isn’t open yet.' };
      elements.update({ amount: pence });
      const { error: wrong } = await elements.submit();
      if (wrong) return { error: wrong.message };
      const made = await post('/api/card-tip', { pence, text }, headers).catch(() => ({}));
      // A word on the list or a link: the server's own words (door.js, wordlist.js); nothing is charged.
      if (!made.secret) return { error: made.detail || (/ /.test(made.error || '') ? made.error : 'That didn’t go through. Try again in a minute.'), refused: made.error };
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, clientSecret: made.secret, redirect: 'if_required',
        confirmParams: { return_url: location.href } });
      if (error) return { error: error.message };
      for (let i = 0; i < 4; i++) { // a card says paid at once; asked a few times in case Stripe is a moment behind
        const seen = await post('/api/card-tip/check', { id: paymentIntent.id }).catch(() => ({}));
        if (seen.status === 'succeeded') return { pence: seen.pence };
        await wait(1500);
      }
      return { error: 'Stripe is still taking it. If your card was charged, the artist has it.' };
    },
  };
}

// The thank-you is a moment, not a footnote: it takes the box's place until the fan moves on.
function thanks(box, lines, buttons) {
  for (const x of box.children) x.hidden = true;
  const t = el('div', { className: 'card-thanks', role: 'status' }, el('b', { textContent: 'Thank you!' }),
    ...lines.map((textContent) => el('span', { textContent })), el('span', { className: 'card-thanks-btns' }, ...buttons));
  box.append(t);
  buttons[0]?.focus({ preventScroll: true });
  t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return t;
}
const button = (textContent, className = 'btn') => el('button', { type: 'button', className, textContent });

// The tip row splits in two (Rajesh 25 Nov): sats on the left, a hairline, then By card: £5, £10 or Other. Each opens
// Stripe's card box under the row with that amount ready. With no Stripe connected none of this runs.
export function cardTips({ row, button: oldButton, also = [], pk, account, artist, headers = () => ({}), paid, chat }) {
  const who = artist || 'the artist';
  let pence = 500, box = null, card = null;

  // The row: the sats buttons keep their place, now under "In sats"; the old card button goes.
  oldButton.hidden = true;
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
  const note = el('p', { className: 'card-note', role: 'status' });
  const badge = el('img', { src: '/badges/powered-by-stripe.svg', alt: 'Powered by Stripe', height: 22 });

  const show = (p) => {
    pence = p;
    const ok = okPence(p);
    head.textContent = ok ? `${pounds(p)} to ${who}` : `How much to ${who}?`;
    pay.textContent = ok ? `Tip ${pounds(p)}` : 'Tip';
    pay.disabled = !ok;
    card?.amount(p);
  };
  const pick = (key) => {
    for (const b of amounts.children) b.setAttribute('aria-pressed', String(b.dataset.k === key));
    otherRow.hidden = key !== 'other';
    show(key === 'other' ? toPence(other.value) : Number(key));
    open().then(() => { if (key === 'other') other.focus({ preventScroll: true }); });
  };
  for (const [key, label] of [['500', '£5'], ['1000', '£10'], ['other', 'Other']]) {
    const b = button(label, 'btn quiet');
    b.onclick = () => pick(key);
    b.dataset.k = key;
    amounts.append(b);
  }
  other.oninput = () => show(toPence(other.value));

  async function open() {
    if (box) { box.querySelector('.card-thanks')?.remove(); for (const x of box.children) if (x !== otherRow) x.hidden = false; box.hidden = false; }
    else {
      card = stripeFields({ pk, account });
      box = el('div', { className: 'card-tip-box' }, head, otherRow, card.field, el('p', { className: 'card-pay' }, pay, badge), note);
      split.after(box);
      note.textContent = 'Opening Stripe’s card box…';
      card.ready.then(() => { note.textContent = ''; card.amount(pence); })
        .catch(() => { note.textContent = 'Stripe’s card box didn’t open. Try again in a minute.'; box.remove(); box = null; });
    }
    await card.ready.catch(() => {});
    box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const close = () => { box.hidden = true; for (const b of amounts.children) b.setAttribute('aria-pressed', 'false'); };

  pay.onclick = async () => {
    if (pay.disabled) return;
    pay.disabled = true; note.textContent = 'Paying…';
    const out = await card.pay(pence, '', headers());
    pay.disabled = false;
    if (!out.pence) { note.textContent = out.error; return; }
    // In the chat now, with its pounds (session 62b); one button takes them to the comment box to say something.
    paid?.(out.pence);
    card.clear();
    other.value = ''; note.textContent = '';
    const say = button('Say something in the chat');
    const done = button('Done', 'btn quiet');
    const t = thanks(box, [`${pounds(out.pence)} to ${who} by card. Stripe sends it straight to them.`], [say, done]);
    done.onclick = () => { t.remove(); close(); };
    say.onclick = () => { t.remove(); close(); chat?.(); };
  };

  for (const b of also) { b.classList.add('on'); b.textContent = 'Tip by card'; b.removeAttribute('title'); b.onclick = () => { split.scrollIntoView({ block: 'center', behavior: 'smooth' }); pick('500'); }; }
}

// Words by card (session 62b, as drawn in "Below the Player"): the comment box gets a ₿ | £ card switch. £ card: the
// amount is pounds, £1 to £100, and ➤ opens Stripe's card box just above the comment box with the amount and the words,
// both read from the comment box as the fan changes them. Nothing goes in the chat until Stripe says paid. ₿: the box
// pays sats as before, and pounds shown for sats say so ("£ in sats"). Full screen keeps sats: the strip has no room.
// Gives back { on, send, redraw } for the page's own comment box code (viewer.js).
export function cardWords({ form, text, amount, unit, pk, account, artist, headers = () => ({}), fiat = () => null, satsLook, paid, sent }) {
  const who = artist || 'the artist';
  const holder = amount.closest('.say-sats');
  let mode = 'sats', box = null, card = null;

  const seg = el('span', { className: 'say-money', role: 'group' });
  seg.setAttribute('aria-label', 'Pay with');
  const btc = button('₿', 'say-m');
  const gbp = button('£ card', 'say-m');
  btc.setAttribute('aria-label', 'Pay in sats');
  gbp.setAttribute('aria-label', 'Pay in pounds by card');
  seg.append(btc, gbp);
  holder.prepend(seg);
  holder.classList.add('with-card');
  form.classList.add('with-card');

  const head = el('span', { className: 'tip-k' });
  const quote = el('span', { className: 'card-words-quote' });
  const shut = button('Not now', 'linkish card-shut');
  const pay = el('button', { type: 'button', className: 'btn primary' });
  const note = el('p', { className: 'card-note', role: 'status' });
  const badge = el('img', { src: '/badges/powered-by-stripe.svg', alt: 'Powered by Stripe', height: 22 });
  const pence = () => toPence(amount.value);

  // The box follows the comment box: its amount and its words, as typed.
  const fill = () => {
    if (!box) return;
    const p = pence(), words = text.value.trim(), ok = okPence(p);
    head.textContent = ok ? `${pounds(p)} to ${who}${words ? ', with your words' : ''}` : `How much to ${who}? £1 to £100`;
    quote.textContent = words ? `“${words}”` : '';
    quote.hidden = !words;
    pay.textContent = ok ? `Tip ${pounds(p)}` : 'Tip';
    pay.disabled = !ok;
    if (ok) card?.amount(p);
  };
  text.addEventListener('input', fill);
  amount.addEventListener('input', fill);

  function redraw() {
    if (mode === 'card' && document.body.classList.contains('full')) mode = 'sats';
    btc.setAttribute('aria-pressed', String(mode === 'sats'));
    gbp.setAttribute('aria-pressed', String(mode === 'card'));
    holder.classList.toggle('paycard', mode === 'card'); // not 'card': app.css's boxes
    if (mode === 'card') {
      unit.textContent = '£'; unit.disabled = true;
      unit.setAttribute('aria-label', 'Pounds, by card');
      amount.removeAttribute('max');
      Object.assign(amount, { min: 1, max: 100, step: 0.01, inputMode: 'decimal', placeholder: '1–100' });
      amount.setAttribute('aria-label', 'A tip by card, £1 to £100');
    } else {
      const f = fiat(); // £, $ or € when the page shows sats in money: then the field says it pays sats
      if (f) { amount.placeholder = 'in sats'; amount.setAttribute('aria-label', `A tip with it, in sats, typed in ${f}`); }
      if (box) box.hidden = true;
    }
  }
  const choose = (m) => (e) => {
    e.preventDefault(); // inside the tip field's label
    if (m === mode) return;
    mode = m;
    amount.value = '';
    if (m === 'sats') satsLook?.(); // the page puts its own sats look back (₿ or £, its placeholder)
    redraw();
    amount.focus();
  };
  btc.onclick = choose('sats');
  gbp.onclick = choose('card');
  new MutationObserver(() => { if (mode === 'card' && document.body.classList.contains('full')) choose('sats')({ preventDefault() {} }); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });

  async function open() {
    if (!box) {
      card = stripeFields({ pk, account });
      box = el('div', { className: 'card-tip-box card-words' }, el('span', { className: 'card-words-top' }, head, shut), quote, card.field,
        el('p', { className: 'card-pay' }, pay, badge), note);
      form.before(box);
      note.textContent = 'Opening Stripe’s card box…';
      card.ready.then(() => { note.textContent = ''; fill(); })
        .catch(() => { note.textContent = 'Stripe’s card box didn’t open. Try again in a minute.'; box.remove(); box = null; });
    } else { box.querySelector('.card-thanks')?.remove(); for (const x of box.children) x.hidden = false; box.hidden = false; note.textContent = ''; }
    fill();
    await card.ready.catch(() => {});
    box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  shut.onclick = () => { box.hidden = true; amount.focus(); };

  // ➤ in card mode: the amount first, then Stripe's box. The words stay in the comment box until Stripe says paid.
  function send() {
    if (!okPence(pence())) {
      if (box) box.hidden = true;
      amount.focus();
      return 'A card tip is £1 to £100.';
    }
    open().then(() => pay.focus({ preventScroll: true }));
    return null;
  }
  pay.onclick = async () => {
    const p = pence();
    if (pay.disabled || !okPence(p)) return;
    pay.disabled = true; note.textContent = 'Paying…';
    const out = await card.pay(p, text.value.trim(), headers());
    pay.disabled = false;
    if (!out.pence) { note.textContent = out.error; if (out.refused) text.focus(); return; }
    paid?.(out.pence);
    card.clear();
    const words = !!text.value.trim();
    sent?.(); // the page clears the words and the chat catches up to show them
    text.value = ''; amount.value = '';
    const done = button('Done', 'btn quiet');
    const t = thanks(box, [`${pounds(out.pence)} to ${who} by card. ${words ? 'Your words are in the chat.' : 'It’s in the chat.'}`], [done]);
    done.onclick = () => { t.remove(); box.hidden = true; text.focus({ preventScroll: true }); };
  };

  redraw();
  return { on: () => mode === 'card', send, redraw };
}
