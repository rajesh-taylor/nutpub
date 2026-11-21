// The Kitchen and The Regulars (session 43): what they may and may not say. Every card on the Kitchen has exactly one
// tick chip of the three; neither page names another project, a Refueler product, a fee, or an MCP endpoint here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The page as people read it: without its style block (CSS has its own % signs).
const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8').replace(/<style>[\s\S]*?<\/style>/g, '');
const kitchen = read('kitchen.html');
const regulars = read('agents.html');

test('every Kitchen card has one chip: built, after 27 Nov or proposed', () => {
  const cards = kitchen.split('<li class="kcard">').slice(1).map((c) => c.split('</li>')[0]);
  assert.ok(cards.length >= 25, `only ${cards.length} cards`);
  for (const c of cards) {
    const chips = [...c.matchAll(/class="chip (built|after|proposed)"/g)].map((m) => m[1]);
    assert.equal(chips.length, 1, c.slice(0, 120));
    assert.match(c, /class="specs"/, c.slice(0, 120));
  }
});

test('ideas not built yet give a name and their specs, never the how', () => {
  const later = kitchen.split('<li class="kcard">').slice(1).map((c) => c.split('</li>')[0]).filter((c) => !c.includes('chip built'));
  for (const c of later) assert.ok([...c.matchAll(/<p(?! class="specs")/g)].length <= 1, c.slice(0, 120));
});

test('no other projects, no Refueler products, no fees, no MCP endpoint on thenutpub.com', () => {
  for (const [name, page] of [['kitchen', kitchen], ['agents', regulars]]) {
    for (const word of ['Fountain', 'zap.stream', 'ShoSho', 'Refueler Pass', 'Ref Stream', 'Refueler Stream', '%']) {
      assert.ok(!page.includes(word), `${name} says ${word}`);
    }
    assert.ok(!/thenutpub\.com\/(mcp|sse)/.test(page), `${name} names an MCP endpoint here`);
  }
  assert.match(regulars, /refueler\.io/);
  assert.match(regulars, /thenutpub\.com has no MCP endpoint/);
});
