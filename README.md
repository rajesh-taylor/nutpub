# The NutPub

**Live music paid in Cashu ecash: tickets, the door, the bar, the stream and tips, each an HTTP 402, from a wallet in the browser. No app, no account.**

## Try it

1. Open **[thenutpub.com](https://thenutpub.com)** on a laptop. A phone helps in gig 3, but isn't needed.
2. Press **Start gig 1**. You're Longy and one of his fans, in two tabs; test sats are already in the wallet.
3. Follow the **Judges** line at the top of each page. Then gigs 2 and 3.

Test mint, test sats: they have no value. I'm one person, building this with Anthropic's Claude as my coding agent. A [Refueler Labs](https://refueler.io) project, entered in [NutNovember](https://nutnovember.org) 2026.

---

## Contents

- [The three gigs](#the-three-gigs)
- [An agent buys a ticket](#an-agent-buys-a-ticket)
- [What's built](#whats-built)
- [How payments work](#how-payments-work)
- [Architecture](#architecture)
- [Run it yourself](#run-it-yourself)
- [Things to fix](#things-to-fix)
- [What I'm thinking of building](#what-im-thinking-of-building)
- [Licence](#licence)

---

## The three gigs

The home page shows three gig posters. Each one opens a practice stage of its own (`<id>.thenutpub.com`) on **1 · Plan your gig**, as the artist. A **Judges** line at the top of every page tells one line of the story and the one thing to do next; you press the artist's own buttons and tabs. Run them in order: each builds on the one before.

| | Gig | You'll see | Device |
|---|---|---|---|
| 1 | **Longy, online** | A £20 Watch online ticket (one 402), the live chat with a moderator, tips with comments in full screen, a stretch goal filling up, and the venue's TV page | Laptop |
| 2 | **Frankie Peroni, pay as you watch** | 60 sats a minute: each 10-second piece answers 402 until the browser wallet pays for it (open the Network tab to see the 402, then the paid 200). Stop and nothing more is charged. Then the fan's leftover sats go home to their own wallet | Laptop |
| 3 | **The night at the venue: Longy at The Fickle Pickle** | A £35 venue ticket with a £5 beer token included, blind-signed so not even the NutPub can tell who came in; saved as a passkey if you like; a 30-second door QR scanned by your own phone as the doormen's list; the beer token handed over as an animated QR and poured by the bar | Laptop, phone optional |

Every gig ends on **Your takings**: move the night's earnings to [Cashu.me](https://cashu.me) in one tap, then **Finish gig** stamps the till receipt PAID OUT.

No phone? Every phone step has a laptop button. The demo never uses the laptop's camera.

Two more pages: [The Kitchen](https://thenutpub.com/kitchen) (everything the NutPub does, with a tick chip each) and the [Pub Noticeboard](https://thenutpub.com/noticeboard) (AI agents at the NutPub).

---

## An agent buys a ticket

Every price is a plain HTTP 402, so anything that can pay one can buy a ticket: a browser, a script or an AI agent. This script buys gig 1's Watch online ticket with test ecash. No browser, no account. It needs Node.js 22 or later.

Start gig 1 on [thenutpub.com](https://thenutpub.com) first; your stage's address is in the browser's address bar. Then:

```bash
git clone https://github.com/rajesh-taylor/nutpub && cd nutpub && npm install
npm run agent -- https://<your stage>.thenutpub.com
```

```
The NutPub · an agent buys a ticket · test sats, no account

1  A place in the show      POST /api/pass                → pass f674…12
2  Ask for the ticket       GET  /api/door/ticket?as=home  → 402 Payment Required
   Longy, Watch online (£20): 45,236 sats · mint testnut.cashu.space
   X-Cashu carries the bill (NUT-18), to be locked to the artist's key 0295…7b (NUT-11)
3  Test sats from the mint  NUT-04: a quote, paid by the test mint → 45,268 sats
4  Lock them to the artist  NUT-03 swap into P2PK coins · mint fee 1 sat
5  Pay                      GET  again, X-Cashu: cashuB…   → 200 {"in":true}

✓ Bought: Longy, Watch online (£20), in 4.4 s. Nothing kept on this computer.
```

The ticket is then on your stage: after End night, Your takings counts it. The script is [`scripts/agent.js`](scripts/agent.js).

---

## What's built

### For artists

- **Plan your gig:** venue tickets, Watch online or pay by the minute, prices in pounds with the sats beside them, a door scanner, moderators, stretch goals and show splits.
- **Show Time:** the night runs on three buttons (Start stream, Start show, End night), with previews of the fan's page.
- **Your takings:** what came in, by kind; one tap moves it to the artist's own Cashu wallet; the night closes as a till receipt.
- **Your 12 words:** the key that opens the takings is made from 12 words (BIP-39), written on paper and checked. On another browser they bring the key back, and any sats not yet moved. They never leave the browser.
- **Replays for 7 days:** free with a ticket, one payment without.
- **Your recordings:** each broadcast as an MP4 to download or delete.

### For fans

- **One gig page,** at the venue or at home, on a phone or a laptop.
- **Tips with words:** a comment and sats, sent together. Sign in with Nostr for your name in the chat and one-tap Nutzaps.
- **Tickets as passkeys:** saved in the phone's password manager; **Find my ticket** brings one back, on another device too (tried 21 Nov: saved on a Mac, found on an iPhone).

### For venues

- **Blind-signed tickets:** the door can tell a ticket is real and unused, but not which purchase it came from.
- **The door:** the ticket's QR changes every 30 seconds, so a screenshot won't get in. Any phone becomes the scanner. No scanner? A door word, let in by hand.
- **The bar:** a first drink can be included in the ticket, as a real coin locked to the bar, handed over as an animated QR (NUT-16, proposed).
- **The TV page:** the chat, top tippers and stretch goals, for the screens round the room.

### Privacy

- No name, email or address is asked for, and no list of who came is kept.
- Everything from the night is deleted after 7 days, except one line of totals.

---

## How payments work

Every price is an HTTP **402 Payment Required** (NUT-24), the same idea as x402. The browser wallet answers with ecash **locked to the recipient's public key** (NUT-11): the artist for tickets, minutes and tips; the bar for the drink. The server checks each payment and records it, but never holds a key that could spend it. The artist's keys are made in the artist's own browser.

| Spec | Used for |
|---|---|
| NUT-00 to 04 | Ecash; test sats; the blind-signed venue ticket |
| NUT-07 | Whether a coin is spent (the poured drink) |
| NUT-10 · NUT-11 | Locking each payment to its owner |
| NUT-12 | The gig's proof that it signed the ticket |
| NUT-16 *(proposed)* | Animated QR codes: the drink handed over as the coin itself |
| NUT-18 | Payment requests |
| NUT-24 | HTTP 402: tickets, each minute of video, tips, replays |
| NIP-07 · 46 · 44 · 98 | Nostr sign-in, from an extension or a signer app |
| NIP-61 | Nutzaps |
| BIP-39 · BIP-32 | The artist's 12 words |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts). The NUT-16 encoder is cashu-ts's own, copied unchanged from pull request [#1309](https://github.com/cashubtc/cashu-ts/pull/1309) into `vendor/cashu-ts-nut16`, with the spec's test vectors as tests.

---

## Architecture

- **Cloudflare Worker** (free plan) serving the pages and the API.
- **Stages:** each practice stage is a SQLite **Durable Object** of its own, at `<id>.thenutpub.com`. The main site's own stage lives in **D1**.
- **Cloudflare Stream** for live video and recordings.
- **No mint of its own:** the demo uses the public test mint.

```
client/    browser code: the fan's page, Show Time, wallets, NUT-16 QR
public/    pages, styles, fonts, the Judges line
server/    the Worker: tickets, the door, the 402 gate, replays, takings, stages
scripts/   the agent that buys a ticket, set-up helpers
test/      node:test suites (including the NUT-00, NUT-12, NUT-16, BIP-39 and RFC 6238 vectors)
vendor/    cashu-ts's NUT-16 encoder, unchanged
```

---

## Run it yourself

Requires Node.js 22 or later and a Cloudflare account.

```bash
npm install
npx wrangler d1 execute nutpub --remote --file schema.sql   # after creating the D1 database and KV namespace (ids in wrangler.jsonc)
npm test
npm start                                                     # http://localhost:8787
npm run deploy
```

- **Media:** the example clips and photos aren't in the repo. Cut a video into 10-second pieces with `scripts/cut-set.sh <video> [name]` (into `media/`) and put photos in `public/img/`.
- **Secrets:** set with `npx wrangler secret put <NAME>`: `ADMIN_KEY`, the Stream credentials, the wallet-pass keys, `PRICING` and `NUTPUB_KEY`. See `wrangler.jsonc`.

The original hackathon build (btc++ Berlin, October 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

---

## Things to fix

The NutPub is a working concept on a test mint, not a production service.

- The artist's key lives in one browser. Its 12 words bring back the money, not the sign-in. Stages made before 20 Nov have no words.
- A replay from a real broadcast isn't tried yet (the example gigs play recordings).
- On the test mint, a stream takes 10 viewers at a time.
- **Free to watch, paid up front** is built but switched off until it's redesigned.
- **Put on a gig** (a stage of your own, sealed with a passkey) is built but off the home page; the demo uses the three posters.
- A replay plays one recording: if the stream dropped during the night, it plays the longest part.
- Card payments and show splits payouts aren't wired up yet.
- Practice stages close 7 days after they're made; up to 50 at once.

---

## What I'm thinking of building

From 27 Nov:

- Passkeys that seal the ticket
- Give a ticket away
- Move the takings to your phone by QR
- Send sats to any Lightning wallet, for fans and artists (needs a real mint: the test mint's Lightning is pretend)
- Show splits paid as the fan pays
- A replay pass, for someone who wasn't there
- An MCP server on refueler.io: gig search, tickets and venue hire days, for fans' agents, artists and venues
- Tips from your own wallet (NIP-47), and the gig listed live on Nostr (NIP-53)

Still working out how: venue deals, and tips without Wi-Fi at the venue.

---

## Licence

[Apache-2.0](LICENSE). Fonts: Bebas Neue and IBM Plex Sans, SIL Open Font License (`public/fonts/README.txt`).
