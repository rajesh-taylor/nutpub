// The replay's price (session 34): 25% or 50% of the live price a minute, or the artist's own, never below the floor;
// paid streams only, and no 25% or 50% on a Watch online gig. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, blank, replayRate, replayFloor } from '../server/shows.js';

const gig = (stream, replay) => clean({ ...blank(), stream, replay }).show;

test('a quarter or a half of the live price a minute, rounded up', () => {
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 60 }, { mode: '25' })), 15);
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 61 }, { mode: '50' })), 31);
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 60 }, { mode: 'own', perMinute: 40 })), 40);
});

test('never below the floor', () => {
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 60 }, { mode: '25' }), 34), 34);
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 200 }, { mode: '50' }), 34), 100);
});

test('the floor: pence an hour in sats a minute at the day’s rate', () => {
  assert.equal(replayFloor(100, 49_260), 34); // £1 an hour at £49,260 a bitcoin
  assert.equal(replayFloor(0, 49_260), 0);
});

test('free streams have none; Watch online only its own price', () => {
  assert.equal(gig({ mode: 'free' }, { mode: '50' }).replay.mode, 'off');
  assert.equal(replayRate(gig({ mode: 'free' }, { mode: 'own', perMinute: 40 })), 0);
  assert.equal(gig({ mode: 'ticket' }, { mode: '50' }).replay.mode, 'off');
  assert.equal(replayRate(gig({ mode: 'ticket' }, { mode: 'own', perMinute: 40 })), 40);
  assert.equal(replayRate(gig({ mode: 'pay', perMinute: 60 }, { mode: 'off' })), 0);
});

test('own price with none typed is still to fill in', () => {
  assert.ok(clean({ ...blank(), stream: { mode: 'pay', perMinute: 60 }, replay: { mode: 'own' } }).problems.includes('replay.perMinute'));
});
