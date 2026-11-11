# The NutPub

**A gig paid for in Cashu ecash.** A Refueler Labs concept, from a value-for-value (V4V) and privacy hackathon project, now entered in [NutNovember](https://nutnovember.org): fans buy a room or online ticket, or pay as they watch the live stream, and tip the band, all from a wallet in their browser. No app, no account, no email.

**Live demo:** https://thenutpub.com (test mint, test sats only)

> **Test only.** The demo runs on the public Cashu test mint (testnut.cashu.space): a fake Lightning wallet. Its sats have no value, and it can't pay a real invoice.

## The 402 on live video

An artist streams from a phone (Larix Broadcaster) or a laptop (OBS) to Cloudflare Stream. The plain video link is refused: the picture only plays with a signed token.

1. The viewer presses play. The site answers with an HTTP 402, and the wallet in their browser pays it (NUT-24).
2. The reply carries a short-lived token, signed by the site, good for the minute paid for plus a little slack. The next minute's payment brings a new one, and hls.js puts the newest token in every playlist request.
3. Stop paying and the token runs out: Stream refuses the playlists and the segments, and the picture stops. Nobody has to cut anyone off.

The viewer sets a limit for the night and can pause at any time. A lost reply asked for again isn't charged twice, and nothing is charged while the stream is off. Ticket holders and free shows get their tokens without paying. Prices are the artist's: an Online ticket, sats a minute, or free with comments and tips. **Free, then paid:** with sats a minute, the artist can make the first minutes free (up to 30). The free clock starts when the stream is first on air and public, so a late start costs nobody free time. When it ends, the picture stops under one **Keep watching** button: nobody's wallet pays until they tap it. Live video needs a browser with Media Source support: on iPhone, iOS 17.1 or later.

## A gig, from weeks out to the night

Most artists do all of this alone, so a gig is set up once, weeks or months ahead.

| Page | What it does |
|---|---|
| **1 · Plan gig** (`/setup`) | A box at the top lists what's still to fill in, and turns green when the gig is ready to go live. Artist, the venue's name and address (shown on the wallet card), page address, date, one start time, venue capacity. **Ticketing**, in the order an artist decides: what kind of night (Room only, Room + live stream, Live stream only); the prices in £ and sats (from a live rate, or the artist's own figure), the stream as an Online ticket, pay as you watch, or free with comments and tips; then **Door entry**: Scan at the door (off unless the venue agrees) and the **Door scanner**, a QR the door person's phone camera scans once (or a private link) to turn it into the scanner. **Comments and moderators:** a pinned message, and up to five moderators, each with a private link and an icon. Stretch goals, photos, the live stream (a QR that sets up Larix, or the server and key for OBS) and an A4 poster whose QR opens the ticket page. The ticket page on a phone sits beside the form and follows every change. Once a ticket has sold, the artist's name and the address lock, as posters and saved links depend on them. |
| **2 · Show Time** (`/show`) | Three big buttons, only the next step lit: **Start stream** (the public sees it from now; it opens by itself at the start time), **Start show** (room phones change from the ticket to the picture), **End night**. Before the start time the artist can stream a sound check: Show Time says "Your stream is reaching us" with a small preview, while the public sees a countdown and pays nothing. The view from home and the room's phone, with live chat and tips with a message. |
| **3 · Takings** (`/takings`) | Tickets sold; three steps to collect every payment into the artist's own wallet and send it on. **Collect** asks the mint once which payments are already in, then takes the rest in a few big swaps, saving after each, so leaving the page halfway loses nothing (about 100 payments in seconds). Once a gig is over, **Next gig** on Plan gig clears it in one tap and keeps every setting; collecting can wait. |

**For the buyer** (the show's own address, e.g. `/longy`; no app, no account, no email): pay in sats, then one screen with one button, **Press to save ticket now**: a passkey kept by the phone's password manager (iCloud Keychain, Google, Proton Pass, Bitwarden, KeePassDX; a YubiKey or Nitrokey works too). **Find my ticket**, beside Ticket, brings the ticket back after the browser's data is cleared, or on a new phone. Until the fan is in, the page shows only the photo, the name and one button: then **Show at door on the night**, with "Your ticket lives at thenutpub.com/longy" under it. Tips, goals, chat and the wallet come once they're in. Show at the door opens a full-screen QR with the artist, the date and the gig's address, then "You're in" by itself once scanned. **The QR changes every 30 seconds** (an RFC 6238 time code, worked out on the phone with WebCrypto, no signal needed once the page is open; a peanut, a mic and a beer in the middle), so a screenshot or a forwarded copy gets "Old QR" at the door. The door takes a code from the last minute, then scans each ticket once. **Once a ticket has a passkey, the QR's secret goes only to a browser that has just passed its check** (once per browser, then it works offline), so a forwarded ticket link can't open the door QR. Phones that can't make a passkey keep **Save this link** instead. **Wallet cards are held back from fans** (built and working, `server/pass.js`, `server/gwallet.js`): people take a Wallet card for the ticket, and ours can't get anyone in, as Apple doesn't let us change a card's code. Every amount reads in £, $ or ₿, the viewer's choice, and every payment is in sats.

**Moderators** open the gig page with their own link. They see the stream before it opens, free; chat; post links (guests can't); delete messages; and turn on slow mode (one message every 30 seconds for guests). The main mod can change the pinned message. A mod's link never opens Plan gig, Takings or the stream key.

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

- **Closing the gig:** the recording kept 7 days, records deleted after 7 days; the room's tippers screen. (Passkeys for tickets and the 30-second door QR are done.)
- **Tickets the NutPub can't link to their buyer:** a ticket signed blind (NUT-00), so the door's check can't be tied to who paid.
- Each judge with their own numbered show (`/judge-1` to `/judge-20`), no names asked.
- Judges read Longy's filled-in pages, view only, and join as a guest with test sats; passkey sign-in with a backup for the artist's key.
- A guide for fans to move leftover sats into their own wallet.
- Saving a second show as a template; more than one gig planned at a time (one gig at a time for now).
- The design of Show Time, the ticket and Takings pages; a desktop preview of the ticket page in setup.

## Known limits

- **While on the test mint, a live stream takes 10 viewers at once**, and a free stream runs for 3 hours, to keep the Cloudflare bill small. A ticket plays on one screen at a time; the newest screen takes over.
- **The artist's key lives only in the browser that opened Takings, with no backup yet.** Closing the browser loses nothing. Clearing site data, a private window, another device or Safari's 7 days without a visit do, and uncollected sats stay locked for good. Passkey sign-in with a sealed backup and a recovery code is planned, before any real gig on a real mint.
- **Safari with Block All Cookies on** (Settings → Apps → Safari → Advanced) gives sites no storage, so the browser wallet can't open. The page says so and how to turn it off; other browsers work.
- **One ticket per browser.** A fan buying for friends needs a phone each; each ticket gets its own passkey, all named alike. Tickets for friends come after 27 Nov. Passkeys don't move between Apple and Google: a fan switching from iPhone to Android needs a password manager on both (Proton Pass, Bitwarden).
- **A venue with no signal** (a basement): the ticket page needs signal to open. Once open, its QR runs offline; the wallet card says to open the page before going in and keep it open. A better answer comes after 27 Nov.
- **One Cloudflare rate-limit rule** (the free plan's one): over 1,000 requests to `/api/` in 10 seconds from one address is blocked for 10 seconds. Set high, as a venue's Wi-Fi shares one address; it stops a runaway script, not a determined attacker.
- **A ticket kept only in the browser** is lost when the browser's data is cleared: save the ticket link, or add the card to a wallet.
- **Wallet cards that update** (a new venue or time) and a reminder a day or two before come after 27 Nov. A Worker on the free plan reaches Apple's push service (checked 11 Nov).
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
npx wrangler secret put PASS_KEY                        # wallet card: the Pass Type ID's private key, PKCS#8 PEM
npx wrangler secret put PASS_CERT                       # and its certificate from Apple, PEM (PASS_TYPE, PASS_TEAM in wrangler.jsonc)
npx wrangler secret put GWALLET_KEY                     # Google Wallet: the service account's private key, PEM (GWALLET_ISSUER, GWALLET_EMAIL in wrangler.jsonc)
npm run deploy                                          # build and publish
npm run setup                                           # opens the host's private setup link
SITE=https://thenutpub.com npm run check                # a phone's night from the command line
```

Passkeys (`server/passkey.js`, `client/passkey.js`) are checked on the Worker with WebCrypto only (ES256, Ed25519, RS256); challenges are signed, not stored, and only used ones are written down. `npm test` covers every wrong check and a frozen known answer. The passkey's user handle is 32 random bytes made on the phone and never sent: the seed for the blind-signed ticket to come.

The wallet card is signed on the Worker with WebCrypto (`server/pass.js`, about 4 ms of CPU; a CMS library took 5 to 50 ms, over the free plan's 10). `npm test` checks the signature against pkijs, OpenSSL and a known answer, with a test-only stand-in key. The Google Wallet link is a JWT signed RS256 with WebCrypto (`server/gwallet.js`, 1 to 3 ms); its test checks the signature with Node's crypto.

Live video needs a paid Stream plan: recorded live inputs need Stream's storage block ($5 a month for 1,000 minutes), and viewing costs $1 per 1,000 minutes. Everything else stays on the free plan.

`npm start` runs it locally (`wrangler dev`, http://localhost:8787) with ADMIN_KEY in `.dev.vars`. The recorded set is cut into 10-second pieces with `npm run cut-set -- <video>` (into `media/set/`, not in git) and ships with the site's files.

The hackathon version (btc++ Berlin, 1 to 2 Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. The font is Bebas Neue under the SIL Open Font License (`public/fonts/OFL.txt`).
