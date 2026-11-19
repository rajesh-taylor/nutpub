// The replay's one price and a free stream's up-front price (session 35). The figures here are made up: the real
// ones are a Worker secret (PRICING), never in the repo. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, blank, showMinutes, replayMinPence, replayPriceAt, freePence } from '../server/shows.js';

const P = { replayHour: 100, replayMin: 250, viewerHour: 7 }; // pence; made up for the tests
const GBP = 50_000; // £ a bitcoin: £1 = 2,000 sats
const gig = (extra) => clean({ ...blank(), date: '2099-01-01', streams: '20:00', lastOrders: '22:00', stream: { mode: 'pay', perMinute: 60 }, ...extra });

test('the show’s length, past midnight too', () => {
  assert.equal(showMinutes(gig().show), 120);
  assert.equal(showMinutes(gig({ streams: '22:30', lastOrders: '01:00' }).show), 150);
  assert.equal(showMinutes(gig({ lastOrders: '' }).show), 0);
});

test('every streamed gig needs its end time; a room-only night doesn’t', () => {
  assert.ok(gig({ lastOrders: '' }).problems.includes('streamEnds'));
  assert.ok(!gig().problems.includes('streamEnds'));
  assert.ok(!gig({ lastOrders: '', stream: { mode: 'off' } }).problems.includes('streamEnds'));
});

test('the replay’s minimum: by the hour to the minute, rounded up, never below the lowest', () => {
  assert.equal(replayMinPence(gig().show, P), 250); // 2 hours: 200p, so the lowest, 250p
  assert.equal(replayMinPence(gig({ lastOrders: '23:10' }).show, P), 317); // 3 h 10: 316.7p, up to 317p
  assert.equal(replayMinPence(gig().show, { replayHour: 0, replayMin: 0, viewerHour: 0 }), 0); // no secret: no minimum
});

test('one price: the artist’s, or the minimum if that’s more', () => {
  const on = (replay) => gig({ replay: { mode: 'on', ...replay } }).show;
  assert.deepEqual(replayPriceAt(on({}), GBP, P), { sats: 5000, pence: 250, minPence: 250, minSats: 5000 }); // starts at the minimum
  assert.equal(replayPriceAt(on({ price: 3000, fiat: 1.5 }), GBP, P).sats, 5000); // below it: held to it
  assert.deepEqual(replayPriceAt(on({ price: 8000, fiat: 4 }), GBP, P), { sats: 8000, pence: 400, minPence: 250, minSats: 5000 });
});

test('free streams have no replay; session 34’s modes come back on, at the minimum', () => {
  assert.equal(gig({ stream: { mode: 'free' }, replay: { mode: 'on' } }).show.replay.mode, 'off');
  const old = gig({ replay: { mode: '50', perMinute: 40 } }).show;
  assert.equal(old.replay.mode, 'on');
  assert.equal(replayPriceAt(old, GBP, P).sats, 5000);
});

test('a free stream’s price: viewers × (hours + the spare hour), to the minute, rounded up', () => {
  const free = (viewers, lastOrders = '22:00') => gig({ stream: { mode: 'free' }, free: { viewers }, lastOrders }).show;
  assert.equal(freePence(free(30), P), 630); // 30 × 3 hours × 7p
  assert.equal(freePence(free(30, '22:10'), P), 665); // 30 × 3 h 10 × 7p
  assert.equal(freePence(free(7, '22:10'), P), 156); // 155.2p, up to 156p
});

test('a free stream needs its most viewers, 1 to 100', () => {
  assert.ok(gig({ stream: { mode: 'free' } }).problems.includes('free.viewers'));
  assert.equal(gig({ stream: { mode: 'free' }, free: { viewers: 101 } }).show.free.viewers, null);
  assert.equal(freePence(gig({ free: { viewers: 30 } }).show, P), 0); // a paid stream: nothing up front
});
