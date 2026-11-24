// The Kitchen and the Pub Board (session 43, as The Regulars): what they may and may not say. Every card on the Kitchen has exactly one
// tick chip of the three; neither page names another project, a Refueler product, a fee, or an MCP endpoint here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The page as people read it: without its style block (CSS has its own % signs).
const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8').replace(/<style>[\s\S]*?<\/style>/g, '');
const kitchen = read('kitchen.html');
const regulars = read('agents.html');

test('built cards carry a line and their specs; ideas not built yet are tiles: a chip, a name and specs', () => {
  const cards = kitchen.split('<li class="kcard">').slice(1).map((c) => c.split('</li>')[0]);
  const tiles = kitchen.split('<li class="soon-tile">').slice(1).map((c) => c.split('</li>')[0]);
  assert.ok(cards.length >= 20, `only ${cards.length} cards`);
  assert.ok(tiles.length >= 8, `only ${tiles.length} tiles`);
  for (const c of cards) {
    assert.match(c, /class="chip built"/, c.slice(0, 120));
    assert.match(c, /class="specs"/, c.slice(0, 120));
  }
  // Rajesh 21 Nov: never the how for what isn't built: no sentence, only a name and its specs.
  for (const t of tiles) {
    assert.equal([...t.matchAll(/class="chip (after|proposed)"/g)].length, 1, t.slice(0, 120));
    assert.match(t, /class="specs"/, t.slice(0, 120));
    assert.ok(!/<p\b/.test(t), t.slice(0, 120));
  }
});

test('no other projects, no Refueler products, no fees, no MCP endpoint on thenutpub.com', () => {
  for (const [name, page] of [['kitchen', kitchen], ['agents', regulars]]) {
    for (const word of ['Fountain', 'zap.stream', 'ShoSho', 'Refueler Pass', 'Ref Stream', 'Refueler Stream', '%']) {
      assert.ok(!page.includes(word), `${name} says ${word}`);
    }
    assert.ok(!/thenutpub\.com\/(mcp|sse)/.test(page), `${name} names an MCP endpoint here`);
  }
  assert.match(regulars, /refueler\.io/);
  // Session 47 (Rajesh 21 Nov): the Pub Board names what's next by name only, with no MCP plan.
  assert.ok(!/MCP/.test(regulars), 'the Pub Board talks about MCP');
  assert.match(regulars, /Gig search for agents/);
});
