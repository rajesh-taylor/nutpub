// What Express did for us, in a few lines: JSON replies, a step-by-step chain (each step returns a Response to
// answer, or nothing to carry on), and a JSON body with a size limit.
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

export const chain = (...steps) => async (c) => {
  for (const step of steps) {
    const res = await step(c);
    if (res) return res;
  }
  return json({ error: 'not_found' }, 404);
};

// The request's JSON body (16 kB at most). Bad JSON: an empty body, as express.json() left it.
export async function body(c, limit = 16 * 1024) {
  if (c.body !== undefined) return c.body;
  const text = await c.req.text();
  if (text.length > limit) throw Object.assign(new Error('too_big'), { status: 413 });
  try { c.body = text ? JSON.parse(text) : {}; } catch { c.body = {}; }
  return c.body;
}

export const randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const now = () => new Date().toISOString();
