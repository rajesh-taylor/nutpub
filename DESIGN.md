# The NutPub: design notes

## For the judges (now → expo)
Each judge sees one phone, for three minutes. The phone has to tell the story by itself.
- **Chapter banner** (built): "1 · The door", "2 · Inside", "3 · Curtains up", "4 · Longy's paid! / Last orders", one plain sentence each.
- **One action per screen.** The big button is the next step of the night; everything else is small.
- **Proof you can see:** a ✓ line per 10-second segment, the Pint Signal, "+21 sats home". Each is a protocol event the judge watched happen on their own phone.
- **Rupert stays on the stage screen** (mirrored), so judges watch the refusals rather than read them.

## The look: a rock 'n' roll pub, not a fintech app
- **Palette:** midnight blue, whisky amber, velvet red for curtains, Bitcoin orange only for "Longy's paid!".
- **Type:** condensed gig-poster type (DIN Condensed now; consider a free poster face like Bebas Neue or Oswald for headlines).
- **Objects from a gig:**
  - The door as a **ticket stub** (perforated edge, tier printed like a seat).
  - Paid segments as a **setlist** (hand-written-looking ticks).
  - The goal as **seven stage lights** (built on the stage screen; bring them to the phone).
  - The free pint as a **drinks token**.
  - Closing time as a **till receipt**: "Door 214 · Bar 336 · Pledges 2,100 · Drinkers identified: 0".
- **Longy's photos:** duotone them (amber highlights, midnight shadows) so text stays readable and the set looks like one poster. Live-with-guitar portrait behind "Now playing"; mic-and-pint on the closing-time screen.
- **Motion:** the curtain parting (2.5 s), the pint pour (built), sats rain (built). Nothing else moves. Fewer than 3 flashes a second; reduced-motion users get fades.

## Tier 4: the livestream site (watch from home)
For people on a laptop or iPad who can't be in the room. Like Fountain and zap.stream, but the meter is ecash.

**Pages (3):**
1. **The show** — video player, now playing, the stage lights, a live message wall, and the wallet in one side panel. Pay per 10 s (ecash) or buy a ticket for the night (card).
2. **Tonight's line-up** — who's on, set times, the artist's links (Fountain, Bandcamp), and the story of the venue.
3. **About / how it works** — the 402 in plain English, the privacy promise, the source code.

**Payments, two rails, kept apart:**
- **Ecash (anonymous):** the same NUT-24 meter, tips and pledges as in the room. Top up from any Lightning wallet.
- **Card via Stripe (identity):** a ticket for the whole night. Stripe learns who paid, so say so on the button, and never link the card rail to anything a viewer does with ecash.

**Messages with sats (like boostagrams):** a message travels beside the payment, never inside it, signed with a name-for-the-night key (see "Identity by choice" in the build plan). The artist sees "Merry Mempool · 21 sats · Encore!"; the mint never sees the words.

**The green room (livestream):** pass holders message each other; the host reads the best out between songs. Every 15 minutes a card for Longy's next show, merch (tees, limited posters) and gift a ticket.

**Gift a ticket:** a ticket is a bearer token, the same as tonight's gift QR. Send it like any ecash.

**The raffle (instead of "top tipper", which would mean adding up one fan's tips):** every 21-sat boost is an entry; entries close halfway through the show; the winner's key appears on screen before the last song. The prize is a ticket to Longy's next show **locked to the winner's key (NUT-11), with a locktime: unused by the next show, it goes back to the venue.** Same lock as the pint and the pledges: one primitive, three jobs.

**Embed it anywhere:** venues and artists paste one line, `<iframe src="https://…/embed/<show>">`, and the player, the 402 meter and the tip button live inside it. No MCP needed for that. Later, an MCP server could let AI agents list shows and buy passes (the 402 is already machine-friendly). Venues want more nights booked than artists can play: a shareable link plus an embed is the pitch.

**Prices published ahead:** the weekly listing shows each night's ticket and pass price; the 402 asks for exactly that.

**Before building:** a one-page design spec (layouts at 375 px, 768 px and 1440 px), then build.
