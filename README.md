# The NutPub

**A gig paid for in Cashu ecash.** Fans buy a ticket, pay by the minute to watch the live stream, and tip the artist, all from a wallet in their browser. No app, no account, no email. A Refueler Labs concept, entered in [NutNovember](https://nutnovember.org).

**Live demo:** https://thenutpub.com

> **Test sats only.** The demo uses the public Cashu test mint (testnut.cashu.space). Its sats have no value.

## What it does

- **For the artist:** three pages. **Plan gig** sets up the night weeks ahead: venue tickets, Watch online or pay by the minute, prices, door scanner, moderators and poster. **Show Time** runs the night with three buttons: Start stream, Start show, End night. **Takings** shows what came in, with The NutPub's 5% on its own line, and moves it to the artist's own Cashu wallet with one tap.
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

## Judge for yourself

One button on the home page (**Judge for yourself**, under "Put on a gig") gives anyone a stage of their own, at its own address (`<id>.thenutpub.com`) with its own database, sealed with a passkey: no email, no account. **Back to your stage** finds it again on any device the passkey syncs to. Judges come in the same way as any artist. Longy's real night stays at thenutpub.com/longy.

Each new stage opens on a setlist, best on a laptop with two tabs: the artist in one, the fan in the other.

1. **Longy** (filled in): venue tickets and a flat-fee Watch online ticket. As the fan, buy one and say hello in the chat.
2. **Frankie Peroni** (filled in): venue tickets and the stream at 60 sats a minute, his song The Devils Train from The Fickle Pickle. Watch a minute, then tip in the comments.
3. **Your gig**: your own prices and stretch goal (coming next).

Each gig ends the same way: **End night** on Show Time, then **Takings**, **Move to Cashu.me** (it asks to add the test mint once: say yes), then **Finish gig**, which ticks it off. The clips play through the site's own player, paid 10 seconds at a time: nothing to install. Practice sets and streams stop after 20 minutes.

## Coming before 27 Nov

- Your own gig with hints, the door QR and a first drink, crew passes, and a receipt at the end.
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

The example clips and photos aren't in the repo: cut a video into 10-second pieces with `scripts/cut-set.sh <video> [name]` (into `media/`) and put photos in `public/img/`. Secrets (`ADMIN_KEY`, Stream, wallet cards) are set with `npx wrangler secret put`; see `wrangler.jsonc`. The hackathon version (btc++ Berlin, Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

## Licence

Apache-2.0. Font: Bebas Neue, SIL Open Font License (`public/fonts/OFL.txt`).
