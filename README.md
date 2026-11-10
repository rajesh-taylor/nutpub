# The NutPub

**A gig paid for in Cashu ecash.** A Refueler Labs concept, from a value-for-value (V4V) and privacy hackathon project, now entered in [NutNovember](https://nutnovember.org): fans buy a room or online ticket, or pay as they watch the live stream, and tip the band, all from a wallet in their browser. No app, no account, no email.

**Live demo:** https://thenutpub.com (test mint, test sats only)

> **Test only.** The demo runs on the public Cashu test mint (testnut.cashu.space): a fake Lightning wallet. Its sats have no value, and it can't pay a real invoice.

## The 402 on live video

An artist streams from a phone (Larix Broadcaster) or a laptop (OBS) to Cloudflare Stream. The plain video link is refused: the picture only plays with a signed token.

1. The viewer presses play. The site answers with an HTTP 402, and the wallet in their browser pays it (NUT-24).
2. The reply carries a short-lived token, signed by the site, good for the minute paid for plus a little slack. The next minute's payment brings a new one, and hls.js puts the newest token in every playlist request.
3. Stop paying and the token runs out: Stream refuses the playlists and the segments, and the picture stops. Nobody has to cut anyone off.

The viewer sets a limit for the night and can pause at any time. A lost reply asked for again isn't charged twice, and nothing is charged while the stream is off. Ticket holders and free shows get their tokens without paying. Prices are the artist's: an Online ticket, sats a minute, or free with comments and tips. Live video needs a browser with Media Source support: on iPhone, iOS 17.1 or later.

## A gig, from weeks out to the night

Most artists do all of this alone, so a gig is set up once, weeks or months ahead.

| Page | What it does |
|---|---|
| **1 · Gig Set Up** (`/setup`) | Artist, show name, page address, date, one start time, venue capacity. Ticket price in £ and sats (from a live rate, or the artist's own figure). Room tickets on or off, and **Scan at the door** (off unless the venue agrees): a private door link, and each ticket's QR scanned once. The live stream as an Online ticket, pay as you watch, free with comments and tips, or none. **Comments and moderators:** a pinned message, and up to five moderators, each with a private link and an icon. Stretch goals, photos, the live stream (a QR that sets up Larix, or the server and key for OBS) and an A4 poster whose QR opens the ticket page. The ticket page on a phone sits beside the form and follows every change. Once a ticket has sold, the artist's name and the address lock, as posters and saved links depend on them. |
| **2 · Show Time** (`/show`) | Three big buttons, only the next step lit: **Start the stream** (the public sees it from now; it opens by itself at the start time), **Start the show** (room phones change from the ticket to the picture), **End the night**. Before the start time the artist can stream a sound check: Show Time says "Your stream is reaching us" with a small preview, while the public sees a countdown and pays nothing. The view from home and the room's phone, with live chat and tips with a message. |
| **3 · Takings** (`/takings`) | Tickets sold; three steps to collect every payment into the artist's own wallet in one swap and send it on; what fans see at the end of the night. A finished gig clears itself when the next date is saved on Gig Set Up. |

**For the buyer** (the show's own address, e.g. `/longy`; no app, no account, no email): pay in sats, then a confirmation page with the receipt and **Save this link**, which brings the ticket back on any device. Tips, goals, chat and the wallet appear on the gig day. With Scan at the door on, the room ticket shows **Show at the door** on the gig day: a full-screen QR, then "You're in" by itself once scanned. Every amount reads in £, $ or ₿, the viewer's choice, and every payment is in sats.

**Moderators** open the gig page with their own link. They see the stream before it opens, free; chat; post links (guests can't); delete messages; and turn on slow mode (one message every 30 seconds for guests). The main mod can change the pinned message. A mod's link never opens Gig Set Up, Takings or the stream key.

## No custody

Every payment is locked to the key of whoever it's for (NUT-11 P2PK). The server checks each payment and never swaps it, so it never holds a sat.

- **Tickets, tips and every minute watched** are locked to the artist's key.
- **A first drink added to the ticket** (built, and off on every gig until after NutNovember) is locked to the bar's key, with a locktime at last orders and a refund to the artist, enforced by the mint.
- **The keys** are made in the artist's and the bar's own browsers. Only the public halves reach the server.

## NUTs used

| NUT | Where |
|---|---|
| 00–03 | Ecash notes the mint signs blind: it can't tell whose they are |
| 04 | Test sats in, over the test mint's pretend Lightning |
| 07 | "Spent yet?": how the bar knows a drink was poured, and how the phone shows the pint |
| 10 · 11 | Every payment locked to its owner's key; the drink with a locktime and a refund |
| 18 | Payment requests: the amount, the mint and the lock |
| 24 | HTTP 402: the ticket, every minute of the live stream, every 10 seconds of the recorded set, every tip |
| NIP-61 (next) | Nutzaps: the same locked tip, published on Nostr |

Built on [Coco](https://github.com/cashubtc/coco) (the wallet in the browser) and [cashu-ts](https://github.com/cashubtc/cashu-ts) (payment requests, locks and checks).

## Not wired up yet

Card payments (Stripe; the £ prices are shown, the card buttons do nothing), payouts of Show Splits (they are saved, **not paid out**), Nostr sign-in and nutzaps, and Send to Lightning (off on the test mint).

## Being worked on

Open while NutNovember runs (to 27 Nov 2026):

- Free, then paid: the first minutes of a stream free, then one tap to keep watching.
- The room ticket in Apple, Google and open wallets, holding only the door code.
- Judges read Longy's filled-in pages, view only, and join as a guest with test sats; passkey sign-in with a backup for the artist's key.
- A guide for fans to move leftover sats into their own wallet.
- Safari on one test iPhone refuses the browser wallet its storage (Brave on the same phone works): being traced.
- Saving a second show as a template (one gig at a time for now).
- The design of Show Time, the ticket and Takings pages; a desktop preview of the ticket page in setup.

## Known limits

- **While on the test mint, a live stream takes 10 viewers at once**, and a free stream runs for 3 hours, to keep the Cloudflare bill small. A ticket plays on one screen at a time; the newest screen takes over.
- **The artist's key lives only in the browser that opened Takings, with no backup yet.** Closing the browser loses nothing. Clearing site data, a private window, another device or Safari's 7 days without a visit do, and uncollected sats stay locked for good. Passkey sign-in with a sealed backup and a recovery code is planned, before any real gig on a real mint.
- **A ticket link is a key.** Anyone it's forwarded to holds the ticket. With Scan at the door on, it gets one person in, once.
- **A cancelled gig has no automatic refund:** payments are locked to the artist, who would refund people themselves. Nobody's contact details are kept, so buyers aren't told of a date change either; the artist announces it.
- **The test mint may reset** over months, and the charge below is the test mint's.
- **The test mint charges a fee** of 0.1 sat per coin, at least 1 sat per swap, which is a large share of a small payment. Mints set their own fees.
- **A token outlasts its payment,** as slack for a slow payment. A tampered page could pay less often, and a token could be shared until it runs out. Accepted for a test concept.

## Run it

The NutPub runs on Cloudflare's free plan: a Worker (`server/`), its state in D1 and the site's files as Worker assets. It never runs a mint: payments use a public test mint.

```bash
npm install
npx wrangler d1 create nutpub                           # once: put its id in wrangler.jsonc
npx wrangler kv namespace create PHOTOS                 # once: put its id in wrangler.jsonc
npx wrangler d1 execute nutpub --remote --file schema.sql
npx wrangler secret put ADMIN_KEY                       # the key the setup link carries; also in .env
npx wrangler secret put STREAM_ACCOUNT                  # Cloudflare account id, for live video
npx wrangler secret put STREAM_TOKEN                    # API token with Stream: Edit
npx wrangler secret put STREAM_KEY_ID                   # from POST /accounts/{id}/stream/keys: its id
npx wrangler secret put STREAM_KEY_JWK                  # and its jwk, kept as Stream returns it
npm run deploy                                          # build and publish
npm run setup                                           # opens the host's private setup link
SITE=https://thenutpub.com npm run check                # a phone's night from the command line
```

Live video needs a paid Stream plan: recorded live inputs need Stream's storage block ($5 a month for 1,000 minutes), and viewing costs $1 per 1,000 minutes. Everything else stays on the free plan.

`npm start` runs it locally (`wrangler dev`, http://localhost:8787) with ADMIN_KEY in `.dev.vars`. The recorded set is cut into 10-second pieces with `npm run cut-set -- <video>` (into `media/set/`, not in git) and ships with the site's files.

The hackathon version (btc++ Berlin, 1 to 2 Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. The font is Bebas Neue under the SIL Open Font License (`public/fonts/OFL.txt`).
