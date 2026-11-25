// Stripe Connect (session 62): fans pay by card straight into the artist's own Stripe account. The artist is the
// merchant (direct charges): Stripe pays the artist, takes its own fee from them and hands the NutPub its share as an
// application fee. The NutPub never holds the money, asks nobody for an email (Stripe's own pages ask the artist) and,
// for now, runs on test keys only (config.js).
// Cellar's Connect with Stripe: the stage keeps one thing, the artist's Stripe account id (kv 'stripe'). Accounts are
// made with Stripe's Accounts v2 (it refuses v1 for new platforms): the full Stripe Dashboard, Stripe collects its fees
// from the artist and carries losses, the artist fills in Stripe's hosted onboarding.
import { kv, siteUrl } from './db.js';
import { current } from './shows.js';
import { STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY } from './config.js';
import { json } from './http.js';

const API = 'https://api.stripe.com';
const V2_VERSION = '2026-11-18.endive'; // the version Stripe named when it refused v1 accounts (25 Nov 2026)
export const stripeOn = () => !!(STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY);

// One call to Stripe. v2 takes JSON; v1 takes a form. `account`: on the artist's own account (a direct charge).
export async function stripe(method, path, { json, form, account } = {}) {
  const v2 = path.startsWith('/v2/');
  const headers = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };
  if (v2) headers['Stripe-Version'] = V2_VERSION;
  if (account) headers['Stripe-Account'] = account;
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  const r = await fetch(`${API}${path}`, { method, headers, body, signal: AbortSignal.timeout(10000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.log(`stripe ${method} ${path.split('?')[0]} ${r.status} ${String(data.error?.message || data.error?.code || '').slice(0, 200)}`);
    throw Object.assign(new Error('Stripe didn’t answer as expected. Try again in a minute.'), { stripe: r.status });
  }
  return data;
}

export const stripeAccount = async () => (await kv.get('stripe', null))?.account || null;

// Where the artist's account stands, in Cellar's words: none, unfinished (Stripe still needs details), checking
// (Stripe is looking at them; a few seconds after their last page, longer if it asks for a document) or on.
export function cardState(acct) {
  const cards = acct?.configuration?.merchant?.capabilities?.card_payments;
  if (cards?.status === 'active') return 'on';
  const due = (acct?.requirements?.entries || []).some((e) => e.awaiting_action_from === 'user');
  if (due || !cards || cards.status === 'restricted') return 'unfinished';
  return 'checking';
}

async function status() {
  const account = await stripeAccount();
  if (!account) return { state: 'none' };
  const acct = await stripe('GET', `/v2/core/accounts/${account}?include=configuration.merchant&include=requirements`);
  return { state: cardState(acct), name: acct.display_name || null };
}

export function mountStripe(route, admin) {
  // Cellar's panel. off: this server has no Stripe keys (a judge sees no panel, nothing changes).
  route('GET', '/api/admin/stripe', admin, async (c) => {
    if (!stripeOn()) return json({ off: true });
    try { return json(await status()); } catch (e) { return json({ error: e.message }, 502); }
  });
  // Connect with Stripe: the artist's account (made once, then kept), and a fresh link into Stripe's own pages. Back
  // to Cellar either way (finished, or the link ran out). The page's own address, so localhost comes back to localhost.
  route('POST', '/api/admin/stripe/connect', admin, async (c) => {
    if (!stripeOn()) return json({ error: 'Card payments aren’t on for this site yet.' }, 400);
    try {
      // What the NutPub already knows, so Stripe's pages ask fewer questions (Rajesh 25 Nov): the artist's name, their
      // NutPub page as the website and the industry (MCC 7929: bands, orchestras and entertainers). Never an email: Stripe
      // asks the artist for that itself. Not the product description: Stripe clears it when it makes the onboarding link
      // (seen 25 Nov), to have it in the artist's own words.
      const { show, path } = await current(c);
      const name = String(show?.artist || '').trim().slice(0, 60) || undefined;
      const profile = { business_url: `${siteUrl(c)}${path}`, doing_business_as: name };
      let account = await stripeAccount();
      if (!account) {
        const acct = await stripe('POST', '/v2/core/accounts', { json: {
          display_name: name, dashboard: 'full', identity: { country: 'gb' },
          configuration: { merchant: { mcc: '7929', capabilities: { card_payments: { requested: true } } } },
          defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' }, profile },
        } });
        account = acct.id;
        await kv.set('stripe', { account, made: new Date().toISOString() });
      } // Once the artist has opened Stripe's pages the details are theirs: Stripe refuses the NutPub's changes (403).
      const back = `${c.url.origin}/cellar#stripe`;
      const link = await stripe('POST', '/v2/core/account_links', { json: { account, use_case: { type: 'account_onboarding',
        account_onboarding: { refresh_url: back, return_url: back } } } });
      return json({ url: link.url });
    } catch (e) { return json({ error: e.message }, 502); }
  });
}
