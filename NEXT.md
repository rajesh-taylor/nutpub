# Next session (Fri 2 Oct)

## Start everything (Mac)
0. Optional: `CURTAINS_AT=3` in `.env` makes curtains go up by themselves at 3 phones (the phones then say "lights up at 3"). Unset = stage button only.
0. Free test run: a second server on the fake mint, `set -a; . ./.env; KITTY_URL=http://127.0.0.1:3338 PORT=8788 LAST_ORDERS_MIN=2 node server/index.js` (house tops up with fake sats via `/fund.html`; open `localhost:8788` in a browser).
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
3. Payout to Longy: **built Fri 08:00** (`server/payout.js`: LNURL-pay → melt quote → exact-amount swap → melt; tested on the fake mint, 63 → 61 sent, 2 sats unused reserve stay his). **Needs `LONGY_LN=<his address>` in `.env` and a server restart**; until then it's off and the screens say "The room hit the goal", not Lightning. Retry by hand: `POST /api/payout` with X-Admin. Untested: the LNURL lookup against his real address (fetching an invoice is harmless; do it once the address is in).
4. Basement58 (retry rule) — 40 min max, else the proposal text only.
5. KYC Kebab Shack (Rupert, read-only, on the phones).
6. README with the §13 declarations, PROPOSAL.md, then the btc++ form (due 15:00).
7. Rehearse the 3-minute script twice with a stopwatch.

## Agreed late Thu (not built yet)
- [x] (Fri 07:56) Stage screen: longy-stage before the show, one lamp per phone; lights up on the stage too.
- Livestream countdown page with longy-countdown (Old Blue Last 2), dimmed: "Longy's on in 12:34".
- Placeholder livestream site + "Embed this show" box (see DESIGN.md, Tier 4).
- Raffle and time-locked prize ticket: spec only (DESIGN.md).

## Budget and the room
- The float only needs to cover **3 judges** (gift ~105 each ≈ 315 sats). If shortlisted, the **first 10 from the crowd** at the finals. Not 3,000.
- At the finals, the Pixel is mirrored (scrcpy) to the MacBook on the projector: the crowd sees our phone's screen.

## Numo (bar till)
Decided Thu night: **free pints stay on our bar page.** Numo can't redeem P2PK (its receive passes no signing keys), and the free pint is locked to the bar's key. Numo is the till for *paid* pints from the menu (Tier 2 in the plan: fork, rename, webhook ticker). Only if time allows after the redesign; it's a nice "the bar runs Numo" line, not a demo beat.

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
- [x] Centre everything; THE NUTPUB wordmark top centre, one top bar on every page (Fri 07:30).
- [x] Narrower buttons: outlined, caps, sized to their words (Fri 07:30).
- [x] (Fri 07:30) Payment rail as two small buttons above the tickets: **Ecash / Lightning** and **Card (Stripe)**. Bitcoiners get it at a glance. Replaces the small-print line and the dashed card box.
- [x] (Fri 07:30; the card note is normal size) The small-print line about names and receipts: the rail buttons say it now; if any of it stays, it's normal size.
- [x] (Fri 07:30: "IN YOUR POCKET · 105 SATS" under the wordmark, hidden at 0) "0 sats" top right means nothing to a judge. Make it a labelled pocket: "IN YOUR POCKET · 60 SATS", or hide until a gift lands.
- [x] (Fri 07:37: flags 🇬🇧 🇩🇪, every guest line in `client/i18n.js`: door, inside, finale, moments, stage, bar, Rupert) EN/DE pill doesn't work (only the punchlines have German, so tapping it seems to do nothing). Flags 🇬🇧 🇩🇪 instead, and either translate every line or drop German for the expo (decision below).
- [x] (Fri 07:37) After a gift lands, say what to do next in big type ("105 sats in your pocket. Pick a ticket or a pass.").
- [x] (Fri 07:48: one stage light per phone, twinkling, mixed sizes; "lights up at 3" only shows if `CURTAINS_AT` is set) **The phone should show the room, not just the stage screen:** "2 phones in · lights up at 3", a small row of lamps that fills as people arrive. Judges hold the phone, not the Mac.
- [x] (Fri 07:48) **Stop paying must feel immediate:** fade the music out at once on Stop; say "Stopped. You'd paid up to 0:40; nothing more is charged." (Today it plays out the paid segment plus the one bought 3 s ahead, up to ~13 s.)
- [ ] **Lights up:** lamps scattered like a real rig (different sizes, heights, angles, a few tilted spots with beams), not a neat row. **Hold Longy's photo bright for 5–6 s**, then settle into Now playing with the same photo behind (less darkened). It's our best first image.
- [x] (Fri 07:48: round play/stop button, "This set: 12 sats", no tick list; "You're in" gives way to Now playing) **Less on screen while playing:** drop the per-segment ✓ list; show one running total ("This set: 12 sats"). Redesign "Pay to listen" (awful): proper player controls in the brand.
- [ ] The placeholder tone is off-putting: keep it only until Longy's file arrives.
- [ ] **Livestream player on the phone:** portrait = small 16:9 player at the top, the night below; turn the phone landscape = full screen, one tap brings up controls, including a **Tip** button with a confirm step.
- [ ] **Website player (responsive):** player with a YouTube-style live chat (the green room) to the right on desktop, below on phones.
- [ ] **The pre-show fills the room:** each phone that comes in lights one lamp (up to 7), on every phone and the stage. At lights up the house goes dark, then a premiere sequence, synced on every phone by T0: lamps fire in turn (a drum roll), Longy's photo fades up between the flashes, and it ends **static on the photo** with one card placed well: show start time, merch, next shows, or the green room.
- [x] (Fri 07:48: fades back after ~6 s; glass sized by height too) **Pint Signal returns to Longy:** after the pour (about 5 s), fade back to the hero image by itself, not stay on the IPA glass until tapped. The pint glass is smaller on the iPhone than the Pixel: size it to the screen.
- [x] Lights up redesigned Thu night (seen on the Pixel, looks right): THE NUTPUB PRESENTS top centre, three big beacons, Longy's photo much brighter, LONGY · LIVE AT THE NUTPUB along the bottom so his face is clear. Preview: `/?preview=lights` (tap to replay).
- [ ] **Pick the hero photo:** `/photos.html` cycles 12 portrait candidates, 8 s each (tap to skip); the tag top right names the file. Rajesh to choose at breakfast.
- [ ] **Photo shortlist** (picker, Thu night): fp-29, fp-32, fp-37, peggy-17-8266, peggy-32-5864 (B&W), peggy-5-1372 for the hero; **fp-31 (can raised) is the free-pint prompt**. Closing-time photo to choose.
- [ ] **Say "stage lights", not "beacons"** (beacons is Lord of the Rings, from the old name). One light per judge; more judges, more lights, in different sizes, twinkling.
- [ ] **A/B test at breakfast:** (A) the photo slides play as soon as the page opens, and the stage lights fire once the 3 judges have spent their gifts at the door; vs (B) today's lights-then-photo.
- [ ] **A separate sequence for livestream viewers** (no door, no pint): this needs the livestream website page up at the same time.
- [ ] **The three beacons get their own screen**, before any photo: one per judge as they come in (demo only). Only then Longy's images.
- [ ] Peggy Sue's photos are only 800 px web copies (from the deck); for real use, export the originals.
- [x] Title over the beacons is now **NEW MUSIC NUDGE UNIT** (was "The NutPub presents").
- [ ] **One beacon per guest:** the three beacons light as each judge comes through the door (pre-show, on every phone and the stage), then the premiere at lights up. Three judges at the expo = three beacons.
- [x] (the arrows were already presenter-only; the bar page is only reached from a pint QR) Bar page on a fan's phone says "Scan a pint QR from a fan's phone": it's the bar's screen, so keep it off the guest arrows (presenter only).
- [ ] Not yet seen on the phones: tune-in button, lights up live, last-orders nudge, finale hit/miss, closing time. Run these first thing.

### Decided Thu night
1. **Font: yes.** Self-host a free condensed poster face (Bebas Neue or Oswald, SIL OFL) as a file in the repo, with its licence file.
2. **German: yes, full translation** behind 🇬🇧 / 🇩🇪 flags. Every line, not just the punchlines. Berlin, lots of German devs: it shows we're inclusive.
3. **Bottom bar with three buttons** (phone), the same for judges in the room and viewers at home. **Built Fri 07:50** (Pocket: balance, mint, tonight's tally kept on the phone, Lightning top-up via Coco, paste ecash; Longy: photo, bio, Fountain tip). **Rajesh: confirm Longy's two-line bio, next shows, merch** (placeholders now: "Rock 'n' roll from Southend", "To be announced", "Coming soon"). Not built: take it home (withdraw).
   - **Pocket** (left): balance in big type, which mint it's at ("NutPub Mint · Minibits"), what tonight has cost so far (door, stream, pledges, tips), top up (Lightning invoice or paste ecash), and later "take it home" (withdraw to your own wallet). One wallet for the ticket, the stream, the pint and the tips.
   - **The night** (centre, home): the live screen, now playing, the next action. Each chapter has a small "what just happened?" that opens the plain-English explanation (402, DLEQ, P2PK, locktime). Info lives with the story, not in a separate menu, so judges learn as they go.
   - **Longy** (right): the artist page. Photo, two lines of bio, tip on Fountain, next shows, merch. The venue is the NutPub wordmark at the top.
4. **Viewer must-haves we'd missed:**
   - **A spending cap for the livestream**: "stop at 60 sats" (default 60, adjustable). People will only leave a meter running if it can't run away.
   - **A running meter:** "This set so far: 12 sats".
   - **Sound state:** a clear "tap for sound" on iPhone, and mute.
   - **Connection state:** "Offline: the music stops, nothing is charged".
   - **The wallet lives on this phone:** say so in Pocket, and offer "take it home" before people clear their browser.
