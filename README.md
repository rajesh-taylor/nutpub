# The NutPub

**A gig paid for in Cashu ecash.** A value-for-value (V4V) and privacy hackathon project: fans buy a ticket at the door, get a free first drink, tip the band and watch the livestream, all from a wallet in their phone's browser. No app, no account, no email.

**Live demo:** https://nutpub.refueler.io (test mint, online during demos)

> **Test only.** The demo runs on the NutPub Test Mint: cdk-mintd with a fake Lightning wallet. Its sats have no value, and it can't pay a real invoice.

## The night, in three pages

| Page | What it does |
|---|---|
| **1 · Show setup** (`/setup`) | The artist sets up the gig: the event, the ticket price, an optional free first drink added to the ticket, tips, stretch goals, watching at home, the livestream's server and key, and an A4 gig poster whose QR opens the ticket page. The attendee's phone sits beside the form and follows every change. |
| **2 · The show** (`/show`) | The host's doors, Start the show (three stage lights, then the set) and End the night. The view from home: the set plays like a live stream, with live chat and tips with a message. The bar pours drinks; the attendee's phone shows the pint. |
| **3 · Takings** (`/takings`) | The artist's and the bar's takings side by side: Collect, Pour ("Already poured, mate" on a second try), Send to another wallet, and where every sat went. |

The attendee's page is the show's own address (e.g. `/longy`): ticket, welcome, free-drink QR, the set, chat and tips.

## No custody

Every payment is locked to the key of whoever it's for (NUT-11 P2PK). The server checks each payment and never swaps it, so it never holds a sat.

- **A ticket** is the artist's part, locked to the artist's key. With the free drink on, a second payment is locked to the bar's key, with a locktime at last orders and a refund to the artist: a drink nobody poured becomes the artist's, and the mint enforces it.
- **Tips, and every 10 seconds watched from home**, are locked to the artist's key.
- **The keys** are made in the artist's and the bar's own browsers. Only the public halves reach the server.

## NUTs used

| NUT | Where |
|---|---|
| 00–03 | Ecash notes the mint signs blind: it can't tell whose they are |
| 04 | Test sats in, over the test mint's pretend Lightning |
| 07 | "Spent yet?": how the bar knows a drink was poured, and how the phone shows the pint |
| 10 · 11 | Every payment locked to its owner's key; the drink with a locktime and a refund |
| 12 | The mint's signature checked offline (DLEQ) |
| 18 | Payment requests: the amount, the mint and the lock |
| 24 | HTTP 402: the ticket, every 10 seconds at home, every tip |
| NIP-61 (next) | Nutzaps: the same locked tip, published on Nostr |

Built on [Coco](https://github.com/cashubtc/coco) (the wallet in the browser) and [cashu-ts](https://github.com/cashubtc/cashu-ts) (payment requests, locks and DLEQ checks).

## Not wired up yet

Card payments (Stripe), Nostr sign-in and nutzaps, playback of a live OBS stream (the show plays a recorded set), Send to Lightning (off on the test mint), and the venue host's setup.

## Run it

Needs Node 24 or newer (for `node:sqlite`) and [cdk-mintd](https://github.com/cashubtc/cdk) 0.18.1 on the `PATH`. `cloudflared` only if you want a public address.

```bash
npm install
cp .env.example .env   # optional: tunnel hostnames
npm start              # the test mint, the server and the tunnel; Ctrl-C stops them all
npm run setup          # opens the host's private setup link
npm run check          # a phone's night from the command line
```

Open http://localhost:8787. All state lives in `data/` (SQLite for the server, `data/mint/` for the mint), so a restart loses nothing. Logs: `data/logs/`.

With a Cloudflare named tunnel, set `TUNNEL`, `SITE_HOST` and `MINT_HOST` in `.env` and route both hostnames to it once (`cloudflared tunnel route dns <tunnel> <host>`). The mint needs its own public hostname: its URL is written into every token, so phones must be able to reach it.

The hackathon version (btc++ Berlin, 1 to 2 Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. The font is Bebas Neue under the SIL Open Font License (`public/fonts/OFL.txt`).
