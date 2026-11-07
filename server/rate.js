// What a bitcoin costs in £ and $: CoinGecko's free price API (or mempool.space's), asked at most every 30 minutes, the answer kept in D1.
// CoinGecko down or refusing: the last answer we had, however old (and the page is told it's old). Never had one:
// a fixed rough figure, said plainly, so setup still works.
import { kv } from './db.js';
import { json } from './http.js';

const FRESH_FOR = 30 * 60 * 1000; // 30 min: bitcoin seldom moves 0.5% in that time, and fewer asks means fewer refusals
const URL_ = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=gbp,usd';
export const FALLBACK = { gbp: 57_000, usd: 76_000, at: null, source: 'fixed' }; // rough, 2 Nov 2026

let asking = null; // one question to CoinGecko at a time per Worker
let failedAt = 0;  // after a refusal, wait a minute before asking again

// Two free sources, no key: CoinGecko first (as agreed), then mempool.space, which answers when CoinGecko turns away
// Cloudflare's shared addresses (it does: 429).
const SOURCES = [
  ['coingecko', URL_, (d) => [d?.bitcoin?.gbp, d?.bitcoin?.usd]],
  ['mempool.space', 'https://mempool.space/api/v1/prices', (d) => [d?.GBP, d?.USD]],
];
async function ask() {
  const errors = [];
  for (const [source, url, read] of SOURCES) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'thenutpub.com (rate, every 30 min)' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 1800 } });
      if (!res.ok) throw new Error(`${res.status}`);
      const [gbp, usd] = read(await res.json()).map(Number);
      if (!(gbp > 1000 && usd > 1000)) throw new Error('no price');
      const rate = { gbp, usd, at: Date.now(), source };
      await kv.set('rate', rate);
      return rate;
    } catch (e) { errors.push(`${source} ${String(e.message || e)}`); }
  }
  throw new Error(errors.join(', '));
}

export async function getRate() {
  const saved = await kv.get('rate');
  if (saved && Date.now() - saved.at < FRESH_FOR) return { ...saved, stale: false };
  if (Date.now() - failedAt < 60_000) return { ...(saved || FALLBACK), stale: true };
  try {
    return { ...(await (asking ??= ask().finally(() => { asking = null; }))), stale: false };
  } catch (e) {
    failedAt = Date.now();
    console.log(`rate: ${String(e.message || e)}; using ${saved ? 'the last one' : 'the fixed one'}`);
    return { ...(saved || FALLBACK), stale: true };
  }
}

export function mountRate(route) {
  route('GET', '/api/rate', async () => json(await getRate(), 200, { 'Cache-Control': 'public, max-age=60' }));
}
