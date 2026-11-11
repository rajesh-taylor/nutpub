// RFC 6238, Appendix B: the known answers for SHA-1, SHA-256 and SHA-512 (8 digits, 30-second steps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totp, totpOk, stepAt } from '../server/totp.js';

const hex = (s) => Buffer.from(s, 'ascii').toString('hex');
const SEEDS = {
  'SHA-1': hex('12345678901234567890'),
  'SHA-256': hex('12345678901234567890123456789012'),
  'SHA-512': hex('1234567890123456789012345678901234567890123456789012345678901234'),
};
const VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

test('RFC 6238 test vectors', async () => {
  for (const [time, ...want] of VECTORS) {
    for (const [i, hash] of ['SHA-1', 'SHA-256', 'SHA-512'].entries()) {
      assert.equal(await totp(SEEDS[hash], stepAt(time * 1000), { hash }), want[i], `${hash} at ${time}`);
    }
  }
});

test('the door takes the last minute and the next step, nothing older', async () => {
  const secret = SEEDS['SHA-256'];
  const at = 1234567890 * 1000;
  const code = (s) => totp(secret, stepAt(at) + s);
  assert.equal(await totpOk(secret, await code(0), at), true);
  assert.equal(await totpOk(secret, await code(-1), at), true);
  assert.equal(await totpOk(secret, await code(1), at), true);
  assert.equal(await totpOk(secret, await code(-2), at), false);
  assert.equal(await totpOk(secret, await code(2), at), false);
  assert.equal(await totpOk(secret, '1234567', at), false);
  assert.equal(await totpOk(null, await code(0), at), false);
});
