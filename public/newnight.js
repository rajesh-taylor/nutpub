// New night, top right on the night's three pages: every phone back to the door, the chat emptied, tonight's takings
// counted from here. Payments already made stay to collect.
const button = document.getElementById('head-new-night');
if (button) button.onclick = async () => {
  if (!confirm('A new night: every phone back to the door and the chat emptied. Payments already made stay to collect.')) return;
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const r = await fetch('/api/admin/new-night', { method: 'POST', headers: { 'X-Admin': key } });
  if (r.ok) location.reload(); else alert('Not signed in as the host.');
};
