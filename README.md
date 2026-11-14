# The NutPub

**A gig paid for in Cashu ecash.** Fans buy a ticket, pay by the minute to watch the live stream, and tip the artist, all from a wallet in their browser. No app, no account, no email. A Refueler Labs concept, entered in [NutNovember](https://nutnovember.org).

**Live demo:** https://thenutpub.com

> **Test sats only.** The demo uses the public Cashu test mint (testnut.cashu.space). Its sats have no value.

## What it does

- **For the artist:** three pages. **Plan gig** sets up the night weeks ahead: room, stream or both, prices, door scanner, moderators and poster. **Show Time** runs the night with three buttons: Start stream, Start show, End night. **Takings** shows what came in, with The NutPub's 5% on its own line, and moves it to the artist's own Cashu wallet with one tap.
- **For the fan:** pay in sats, then save the ticket as a passkey in the phone's password manager. **Find my ticket** brings it back on a new phone. At the door, the QR changes every 30 seconds, so a screenshot won't get in.
- **The 402 on live video:** the stream only plays with a short-lived signed token. Each minute the browser wallet pays an HTTP 402 (NUT-24) for the next token. If the fan stops paying, the picture stops. The artist can make the first minutes free.
- **Chat and tips:** with Nostr sign-in (a browser extension or a phone signer app), your name appears in the chat and you get one-tap Nutzaps. There's also a tippers screen for the venue's TV.
- **Nothing about the buyer:** no name, email or address. Everything from the night is deleted after 7 days, except one line of totals.

## No custody

Every payment is locked to the key of the person it's for (NUT-11 P2PK). The server checks each payment but never swaps it, so it never holds a sat. The keys are made in the artist's own browser.

| NUT / NIP | Used for |
|---|---|
| 00–04 | Blind-signed ecash; test sats in |
| 07 | Checking whether a note is spent |
| 10 · 11 | Locking each payment to its owner |
| 18 | Payment requests |
| 24 | HTTP 402: tickets, each minute of video, tips |
| NIP-07 · 46 · 44 · 98 | Nostr sign-in, from an extension or a signer app |
| NIP-61 | Nutzaps |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts).

## Put on a gig

One button on the home page gives anyone a stage of their own, at its own address (`<id>.thenutpub.com`) with its own database, sealed with a passkey: no email, no account. **Back to your stage** finds it again on any device the passkey syncs to. Judges come in the same way as any artist. Longy's real night stays at thenutpub.com/longy.

## Coming before 27 Nov

- Two practice gigs ready on each stage, a test fan, crew passes and a guided move to Cashu.me.
- Tickets the NutPub can't link to their buyer (blind-signed).
- A calmer gig page on phones.

## Known limits

- The artist's key lives in one browser, with no backup yet. A passkey-sealed backup is planned.
- On the test mint, a stream takes 10 viewers at a time.
- Card payments and Show Splits payouts aren't wired up yet.

## Run it

It runs on a Cloudflare Worker on the free plan: Longy's stage in D1, every other stage in a SQLite Durable Object of its own, reached through a proxied wildcard DNS record (`*`). Live video uses Cloudflare Stream, which is paid. The NutPub never runs a mint.

```bash
npm install
npx wrangler d1 execute nutpub --remote --file schema.sql   # after creating D1 and KV; ids in wrangler.jsonc
npm test
npm start                                                     # local, http://localhost:8787
npm run deploy
```

Secrets (`ADMIN_KEY`, Stream, wallet cards) are set with `npx wrangler secret put`; see `wrangler.jsonc`. The hackathon version (btc++ Berlin, Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. Font: Bebas Neue, SIL Open Font License (`public/fonts/OFL.txt`).
