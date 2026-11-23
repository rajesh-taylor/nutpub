// Session 56: the NutPub's own sheet, in place of the browser's confirm, prompt and alert boxes (they looked like the
// browser's, not the pub's, and Safari and Chrome drew them differently). One sheet over the page: a Bebas title, a
// line or two, an optional field or link, and the buttons: amber for the next press only (the quiet look).
//   await ask({ title, text, yes, no })              → true / false
//   await ask({ title, text, yes, no, field: {…} })  → the field's text / null
//   await ask({ title, text, link })                 → a link to copy, with Copy; resolves when closed
//   await tell(title, text)                          → one button, OK
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export function ask({ title, text = '', yes = 'OK', no = 'Not now', field = null, link = '' }) {
  return new Promise((done) => {
    const sheet = el('dialog', { className: 'ask' });
    sheet.setAttribute('aria-labelledby', 'ask-title');
    const card = el('div', { className: 'ask-card' }); // the dialog itself is only the frame: a tap on it is outside the card
    sheet.append(card);
    card.append(el('h2', { id: 'ask-title', textContent: title }));
    for (const para of String(text).split('\n\n').filter(Boolean)) card.append(el('p', { textContent: para }));
    let input = null;
    if (field || link) {
      input = el('input', { className: 'field', type: 'text', autocomplete: 'off', value: link || field.value || '', maxLength: field?.maxLength || 2000, placeholder: field?.placeholder || '', readOnly: !!link });
      input.setAttribute('aria-label', field?.label || title);
      card.append(input);
    }
    const yesBtn = el('button', { type: 'button', className: 'btn primary', textContent: link ? 'Copy' : yes });
    const row = el('div', { className: 'ask-buttons' }, yesBtn);
    let noBtn = null;
    if (no || link) { noBtn = el('button', { type: 'button', className: 'btn quiet', textContent: link ? 'Close' : no }); row.append(noBtn); }
    card.append(row);
    let answer = field ? null : false;
    const close = () => sheet.close();
    yesBtn.onclick = async () => {
      if (link) {
        try { await navigator.clipboard.writeText(link); yesBtn.textContent = '✓ Copied'; } catch { input.select(); }
        return;
      }
      answer = field ? input.value : true;
      close();
    };
    if (noBtn) noBtn.onclick = close;
    if (field) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); yesBtn.click(); } });
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); }); // a tap outside the card: as Not now
    sheet.addEventListener('close', () => { sheet.remove(); done(answer); }); // Esc too
    document.body.append(sheet);
    sheet.showModal();
    if (input) { input.focus(); input.select(); } else (noBtn || yesBtn).focus(); // Enter never says yes by accident
  });
}

export const tell = (title, text = '') => ask({ title, text, yes: 'OK', no: null });
