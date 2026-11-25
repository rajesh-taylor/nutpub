// Stripe Connect (session 62): fans pay by card straight into the artist's own Stripe account. The artist is the
// merchant (direct charges): Stripe pays the artist, takes its own fee from them and hands the NutPub its share as an
// application fee. The NutPub never holds the money, asks nobody for an email (Stripe's own pages ask the artist) and,
// for now, runs on test keys only (config.js).
// Cellar's Connect with Stripe: the stage keeps one thing, the artist's Stripe account id (kv 'stripe'). Accounts are
// made with Stripe's Accounts v2 (it refuses v1 for new platforms): the full Stripe Dashboard, Stripe collects its fees
// from the artist and carries losses, the artist fills in Stripe's hosted onboarding.
import { kv, one, siteUrl } from './db.js';
import { current } from './shows.js';
import { STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, FEE_PERCENT } from './config.js';
import { json, body } from './http.js';
import { addMessage, noGuestLinks } from './door.js';
import { noBadWords } from './wordlist.js';
import { modOf } from './mods.js';

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
  const state = cardState(acct);
  // Kept, so the fan's page knows card tips are on without asking Stripe on every visit.
  const saved = await kv.get('stripe', {});
  if (saved.on !== (state === 'on')) await kv.set('stripe', { ...saved, on: state === 'on' });
  return { state, name: acct.display_name || null };
}

// Card tips are on: this site has Stripe keys and the artist's account takes cards (Cellar saw it so).
export const cardTipsOn = async () => stripeOn() && !!(await kv.get('stripe', null))?.on;
// For the fan's page: what Stripe's card box needs (both public: the publishable key and the artist's account id).
export async function cardTipsInfo() {
  const saved = stripeOn() ? await kv.get('stripe', null) : null;
  return saved?.on ? { pk: STRIPE_PUBLISHABLE_KEY, account: saved.account } : null;
}

// What Stripe took and what it pays the artist, from Stripe's own record of the charge (its fee depends on the card).
// Not there yet: left out, and Takings asks again.
export function fees(pi) {
  const bt = pi.latest_charge?.balance_transaction;
  if (!bt || typeof bt !== 'object') return {};
  const stripeFee = (bt.fee_details || []).filter((f) => f.type === 'stripe_fee').reduce((t, f) => t + f.amount, 0);
  return { stripeFee, net: bt.net };
}

// Tonight's card money, for Takings: null when this gig has no card tips and card tips aren't on (Takings then looks
// as it did). Tips whose fees Stripe hadn't settled at the time are asked about once more here.
export async function cardMoney() {
  const tips = await kv.get('cardTips', []);
  const on = await cardTipsOn();
  if (!tips.length && !on) return null;
  const account = await stripeAccount();
  let changed = false;
  for (const t of tips) {
    if (t.net != null || !account) continue;
    try {
      const f = fees(await stripe('GET', `/v1/payment_intents/${t.id}?expand[]=latest_charge.balance_transaction`, { account }));
      if (f.net != null) { Object.assign(t, f); changed = true; }
    } catch { /* Stripe away: the line says so */ }
  }
  if (changed) await kv.set('cardTips', tips);
  const sum = (k) => tips.reduce((n, t) => n + (t[k] || 0), 0);
  const known = tips.every((t) => t.net != null);
  return { on, count: tips.length, pence: sum('pence'), nutpub: sum('fee'), stripeFee: known ? sum('stripeFee') : null, net: known ? sum('net') : null };
}

// A card tip, in pence: £1 to £100 (Stripe's least in pounds is 30p).
export const tipPence = (x) => (Number.isInteger(x) && x >= 100 && x <= 10000 ? x : null);
export const fee = (pence) => Math.round((pence * FEE_PERCENT) / 100);

// The words with a card tip (session 62b, the comment box's £ card): the same checks as a sats comment's (links are
// for the moderators; the slur list and the artist's own words), at most 140 characters (door.js clips them).
const cardText = async (c) => String((await body(c))?.text || '');

export function mountStripe(route, admin, pass) {
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

  // Tip by card, from the fan's page. A direct charge on the artist's own account: the artist is the merchant, Stripe
  // pays them and hands the NutPub its share as an application fee. The fan's card details go to Stripe's own box on the
  // page, never here; no email asked. Made when the fan presses Pay, so nothing is left half-made by browsing.
  // Session 62b: every card tip goes in the live chat once Stripe says paid, as a sats tip does, tagged with its pounds;
  // from the comment box, with the fan's words. The words stay here, kept by Stripe's payment id (kv cardSaid:<id>),
  // and never go to Stripe.
  route('POST', '/api/card-tip', pass, noGuestLinks(cardText), noBadWords(cardText), async (c) => {
    const pence = tipPence((await body(c))?.pence);
    if (!pence) return json({ error: 'A card tip is £1 to £100.' }, 400);
    const account = await stripeAccount();
    if (!(await cardTipsOn()) || !account) return json({ error: 'Card tips aren’t on for this gig.' }, 400);
    try {
      const { show, path } = await current(c);
      const pi = await stripe('POST', '/v1/payment_intents', { account, form: {
        amount: String(pence), currency: 'gbp', application_fee_amount: String(fee(pence)),
        'automatic_payment_methods[enabled]': 'true',
        description: `Tip for ${String(show?.artist || 'the artist').slice(0, 60)} on the NutPub`,
        'metadata[nutpub]': 'tip', 'metadata[gig]': path,
      } });
      const mod = await modOf(c);
      await kv.set(`cardSaid:${pi.id}`, { pass: c.pass, text: show?.comments === false ? '' : await cardText(c),
        mod: mod ? { name: mod.name, icon: mod.icon || null } : null });
      return json({ secret: pi.client_secret });
    } catch (e) { return json({ error: e.message }, 502); }
  });
  // After Stripe's box says paid: the NutPub asks Stripe itself (the page's word isn't proof) and keeps the tip for
  // Takings, once, and its line in the chat, once (taken from kv in one statement, so two checks can't both post it).
  // No webhook: this one question is enough.
  route('POST', '/api/card-tip/check', async (c) => {
    const id = String((await body(c))?.id || '');
    const account = await stripeAccount();
    if (!/^pi_[A-Za-z0-9]{8,64}$/.test(id) || !account) return json({ error: 'Not a card tip.' }, 400);
    try {
      const pi = await stripe('GET', `/v1/payment_intents/${id}?expand[]=latest_charge.balance_transaction`, { account });
      if (pi.metadata?.nutpub !== 'tip') return json({ error: 'Not a card tip.' }, 400);
      if (pi.status !== 'succeeded') return json({ status: pi.status });
      const tips = await kv.get('cardTips', []);
      if (!tips.some((t) => t.id === id)) {
        tips.push({ id, pence: pi.amount, fee: pi.application_fee_amount || 0, ...fees(pi), at: new Date().toISOString() });
        await kv.set('cardTips', tips);
      }
      const said = await one('DELETE FROM kv WHERE key = ? RETURNING value', `cardSaid:${id}`);
      if (said) { const w = JSON.parse(said.value); await addMessage(w.pass, w.text, 0, w.mod, null, pi.amount); }
      return json({ status: 'succeeded', pence: pi.amount });
    } catch (e) { return json({ error: e.message }, 502); }
  });
}
