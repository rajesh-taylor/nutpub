// Google Wallet: the save link is a JWT our signer's key signs (RS256), holding the gig's class and the ticket's
// object. Checked with Node's own crypto against the test-only stand-in key in test/fixtures (never a real key).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';

const keyPem = readFileSync(new URL('./fixtures/pass-test-key.pem', import.meta.url), 'utf8');
const code = 'b'.repeat(24);
const show = { artist: 'Longy', venue: "Peggy Sue's Music Bar, 1 High Street, Bath", date: '2026-07-04', streams: '19:30', page: 'longy', description: 'Doors at 7' };

test('the Google Wallet link: signed by our key, no QR (a reminder), the venue split into name and address', async () => {
  const { gwalletCard, saveLink } = await import('../server/gwallet.js');
  const card = await gwalletCard(show, code, 'https://x.test', '3388000000000000000');
  const link = await saveLink(card, { email: 'signer@x.iam.gserviceaccount.com', keyPem, site: 'https://x.test' });
  assert.ok(link.startsWith('https://pay.google.com/gp/v/save/'));
  const [head, body, sig] = link.slice('https://pay.google.com/gp/v/save/'.length).split('.');
  const ok = verify('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey(keyPem), Buffer.from(sig, 'base64url'));
  assert.ok(ok, 'the signature checks with the key');
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  assert.equal(JSON.parse(Buffer.from(head, 'base64url')).alg, 'RS256');
  assert.equal(claims.typ, 'savetowallet');
  assert.deepEqual(claims.origins, ['https://x.test']);
  const [cls] = claims.payload.eventTicketClasses;
  const [obj] = claims.payload.eventTicketObjects;
  assert.match(cls.id, /^3388000000000000000\.gig-longy-[0-9a-f]{16}$/);
  assert.equal(obj.classId, cls.id);
  assert.equal(obj.id, `3388000000000000000.t-${code}`);
  assert.equal(obj.barcode, undefined); // a reminder: no QR to copy
  assert.equal(cls.venue.name.defaultValue.value, "Peggy Sue's Music Bar");
  assert.equal(cls.venue.address.defaultValue.value, '1 High Street, Bath');
  assert.equal(cls.dateTime.start, '2026-07-04T19:30:00+01:00');
  assert.equal(obj.validTimeInterval.end.date, '2026-07-05T06:00:00Z');
  // A change to the gig's details is a new class; the same details, the same one.
  const again = await gwalletCard(show, 'c'.repeat(24), 'https://x.test', '3388000000000000000');
  const moved = await gwalletCard({ ...show, venue: 'The Bell, Bath' }, code, 'https://x.test', '3388000000000000000');
  assert.equal(again.cls.id, cls.id);
  assert.notEqual(moved.cls.id, cls.id);
});
