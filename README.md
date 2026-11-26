# The NutPub

**Live music paid in Cashu ecash, from a wallet in the browser. No app, no account.**

<img src="docs/img/doormans-list.jpg" alt="The Doorman's List on a phone: Let the Nutter in, 1 in of 1 sold" width="240" align="right">

### Pay by the minute

Every 10 seconds of the stream is an HTTP 402, paid from the fan's browser wallet before it plays: 60 sats a minute on gig 2. Stop watching and the paying stops.

### A ticket with no name on it

No name, no email, no account: tickets are paid in ecash, so there's no list of fans to mine, and far less to know about a fan than a usual ticket. A venue ticket goes further: the gig signs it blind, so at the door any phone knows it's real and used once, never who bought it. Artists and show producers sell tickets without holding anyone's details; venues later. *(Gig 3.)*

## Try it

1. Open **[thenutpub.com](https://thenutpub.com)** on a laptop, in Chrome or Safari, in window full size. A phone is optional.
2. Press **Start Longy's gig**. You're Longy and one of his fans, in two tabs, with test sats in the wallet. The artist passkey is optional (**Skip, start with gig 1**); with one, your gigs open on another laptop.
3. Follow the **Judges** line at the top of each page, then gigs 2 and 3, in order.

Test mint, test sats: they have no value. I'm one person, building this with Claude. Started at the btc++ Berlin hackathon (October 2026), but not entered: with no domain or Cloudflare yet, the tunnel kept dropping, and the real mint I tested with kept losing its connection. Reworked in November and entered for [NutNovember](https://nutnovember.org) 2026; the October work is tagged `before-nutnovember`.

<br clear="right">

---

## The three gigs

Each poster opens a practice stage of its own (`<id>.thenutpub.com`), as the artist. The **Judges** line says what to press; the buttons are the artist's own.

| | Gig | You'll see | Device |
|---|---|---|---|
| 1 | **Longy, online** | Cellar and the 12 words; a £20 Watch online ticket; a tip with a comment, in sats or by card, that meets both goals; Pub TV | Laptop |
| 2 | **Frankie Peroni, pay as you watch** | 60 sats a minute, each 10-second piece a 402; stop and the paying stops; the fan's leftover sats go home; Frankie's receipt as a PDF | Laptop |
| 3 | **Longy at The Fickle Pickle** | A £35 venue ticket, signed blind, with a free drink; a door QR that changes every 30 seconds; a phone as the Doorman's List; the drink handed over as an animated QR | Laptop, phone optional |

Every gig ends on **Your takings**: the night's earnings move to [Cashu.me](https://cashu.me) in one tap, then **Finish gig**. Every phone step has a laptop button; the laptop's camera is never used.

**Gig 1:** the fan's page after the 50,000-sat encore tip, both goals met.
![Gig 1: Longy's fan page, the live chat and a 50,000-sat tip](docs/img/gig-1.jpg)

**Gig 3:** Show Time, with the fan's phone holding its door QR.
![Gig 3: Show Time with the fan's phone showing its 30-second door QR](docs/img/gig-3.jpg)

**Also built:**
- **Producers and moderators**, invited from Cellar by a link that works once. Each signs in with their own passkey (a moderator can use Nostr too), and neither sees the takings. Moderators get the Mod page.
- **A safer chat:** comments come with a tip while no moderator is on; slurs, words the artist lists and their Nostr mute list are kept out; a busy chat slows itself.
- **The gig live on Nostr** (NIP-53), linking to the gig page; the stream stays behind the ticket. Off on the practice gigs.
- **Sealed tickets:** a venue ticket saved as a passkey is sealed to it, where the password manager can. The NutPub keeps a copy it can't open.

Everything built, with its specs: [the Kitchen](https://thenutpub.com/kitchen). [The Pub Board](https://thenutpub.com/board): an agent buys a ticket, no browser, no account.

---

## An agent buys a ticket

An AI agent can buy a ticket on its own, with no checkout page: the gig names its price, the agent pays in ecash, and it's in. This one buys gig 1's Watch online ticket with test ecash: start gig 1, then give it your stage's address from the address bar. Needs Node.js 22 or later.

```bash
git clone https://github.com/rajesh-taylor/nutpub && cd nutpub && npm install
npm run agent -- https://<your stage>.thenutpub.com
```

A run, 21 Nov 2026:

```
The NutPub · an agent buys a ticket · test sats, no account

1  A place in the show      POST /api/pass                → pass f1d5…27
2  Ask for the ticket       GET  /api/door/ticket?as=home  → 402 Payment Required
   Longy, Watch online (£20): 43,370 sats · mint testnut.cashu.space
   X-Cashu carries the bill (NUT-18), to be locked to the artist's key 02bb…4e (NUT-11)
3  Test sats from the mint  NUT-04: a quote, paid by the test mint → 43,402 sats
4  Lock them to the artist  NUT-03 swap into P2PK coins · mint fee 1 sat
5  Pay                      GET  again, X-Cashu: cashuB…   → 200 {"in":true}

✓ Bought: Longy, Watch online (£20), in 4.6 s. Nothing kept on this computer.
  On your stage, after End night: Your takings counts it under Tickets. (31 sats of test change left behind.)
```

The script: [`scripts/agent.js`](scripts/agent.js).

---

## How it works

Every price is an HTTP 402 (NUT-24). The browser wallet pays with ecash locked to whoever is owed (NUT-11): the artist for tickets, minutes and tips, the bar for the drink. The server checks each payment and can't spend it; the artist's keys are made in the artist's own browser.

| Spec | Used for |
|---|---|
| NUT-00 to 04 | Ecash; test sats; the blind-signed venue ticket |
| NUT-07 | Whether a coin is spent (each payment, the poured drink) |
| NUT-10 · NUT-11 | Locking each payment to its owner |
| NUT-12 | The gig's proof that it signed the ticket |
| NUT-16 *(proposed)* | Animated QR codes: the drink handed over as the coin itself |
| NUT-18 | Payment requests |
| NUT-24 | HTTP 402: tickets, each minute of video, tips, replays |
| NIP-07 · 46 · 44 · 98 | Nostr sign-in, from an extension or a signer app |
| NIP-61 | Nutzaps |
| NIP-51 | The artist's Nostr mute list, kept out of the chat |
| NIP-53 | The gig listed live on Nostr (planned, live, ended) |
| BIP-340 | The door QR, signed again every 30 seconds; Nostr events |
| WebAuthn · Signal API | Passkeys: the artist, producers, moderators and a ticket |
| WebAuthn PRF · HKDF-SHA256 · AES-GCM | A venue ticket sealed to its passkey |
| BIP-39 · BIP-32 | The artist's 12 words |
| Ed25519 · HKDF-SHA256 | The 12 words win a gig back after a lost or stolen device |
| Stripe Connect *(test mode)* | Card tips, straight to the artist's own Stripe account; the NutPub's 5% as Stripe's application fee |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts). The NUT-16 encoder is cashu-ts's own, from pull request [#1309](https://github.com/cashubtc/cashu-ts/pull/1309), unchanged in `vendor/cashu-ts-nut16`, with the spec's test vectors as tests.

```
client/    browser code: the fan's page, Show Time, wallets, NUT-16 QR
public/    pages, styles, fonts, the Judges line
server/    the Worker: tickets, the door, the 402 gate, replays, takings, stages
scripts/   the agent that buys a ticket, set-up helpers
test/      node:test suites (including the NUT-00, NUT-12, NUT-16, BIP-39, BIP-340 and NIP-44 vectors)
vendor/    cashu-ts's NUT-16 encoder, unchanged
```

---

## Run it yourself

A Cloudflare Worker on the free plan: each practice stage is a SQLite Durable Object, the main site uses D1, and video runs on Cloudflare Stream. No mint of its own: the public test mint. Needs Node.js 22 or later and a Cloudflare account.

```bash
npm install
npx wrangler d1 execute nutpub --remote --file schema.sql   # after creating the D1 database and KV namespace (ids in wrangler.jsonc)
npm test
npm start                                                     # http://localhost:8787
npm run deploy
```

- **Media:** the clips and photos aren't in the repo. `scripts/cut-set.sh <video> [name]` cuts a video into 10-second pieces; photos go in `public/img/`.
- **Secrets:** `npx wrangler secret put <NAME>`; the names are in `wrangler.jsonc`.

The btc++ Berlin hackathon build (October 2026): [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

---

## What the server can and can't do

**It can:**
- answer each price with a 402, check that the payment is locked to the right key and unspent (NUT-07), and record it
- sign a venue ticket blind, and tell at the door that it's tonight's, fresh and used once
- delete everything from a night 7 days after it ends, except one line of totals
- keep slurs and words the artist lists out of the chat before anyone sees them
- change a gig's settings, as its artist can: it keeps each stage's setup key, which a passkey or the 12 words hand to the artist's browser

**It can't:**
- spend a payment: it never holds the artist's or the bar's private key
- hold card money: a card tip goes straight to the artist's own Stripe account
- tell which purchase a ticket at the door came from, or who came in: no name, email or address is asked for
- see the artist's 12 words, or bring them back: they never leave the artist's browser, which forgets them once they're checked
- let anyone else in as the artist: that takes one of their passkeys or the gig's 12 words; a new device needs a one-time code from one with a passkey, good for 5 minutes

---

## The honest list (as of 27 Nov 2026)

The NutPub is a working concept on a test mint, not a production service.

**What's built, and what isn't yet:** both are on [the Kitchen](https://thenutpub.com/kitchen).

**Before November:** everything up to commit `0ce025e` (30 Oct), tagged `before-nutnovember`: the site on Cloudflare, the test mint, a recorded set paid per 10 seconds, the door ticket with its first drink, tips, the chat, Takings and the poster. The rest is November's.

**Limits:**
- Test sats only. They leave by Move to Cashu.me, on the same test mint; sending to a Lightning wallet isn't built yet.
- Ecash is a claim on its mint. The NutPub never holds the sats, but if a mint fails, sats not yet moved go with it.
- The web host sees each visitor's internet address, as with any site; the NutPub keeps no record of it. A VPN hides it.
- A ticket's passkey is renamed or forgotten only when the fan opens that gig's page again; Firefox can't be told at all.
- The Nostr listing is signed in the artist's browser, so it changes only while Show Time is open. relay.damus.io turned the connection away (503).
- A card tip whose tab closes before the NutPub checks it reaches the artist's Stripe account, but not the chat or Takings.
- Free to watch, paid up front, is built but switched off until it's redesigned.

**What went wrong on the way:**
- **Move to my phone** (21 Nov) was built and deployed before I timed it: a phone wallet took 15 to 25 seconds to read the animated QR, and one refused it. It came out the same day and waits on the Kitchen; Move to Cashu.me does the job in one tap.
- **Two Nostr NIPs were listed before they were built** (21 Nov). Built and planned now sit apart on the Kitchen; NIP-53 was built on 23 Nov.
- **Undo didn't bring a line back** on fans' chats (23 Nov): each chat asked only for lines newer than its last. Lines that come back are now sent again.
- **Cellar sent an artist through Stripe's pages twice** (26 Nov): it read Stripe's minute of checking as unfinished. It now waits while Stripe checks.

---

## Licence

[Apache-2.0](LICENSE). Fonts: Bebas Neue and IBM Plex Sans, SIL Open Font License (`public/fonts/README.txt`).
