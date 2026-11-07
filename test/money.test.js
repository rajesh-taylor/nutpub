// Known answers for the sats and £ maths. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satsFrom, penceFrom, money } from '../server/money.js';

test('£ to sats', () => {
  assert.equal(satsFrom(10, 57_000), 17_544);     // 1e9 / 57,000 = 17,543.86
  assert.equal(satsFrom(20, 57_000), 35_088);     // the free show's £20: "about 35,000 sats"
  assert.equal(satsFrom(10.1, 57_000), 17_719);   // pence, not floats: 1,010,000,000 / 57,000 = 17,719.30
  assert.equal(satsFrom(0.01, 76_000), 13);       // one cent: 13.16
  assert.equal(satsFrom(5, 100_000), 5_000);
  assert.equal(satsFrom(0, 57_000), null);
  assert.equal(satsFrom(-3, 57_000), null);
  assert.equal(satsFrom('abc', 57_000), null);
  assert.equal(satsFrom(10, 0), null);
});

test('sats to pence', () => {
  assert.equal(penceFrom(17_544, 57_000), 1000);  // back to £10.00
  assert.equal(penceFrom(3_600, 76_000), 274);    // 60 sats a minute for an hour at $76,000: about $2.74
  assert.equal(penceFrom(0, 57_000), 0);
  assert.equal(penceFrom(100_000_000, 57_000), 5_700_000);
});

test('how it reads', () => {
  assert.equal(money(17_544, 57_000), '£10.00');
  assert.equal(money(3_600, 76_000, '$'), '$2.74');
  assert.equal(money(1, 57_000), '<£0.01');
  assert.equal(money(0, 57_000), '£0.00');
  assert.equal(money(1_000_000, 57_000), '£570');
  assert.equal(money(10_000_000, 57_000), '£5,700');
});
