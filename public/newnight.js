// Set up my next gig, on Setup: shown once this gig is over. Clears its tickets, chat and stage so the page can sell
// again. Payments stay to collect.
const button = document.getElementById('next-gig-go');
if (button) button.onclick = async () => {
  if (!confirm('Set up your next gig? This gig\'s tickets and chat are cleared and the page opens for sale again. Money not collected yet stays yours to collect.')) return;
  let key = '';
  try { key = localStorage.getItem('nutpub-admin') || ''; } catch {}
  const r = await fetch('/api/admin/new-night', { method: 'POST', headers: { 'X-Admin': key } });
  if (r.ok) location.reload(); else alert((await r.json().catch(() => ({}))).detail || 'Not signed in as the host.');
};
