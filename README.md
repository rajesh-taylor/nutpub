# The NutPub

**A gig paid for in Cashu ecash.** A Refueler Labs concept, from a value-for-value (V4V) and privacy hackathon project, now entered in [NutNovember](https://nutnovember.org): fans buy a room or online ticket, or pay as they watch the live stream, and tip the band, all from a wallet in their browser. No app, no account, no email.

**Live demo:** https://thenutpub.com (test mint, test sats only)

> **Test only.** The demo runs on the public Cashu test mint (testnut.cashu.space): a fake Lightning wallet. Its sats have no value, and it can't pay a real invoice.

## New this week (10–13 Nov)

- **Takings in plain words (13 Nov).** Sats first, with a ₿ / £ / $ / € switch beside the total. What came in shows as Tickets, Tips, Watching from home and Unpoured drinks (only when the first drink is on), with **The NutPub's 5%** as its own line: one setting (`FEE_PERCENT` in `wrangler.jsonc`), not taken on the test mint. One button, **Move to my own wallet**, collects every payment and makes one code; **Copy** and **Open my wallet app** follow, and the page asks the mint every few seconds and says "In your wallet." once your wallet has it: nothing to press. A Card box is kept for Stripe.
- **When it's all moved, Takings says so (13 Nov).** "✓ In your wallet" sits under the total, so nobody thinks the money is still there, and **Finish gig** sits beside it once the night is over: it keeps the gig's one line of totals and opens Plan gig for the next one, same settings. **Past gigs** lists each finished gig with **Receipt** (the phone's own print sheet: Save as PDF) and **Delete**, which asks first and never touches money.
- **Plan gig's door, in plain words (13 Nov).** Ticketing has fans at home on the left and the room on the right: the room ticket's price, then **Scan tickets at the door** with three numbered steps (the ticket's QR changes every 30 seconds; the door phone opens the door scanner; green means in, once per ticket) and the door phone's QR and link.
- **Show Time says where you are (13 Nov).** The three buttons change as the night goes: "✓ Stream on", "The show is on" (lit), "End night"; one line under them says since when ("The show is on, since 19:05 · stream on since 18:50 · streaming for 1 h 20 min"). Shorter words on a phone, one line each.
- **Sign in on your phone (13 Nov).** Plan gig, signed in on a laptop, shows a QR with a one-time code (5 minutes, once, only the newest): the phone's camera signs it in, so Show Time and Takings run from the phone. The setup link itself is never on screen.
- **€ beside £ and $** on the gig page and Takings (₿ first): amounts and tips in your own money, always paid in sats.
- **One passkey per ticket (13 Nov).** Saving a ticket again replaces the phone's entry rather than adding a second one, so a save the server missed can't leave a dead entry behind; a cancelled save stays on the first screen with "Not saved yet · try again".
- **A ticket you can't lose, with no email or account.** Straight after paying, one button saves the ticket as a passkey in the phone's password manager (iCloud Keychain, Google, Proton Pass, Bitwarden, KeePassDX; a YubiKey or Nitrokey works too). **Find my ticket** brings it back after the browser's data is cleared, or on a new phone.
- **A door QR that can't be copied.** The ticket page's QR changes every 30 seconds, worked out on the phone with no signal needed, so a screenshot gets "Old QR" at the door. Once a ticket has a passkey, the QR only appears after the passkey check, so a forwarded ticket link can't get anyone in.
- **One thing at a time.** Until a fan is in, the artist's photo fills the top of the phone, with the artist, the date and the venue under it and one button: **Save ticket to your phone's passwords**, then on the night **Show at the door**. Saved weeks ahead, the page says when the door QR appears and to bookmark the gig's address. Tips, goals and chat come once they're in.
- **The Door scanner.** The artist turns any phone into the door's scanner with one QR; each ticket gets in once.
- **Plan gig by kind of night** (room only, room + live stream, live stream only), with a "Still to fill in" box that turns green when the gig is ready.
- **Wallet cards, built and held back.** Apple and Google Wallet cards work, but a card that looks like a ticket and can't open the door would confuse people (Apple doesn't let us change a card's code). They come back when they can be a real way in.
- **Nothing about the buyer.** No name, email or address is asked for or kept: the NutPub holds the ticket and its passkey's public key, nothing about the person. Next: blind-signed tickets, so not even the NutPub can link who paid to who came in.
- **Gone after 7 days.** The night's recording, tickets, passkeys, chat and tips are deleted 7 days after the gig; the fans' Cheers screen and the artist's Show Time say so. Sats the artist hasn't collected stay until they take them. One line of totals per gig is kept (tickets, sats, tips), nothing about anyone.
- **The room's tippers screen** (`/longy/screen`, linked from Show Time): for the venue's TV. A big QR, "Scan to tip Longy", tonight's top three tippers, the chat as it comes in (handle · sats · words; a mod's delete takes it off), and the stretch goals along the bottom.
- **Pub Menu** ([thenutpub.com/menu](https://thenutpub.com/menu), from the peanut menu on the home page): what each part of the night is made of, the NUTs and NIPs as the prices, with Coco and cashu-ts behind the bar.
- **Your Nostr name in the chat.** **Nostr Sign In**, the purple button at the top of Live chat, puts your Nostr name in place of "guest 3f2a", in the chat and on the tippers screen. With a Nostr browser extension (Alby, nos2x) it signs straight in; without one, a QR on a computer or **Open my signer app** on a phone (Amber, nsec.app): scan it from inside the app, not the phone's camera. Your secret key never leaves the extension or app. No account or password: it signs one note for thenutpub.com, and the name comes from your own signed Nostr profile, both checked by the NutPub, so nobody can borrow a name. Kept for the night only.
- **Nutzaps:** once signed in with Nostr, up to three one-tap buttons under the comment box (⚡ 21 · ⚡ 210 · ⚡ 2,100 sats by default; the artist sets the amounts and emoji on Plan gig). Paid from your browser wallet, locked to the artist like any tip, and signed as a public note with your Nostr name: in the chat and on the tippers screen with a purple Nutzap tag, posted on Nostr, counted in Takings and collected there. Tip stays anonymous; a Nutzap is public. Always on: the artist's pages send their "Nutzap me here" note by themselves.
- **Widgets on Show Time:** links for the venue's screens, starting with **Chat & Big Time Charlies** (the tippers screen), each with a copy button.
- **One gig at a time per artist.** A night's records are deleted 7 days after it, or sooner when the artist starts their next gig.

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
| **2 · Show Time** (`/show`) | Three big buttons that say where you are (done ones ticked, the current one lit, only the next one to press), with one line of times under them: **Start stream** (the public sees it from now; it opens by itself at the start time), **Start show** (room phones change from the ticket to the picture), **End night**. Before the start time the artist can stream a sound check: Show Time says "Your stream is reaching us" with a small preview, while the public sees a countdown and pays nothing. The view from home and the room's phone, with live chat and tips with a message. |
| **3 · Takings** (`/takings`) | The gig's total in sats (or £, $, €), what came in by tickets, tips, watching from home and unpoured drinks, and The NutPub's 5% as its own line. **Move to my own wallet**: one tap collects every payment locked to the artist (the mint is asked once which are already in, then a few big swaps, saving after each, so leaving halfway loses nothing) and makes one code for any Cashu wallet; the page sees it land by itself. If the artist's key is in another browser, Takings says so and asks before using this one. Once everything's moved it says "✓ In your wallet" beside the total; once the night is over, **Finish gig** keeps the gig's totals and clears it for the next one, same settings. **Past gigs** below, each with Receipt (Save as PDF) and Delete (asks first). A Card box waits for Stripe. |

**For the buyer** (the show's own address, e.g. `/longy`; no app, no account, no email): pay in sats, then one screen: the photo, then the artist, the date and the venue, and one button, **Save ticket to your phone's passwords**: a passkey kept by the phone's password manager (iCloud Keychain, Google, Proton Pass, Bitwarden, KeePassDX; a YubiKey or Nitrokey works too). **Find my ticket**, beside Ticket, brings the ticket back after the browser's data is cleared, or on a new phone. Saved ahead of the night, it lists what happens next: the door QR appears here on the day; bookmark the gig's address on this phone. On the night: the photo, "Tonight", the venue and **Show at the door**, with "Open before you go in for door staff." under it. Tips, goals, chat and the wallet come once they're in. Show at the door opens the QR in the middle of the screen, with the artist, "Tonight" and the venue above it, a bar that empties with the 30 seconds and "Do not screenshot it" under it, then "You're in" by itself once scanned. **The QR changes every 30 seconds** (an RFC 6238 time code, worked out on the phone with WebCrypto, no signal needed once the page is open; a peanut, a mic and a beer in the middle), so a screenshot or a forwarded copy gets "Old QR" at the door. The door takes a code from the last minute, then scans each ticket once. **Once a ticket has a passkey, the QR's secret goes only to a browser that has just passed its check** (once per browser, then it works offline), so a forwarded ticket link can't open the door QR. Phones that can't make a passkey keep **Save this link** instead. **Wallet cards are held back from fans** (built and working, `server/pass.js`, `server/gwallet.js`): people take a Wallet card for the ticket, and ours can't get anyone in, as Apple doesn't let us change a card's code. Every amount reads in ₿, £, $ or €, the viewer's choice, and every payment is in sats.

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
| NIP-07 · NIP-98 | Nostr sign-in for the chat: the browser extension signs one note for this site |
| NIP-46 · NIP-44 | Nostr Connect: a phone's signer app signs instead, every message between them encrypted (nostr-tools, the audited NIP-44; the spec's own test answers in `test/nip44.test.js`) |
| NIP-61 | Nutzaps: the same locked tip, signed as a public note with your Nostr name |

Built on [Coco](https://github.com/cashubtc/coco) (the wallet in the browser) and [cashu-ts](https://github.com/cashubtc/cashu-ts) (payment requests, locks and checks).

## Not wired up yet

Card payments (Stripe; the £ prices are shown, the card buttons do nothing), payouts of Show Splits (they are saved, **not paid out**), a Nutzap of your own amount, and Send to Lightning (off on the test mint).

## Being worked on

Open while NutNovember runs (to 27 Nov 2026):

- **The gig page on a phone (designed 12 Nov, built 16–17 Nov):** four tabs under the player (Chat · Tip · Ticket · Wallet), a calm chat like YouTube's on a phone, a quick tip from the ₿ in the comment box, and a pint-glass Menu. The ticket screens are done. Nostr Wallet Connect (paying from your own Lightning wallet) comes after 27 Nov, with a real mint. (Nostr Connect, Nutzaps, Pub Menu, Nostr sign-in, closing the gig, the tippers screen, passkey tickets and the 30-second door QR are done.)
- **Tickets the NutPub can't link to their buyer:** a ticket signed blind (NUT-00), so the door's check can't be tied to who paid.
- **The front door (designed 13 Nov, built 14–15 Nov):** one button on the home page, **Put on a gig** ("Test sats only. Have a go."), sealed with a passkey, gives anyone a stage of their own (its own storage, on Cloudflare's free plan). A welcome screen, then two practice gigs (stream only; in the room and streamed, with the door QR and a free first drink), a test fan to buy a ticket and tip, and Longy's real night at Peggy Sue's to look at but not change. Crew passes (mod, door, bar) to open on a second phone, and a guided ending: move the sats to Cashu.me, receipt, Finish gig, Start over. Judges come in the same way as any artist; practice stages delete themselves after 7 days. After 27 Nov the same button is artist sign-up.
- A backup for the artist's Takings key, sealed with the passkey.
- A guide for fans to move leftover sats into their own wallet.
- Saving a second show as a template; more than one gig planned at a time (one gig at a time for now).
- **Artist sign-in with a passkey**, synced by the phone's password manager, so a new phone or laptop just works and there's no link to keep; then a sealed backup of the Takings key.
- Currency in the top-right Menu; more widgets for the venue's screens beside Chat & Big Time Charlies.

## Known limits

- **While on the test mint, a live stream takes 10 viewers at once**, and a free stream runs for 3 hours, to keep the Cloudflare bill small. A ticket plays on one screen at a time; the newest screen takes over.
- **The artist's key lives only in the browser that opened Takings, with no backup yet** (another browser can take over for new payments, after a warning; money already locked stays with the first). Closing the browser loses nothing. Clearing site data, a private window, another device or Safari's 7 days without a visit do, and uncollected sats stay locked for good. Passkey sign-in with a sealed backup and a recovery code is planned, before any real gig on a real mint.
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

Closing the gig (`server/closing.js`, `test/closing.test.js`): a daily cron on the Worker (04:00 UTC, free plan) deletes each recording 7 days after it was made (Stream's own `deleteRecordingAfterDays` can't go below 30, kept as a backstop), and the night's records 7 days after End night, or after the gig's date if End night wasn't pressed. Uncollected payments (`locked`, sealed to the artist's key) are never deleted.

Passkeys (`server/passkey.js`, `client/passkey.js`) are checked on the Worker with WebCrypto only (ES256, Ed25519, RS256); challenges are signed, not stored, and only used ones are written down. `npm test` covers every wrong check and a frozen known answer. The passkey's user handle is 32 random bytes made on the phone and never sent: the seed for the blind-signed ticket to come.

The wallet card is signed on the Worker with WebCrypto (`server/pass.js`, about 4 ms of CPU; a CMS library took 5 to 50 ms, over the free plan's 10). `npm test` checks the signature against pkijs, OpenSSL and a known answer, with a test-only stand-in key. The Google Wallet link is a JWT signed RS256 with WebCrypto (`server/gwallet.js`, 1 to 3 ms); its test checks the signature with Node's crypto.

Live video needs a paid Stream plan: recorded live inputs need Stream's storage block ($5 a month for 1,000 minutes), and viewing costs $1 per 1,000 minutes. Everything else stays on the free plan.

`npm start` runs it locally (`wrangler dev`, http://localhost:8787) with ADMIN_KEY in `.dev.vars`. The recorded set is cut into 10-second pieces with `npm run cut-set -- <video>` (into `media/set/`, not in git) and ships with the site's files.

The hackathon version (btc++ Berlin, 1 to 2 Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. The font is Bebas Neue under the SIL Open Font License (`public/fonts/OFL.txt`).
