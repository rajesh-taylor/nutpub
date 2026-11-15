# The NutPub

**A gig paid for in Cashu ecash.** Fans buy a ticket, pay by the minute to watch the live stream, and tip the artist, all from a wallet in their browser. No app, no account, no email. A Refueler Labs concept, entered in [NutNovember](https://nutnovember.org).

**Live demo:** https://thenutpub.com

> **Test sats only.** The demo uses the public Cashu test mint (testnut.cashu.space). Its sats have no value.

## What it does

- **For the artist:** three pages. **Plan gig** sets up the night weeks ahead: venue tickets, Watch online or pay by the minute, prices, door scanner, moderators and poster, with a phone beside it showing what fans will see. **Show Time** runs the night with three buttons (Start stream, Start show, End night) and two previews of the fan's page, at home and on a phone. **Takings** shows what came in, with The NutPub's 5% on its own line, moves it to the artist's own Cashu wallet with one tap, and ends as a till receipt. **Your recordings** on Takings: each broadcast as an MP4 to download, or delete; Stream's copy goes after 7 days.
- **One gig page for every fan:** at the venue or at home, the same page. On a phone: the video on top, then **Chat · Tip · Ticket · Wallet**. Only the Ticket tab differs: a venue ticket holds the door QR and the free drink (and plays the video free, for anyone stuck at the back); at home it holds Watch online or the price a minute. On a laptop: the video with the chat beside it and the cards under it; full screen keeps one strip along the bottom (wallet, drink, tip, comment box) with the newest chat lines over the picture.
- **For the fan:** pay in sats, then save the ticket as a passkey in the phone's password manager. **Find my ticket** brings it back on a new phone. (On judges' stages there are no passkeys: the ticket stays in the browser.) At the door, the QR changes every 30 seconds, so a screenshot won't get in.
- **The 402 on live video:** the stream only plays with a short-lived signed token. Each minute the browser wallet pays an HTTP 402 (NUT-24) for the next token. If the fan stops paying, the picture stops. The artist can make the first minutes free.
- **Chat and tips:** a tip goes in the comment box: type your words, put sats in the box's own field, press Enter, and both arrive together. Over the video, the chat shows only the newest few lines (the artist picks 3, 5 or 10). With Nostr sign-in (a browser extension or a phone signer app), your name appears in the chat and you get one-tap Nutzaps. There's also a tippers screen for the venue's TV.
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

thenutpub.com opens on **Judge for yourself**: three gig posters, three separate ways artists get paid with Cashu ecash over HTTP 402. Best on a laptop with two tabs: the artist's pages and the fan's page. Have your phone ready for the doormen and the bar staff; with no phone, Show Time has **Let in by hand** and **Pour by hand**. Test sats only.

Each poster makes a stage of its own, at its own address (`<id>.thenutpub.com`) with its own database, holding just that gig, and opens it on **Plan gig** as the artist. No passkeys and no account: this browser remembers the stage, so the poster then says **Open again** (back where you left off) or **Start fresh**. Stages close themselves 7 days after they're made; Takings says when.

**Follow the Judges line.** Each of the artist's pages has one line at the top saying the next thing to do (Judges · 1 of 5 to 5 of 5): look at Plan gig, press Start show, open **Fan's page ↗**, End night once the fan's list is done, then Move and Finish gig on Takings. The fan's page has its own **Judges** list that ticks itself as you go; in full screen the next step sits on the picture.

1. **Longy** (start here): online only, one £20 ticket. Say hello in the chat (Aaron of Essex, his moderator, asks where everyone's watching from), go full screen and tip 30,000 sats there, then tip again under his stretch goal and watch it move.
2. **Frankie Peroni**: pay as you watch, 60 sats a minute (The Devils Train from The Fickle Pickle). Play, stop, play again, tip: you pay only for the minutes you watch. A £30 venue ticket is on sale too.
3. **At the venue**: Frankie's second night. A £30 venue ticket with the first drink in it; the doormen scan the ticket, the bar staff pour the drink. At home the stream is free, with tips. This is how most artists work today, so not everything here is a 402.

Every gig ends the same way: **End night** on Show Time, then **Takings**, **Move to Cashu.me** (it asks to add the test mint once: say yes). Takings then shows the night as a till receipt (each kind of takings, the 5%, what moved and the mint's fee); **Finish gig** stamps it PAID OUT and keeps it under Past gigs, and **Save receipt** prints it. Fans move their own leftover sats to Cashu.me from their wallet page. Each wallet page says whose it is: fan (and for which ticket), artist or bar. The clips play through the site's own player: nothing to install. Practice sets and streams stop after 20 minutes. Up to 50 stages at once until Sat 21 Nov, then 15.

### What each gig uses

All three: ecash from a Cashu mint (NUT-00 to 04), each payment locked to the artist's own key (NUT-11 P2PK), paid through HTTP 402 (NUT-24). The server checks each payment and can't spend it. Takings hands the artist one Cashu token (V4) for any wallet; Cashu.me receives it from the link alone.

- **Longy:** one 402 for the Watch online ticket; each tip is another 402, or a Nutzap signed with the fan's Nostr key (NIP-61; sign-in by NIP-07 or NIP-46, encrypted with NIP-44). The stretch goal fills from the tips.
- **Frankie:** the video comes in 10-second pieces; each answers 402 until the browser pays 10 sats for it. A live stream works the same way, a minute at a time, with a short-lived signed token.
- **At the venue:** the ticket is a 402; its door QR changes every 30 seconds (TOTP), so a screenshot won't get in. The first drink is locked to the bar's key until last orders, then falls back to the artist (a NUT-11 locktime); the mint enforces it, and the fan's phone sees it spent (NUT-07).

## Coming before 27 Nov

- Tickets the NutPub can't link to their buyer (blind-signed).
- A guide to pricing for each kind of streamer.

## Known limits

- The artist's key lives in one browser, with no backup yet. A passkey-sealed backup is planned.
- Put on a gig (a stage of your own, sealed with a passkey) is built but off the home page until after 27 Nov: judges use the three posters.
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
