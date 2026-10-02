# Next session (Fri 2 Oct)

## Start everything (Mac)
1. Mints: `cdk-mintd -w ~/cdk-suitcoin-mint` (SuitCoin, :3339). Fake Kitty fallback only: `cdk-mintd -w ~/cdk-fake-mint` (:3338).
2. Server (Minibits): `cd ~/Documents/NutPub && set -a && . ./.env && npm start`
   - Fake mint instead: add `KITTY_URL=http://127.0.0.1:3338`. Shorter last orders for testing: `LAST_ORDERS_MIN=1`.
3. Tunnel: `cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8787 > data/tunnel.log 2>&1 &`
   then `grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' data/tunnel.log | head -1 > data/tunnel.url` (QR codes read this file).
4. Pixel over USB: `adb reverse tcp:8787 tcp:8787` (redo after replugging).
5. Stage: `<tunnel>/stage.html#k=<ADMIN_KEY from .env>`. Float top-up: `/fund.html`.

## Where we are
- Tier A, B done. Tier C: finale core done (pledges, goal, lights, countdown, paid, +21 home).
- Real-money checkpoint passed on Minibits (00:50). House float: ~500 real sats.
- Chapter banner, EN/DE pill, presenter arrows, pint pour animation, closing-time screen.

## To do, in order
1. Longy's audio file → `scripts/segments.sh <file>` (placeholder tone until then).
2. Photos are in `public/img/` (git-ignored until Rajesh says they can be public): longy-live (Now playing, lights up), longy-cheers (closing time), longy-lastorders (B&W pint nudge, **only an 800 px copy: need the original**), longy-stage and longy-countdown (stage screen and livestream countdown, not wired yet).
3. Payout to Longy: melt (NUT-05) his claimed pledges to his Lightning address (need the address).
4. Basement58 (retry rule) — 40 min max, else the proposal text only.
5. KYC Kebab Shack (Rupert, read-only, on the phones).
6. README with the §13 declarations, PROPOSAL.md, then the btc++ form (due 15:00).
7. Rehearse the 3-minute script twice with a stopwatch.

## Agreed late Thu (not built yet)
- Stage screen: longy-stage before the show; lights up on the stage too.
- Livestream countdown page with longy-countdown (Old Blue Last 2), dimmed: "Longy's on in 12:34".
- Placeholder livestream site + "Embed this show" box (see DESIGN.md, Tier 4).
- Raffle and time-locked prize ticket: spec only (DESIGN.md).

## Known rough edges
- Pixel can't reach the internet from Vanadium on venue wifi (check Vanadium's Network permission); bar page via USB works.
- The tunnel URL changes on every restart; QR codes follow `data/tunnel.url`.
- SSE doesn't pass the tunnel; pages poll every second.

## Phone review, Thu night (Rajesh, Pixel + iPhone)
Verdict: the flow works, the look doesn't. It reads cartoony and dated, not somewhere you'd send money. The keynote deck's gritty look is the brand; the pages must match it.

### Brand direction (album-art rules)
- **The wordmark is the band logo:** THE NUTPUB, top centre, big, condensed caps, tracked out. On every page, the same.
- **One photo per screen, full bleed,** type over it, like an album cover. Grain + vignette over everything (reuse the deck's texture recipe, `nutpub-deck/textures.js`, `bg-a.jpg`).
- **Two colours and the photo.** Deck palette: midnight `#0B1426`, deep `#050914`, amber `#D9953A`, cream `#EFE3C8`, smoke `#8E97AD`. Nothing else.
- **Type is the identity:** one condensed poster face for headlines (caps, huge, tight), one quiet face for body, tracked caps for labels, mono for NUT stamps. DIN Condensed doesn't exist on Android/iOS, which is a big part of why the phones looked cartoony: self-host a condensed face (decision below).
- **No emoji as UI.** Emoji make it look like a toy. Type and thin line icons only (keep 🍺⚡ for the celebration moments, maybe).
- **Buttons are compact and centred:** outlined, caps, sized to their words, not full-width cards.
- **Money screens are calm:** big clear prices, one action, no small print for anything that matters.

### Fixes from the review
- [x] Drop "Nobody asks your name." (chapter 1). Done Thu night.
- [x] Drop "from anywhere" from the livestream button. Done Thu night.
- [ ] Centre everything; THE NUTPUB wordmark top centre (it's the platform's index page). One top bar, not two (🥜 appears twice now).
- [ ] Narrower buttons on phone and desktop.
- [ ] Payment rail as two small buttons above the tickets: **Ecash / Lightning** and **Card (Stripe)**. Bitcoiners get it at a glance. Replaces the small-print line and the dashed card box.
- [ ] The small-print line about names and receipts: the rail buttons say it now; if any of it stays, it's normal size.
- [ ] "0 sats" top right means nothing to a judge. Make it a labelled pocket: "IN YOUR POCKET · 60 SATS", or hide until a gift lands.
- [ ] EN/DE pill doesn't work (only the punchlines have German, so tapping it seems to do nothing). Flags 🇬🇧 🇩🇪 instead, and either translate every line or drop German for the expo (decision below).
- [ ] Not yet seen on the phones: tune-in button, lights up live, last-orders nudge, finale hit/miss, closing time. Run these first thing.

### Decisions needed at breakfast
1. **Headline font:** self-host a free condensed poster face (Bebas Neue or Oswald, both SIL Open Font Licence) as a file in the repo. It isn't in the fixed dependency list, so it needs a yes.
2. **German:** full translation behind 🇬🇧/🇩🇪, or English only for the expo?
3. **Wallet balance:** labelled pocket, or hidden until a gift lands?
