// New night, top right on the night's three pages: every phone back to the door, the chat emptied, tonight's takings
// counted from here. Payments already made stay to collect.
const button = document.getElementById('head-new-night');
if (button) button.onclick = async () => {
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const sold = await fetch('/api/admin/sold', { headers: { 'X-Admin': key } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const n = (sold.room || 0) + (sold.home || 0);
  if (n) { // the one thing here that can't be undone: tell them, and make them mean it
    const word = prompt(`${n} ticket${n === 1 ? ' has' : 's have'} been sold. A new night cancels ${n === 1 ? 'it' : 'them'}: ${n === 1 ? 'that buyer' : 'those buyers'} can't get in any more, and the money stays yours to collect.\n\nOnly do this when this gig is over. To go ahead, type NEW NIGHT.`);
    if (word?.trim().toUpperCase() !== 'NEW NIGHT') return;
  } else if (!confirm('A new night: every phone back to the door and the chat emptied. Payments already made stay to collect.')) return;
  const r = await fetch('/api/admin/new-night', { method: 'POST', headers: { 'X-Admin': key } });
  if (r.ok) location.reload(); else alert('Not signed in as the host.');
};
