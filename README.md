# The NutPub

**Ticketing, live streaming and tips for live music, paid in Cashu ecash over HTTP 402.**

Fans buy a ticket, get let in at the door, collect a drink at the bar, watch the stream, tip the artist and watch the replay, all from a wallet in their browser. No app to install, no account, no email address. Every payment is locked to the key of whoever it's for, so the server verifies payments but cannot spend them.

A [Refueler Labs](https://refueler.io) project, entered in [NutNovember](https://nutnovember.org) 2026.

**Live demo:** [thenutpub.com](https://thenutpub.com) · laptop recommended, phone optional

> **Test mint · test sats.** The demo runs on the public Cashu test mint (`testnut.cashu.space`). Its sats have no value.

---

## Contents

- [Try it: three gigs](#try-it-three-gigs)
- [Features](#features)
- [How payments work](#how-payments-work)
- [Architecture](#architecture)
- [Run it yourself](#run-it-yourself)
- [Status and known limits](#status-and-known-limits)
- [Coming next](#coming-next-27-nov--11-dec)
- [Licence](#licence)

---

## Try it: three gigs

The home page shows three gig posters. Each one opens a private practice stage of its own (`<id>.thenutpub.com`, with its own database) on **1 · Plan your gig**, as the artist. A **Judges** line at the top of every page tells one line of the story and the one thing to do next; you press the artist's own buttons and tabs. Run them in order: each builds on the one before.

| | Gig | You'll see | Device |
|---|---|---|---|
| 1 | **Longy, online** | A £20 Watch online ticket (one 402), the live chat with a moderator, tips with comments in full screen, a stretch goal filling up, and the venue's TV page | Laptop |
| 2 | **Frankie Peroni, pay as you watch** | Paste his Fountain link as the chat's pinned message. Then 60 sats a minute: each 10-second piece answers 402 until the browser wallet pays for it (open the Network tab to see the 402, then the paid 200). Stop and nothing more is charged. Then the fan's leftover sats go home to their own wallet | Laptop |
| 3 | **The night at the venue: Longy at The Fickle Pickle** | A £35 venue ticket with a £5 beer token included, blind-signed so not even the NutPub can tell who came in; saved as a passkey if you like; a 30-second door QR scanned by your own phone as the doormen's list; the beer token handed over as an animated QR and poured by the bar | Laptop, phone optional |

Every gig ends on **Your takings**: move the night's earnings to [Cashu.me](https://cashu.me) in one tap (it asks to add the test mint once), then **Finish gig** stamps the till receipt PAID OUT.

No phone? Every phone step has a laptop button: **Show a door word** and **Let in**, **Pour by hand**. The demo never uses the laptop's camera.

---

## Features

### For artists

- **Plan your gig:** venue tickets, Watch online or pay by the minute, prices in pounds with the sats beside them, a door scanner, moderators, stretch goals and show splits, with a phone preview of the fan's page alongside.
- **Show Time:** the night runs on three buttons (Start stream, Start show, End night), with live previews of the fan's page at home and on a phone, and a door and bar strip for anyone without a scanner.
- **Your takings:** what came in, by kind, with the platform's 5% on its own line; one tap moves it to the artist's own Cashu wallet; the night closes as a till receipt.
- **Your 12 words:** the key that opens the takings is made from 12 words (BIP-39, as Bitcoin wallets do), shown once to write on paper and checked by asking for two of them. On another browser signed in to the stage, the words bring the key back, and any sats collected but not yet moved with it. They never leave the browser.
- **Replays for 7 days:** after End night, the gig page plays the recording. Ticket holders watch free; everyone else pays once (one 402) at the artist's price, which can't go below a minimum set by the show's length.
- **Your recordings:** each broadcast as an MP4 to download or delete.

### For fans

- **One gig page**, at the venue or at home. On a phone: the video, then Chat · Tip · Ticket · Wallet. On a laptop: the video beside the chat; full screen keeps the newest chat lines over the picture and the tip box along the bottom.
- **Tips with words:** type a comment, add sats in the same box, press send: both arrive together. Sign in with Nostr (a browser extension or a phone signer) for your name in the chat and one-tap Nutzaps.
- **Tickets as passkeys:** saved in the phone's password manager; **Find my ticket** brings one back on a new phone.

### For venues

- **Blind-signed tickets:** the fan's phone makes the venue ticket from 32 random bytes and sends only a blinded copy with the 402; tonight's gig key signs it without seeing inside (Cashu's own blind signature, NUT-00, with a NUT-12 proof the phone checks). So the door can tell a ticket is real and unused, but not which purchase it came from.
- **The door:** each venue ticket's QR is signed again by the ticket's own key every 30 seconds, so a screenshot won't get in. Any phone becomes the door scanner from the artist's DOOR pass; it shows **Let them in**, **Authorised ticket.**, then ✓ Signed by tonight's gig · ✓ QR fresh (30 s) · ✓ First time in, never a name. No scanner? The fan's phone shows a door word (PUNTER-47) and the artist lets it in on Show Time.
- **The bar:** a first drink can be included in the ticket price. It's a real coin locked to the bar's key until last orders, handed over as an animated QR (NUT-16, proposed); not poured by last orders, it goes back to the artist.
- **The TV page:** the chat, top tippers and stretch goals, for the screens around the room.

### Privacy

- No name, email or address is asked for, and no list of who came is kept: the door keeps a fingerprint per ticket let in, which can't be matched to a purchase, and New night wipes it.
- What stays linked: the purchase, to a random browser ID (for watching online and the free replay), and the first drink, by its number.
- Everything from the night is deleted after 7 days, except one line of totals.

---

## How payments work

Every price is an HTTP **402 Payment Required** (NUT-24). The browser wallet answers with ecash **locked to the recipient's public key** (NUT-11 P2PK): the artist for tickets, minutes and tips; the bar for the drink. The server checks each payment and records it, but never holds a key that could spend it. The artist's keys are made in the artist's own browser.

Because it's plain HTTP 402, anything that can pay a 402 can buy a ticket: a browser, a script, or an AI agent.

| Spec | Used for |
|---|---|
| NUT-00 to 04 | Blind-signed ecash; minting test sats; the venue ticket, blind-signed by the gig's key (checked against NUT-00's test vectors) |
| NUT-07 | Checking whether a coin is spent (the poured drink) |
| NUT-10 · NUT-11 | Locking each payment to its owner; the drink's last-orders locktime; the venue ticket's secret, locked to its own key |
| NUT-12 | The gig's proof that it signed the fan's ticket, checked on the phone |
| NUT-16 *(proposed)* | Animated QR codes: the drink handed over as the coin itself |
| NUT-18 | Payment requests |
| NUT-24 | HTTP 402: tickets, each minute of video, tips, replays |
| NIP-07 · 46 · 44 · 98 | Nostr sign-in, from an extension or a signer app |
| NIP-61 | Nutzaps |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts). The NUT-16 encoder is cashu-ts's own, copied unchanged from pull request [#1309](https://github.com/cashubtc/cashu-ts/pull/1309) into `vendor/cashu-ts-nut16`, with the spec's test vectors as our tests.

**Live video:** the stream plays only with a short-lived signed token. Each minute the wallet pays a 402 for the next token; stop paying and the picture stops.

---

## Architecture

- **Cloudflare Worker** (free plan) serving the pages and the API.
- **Stages:** each practice stage is a SQLite **Durable Object** of its own, reached at `<id>.thenutpub.com` through a proxied wildcard DNS record. The main site's own stage lives in **D1**.
- **Cloudflare Stream** for live video and recordings (paid).
- **No mint of our own:** the demo uses the public test mint.

```
client/    browser code: the fan's page, Show Time, wallets, NUT-16 QR
public/    pages, styles, fonts, the Judges line
server/    the Worker: tickets, the door, the 402 gate, replays, takings, stages
test/      node:test suites (including the NUT-16 and RFC 6238 vectors)
vendor/    cashu-ts's NUT-16 encoder, unchanged
```

---

## Run it yourself

Requires Node.js and a Cloudflare account.

```bash
npm install
npx wrangler d1 execute nutpub --remote --file schema.sql   # after creating the D1 database and KV namespace (ids in wrangler.jsonc)
npm test
npm start                                                     # http://localhost:8787
npm run deploy
```

- **Media:** the example clips and photos aren't in the repo. Cut a video into 10-second pieces with `scripts/cut-set.sh <video> [name]` (into `media/`) and put photos in `public/img/`.
- **Secrets:** set with `npx wrangler secret put <NAME>`: `ADMIN_KEY`, the Stream credentials, the wallet-pass keys, `PRICING` (the replay's minimum) and `NUTPUB_KEY` (the platform's public key). See `wrangler.jsonc`.

The original hackathon build (btc++ Berlin, October 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

---

## Status and known limits

The NutPub is a working concept on a test mint, not a production service.

- The artist's key lives in one browser; its 12 words bring back the money, not the sign-in (that's the stage's own passkey or link). Stages made before 20 Nov have no words. A passkey-sealed copy of the key comes after 27 Nov.
- On the test mint, a stream takes 10 viewers at a time.
- **Free to watch, paid up front** (the artist covers a free stream's cost before the gig) is built but switched off until it's redesigned (`UPFRONT` in `server/config.js`).
- **Put on a gig** (a stage of your own, sealed with a passkey) is built but off the home page; the demo uses the three posters.
- A replay plays one recording: if the stream dropped during the night, it plays the longest part.
- Card payments and Show Splits payouts aren't wired up yet.
- Practice stages close 7 days after they're made; up to 50 at once, and when all are taken the oldest (made over an hour ago) closes to make room.

---

## Coming next: 27 Nov – 11 Dec

The two weeks after NutNovember. "Exploring" means we're still working out how.

- **Passkeys that seal the ticket (WebAuthn PRF):** the ticket's seed only comes out after Face ID or a fingerprint. The passkey's own ID stays as the fallback for password managers without PRF.
- **Give a ticket away:** the friend's phone swaps it for a fresh blind-signed ticket, the way a Cashu wallet receives a token, so the giver's copy stops working.
- **Move to your phone:** the night's takings as an animated NUT-16 QR that the artist's phone wallet scans.
- **Show splits paid as the fan pays:** a coin per band member, each locked to their own key.
- **A replay pass:** the artist sends the replay to someone who wasn't there, locked to their key.
- **An agent that buys a ticket over the 402,** within a limit its person sets, finding gigs over MCP.
- **Exploring, venue deals:** one payment buys a blind-signed ticket per business (dinner at the pub, then the gig room's door; another building, or another night), each checked only at its own door, so the restaurant can't tell which diner went to the show.
- **Exploring, tips without Wi-Fi at the venue:** coins locked to the artist's key while online, handed over by QR or Bluetooth, checked offline with the mint's signature (NUT-12).

---

## Licence

[Apache-2.0](LICENSE). Font: Bebas Neue, SIL Open Font License (`public/fonts/OFL.txt`).
