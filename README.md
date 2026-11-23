# The NutPub

**Live music paid in Cashu ecash: tickets, the door, the bar, the stream and tips, each an HTTP 402, from a wallet in the browser. No app, no account.**

## Try it

1. Open **[thenutpub.com](https://thenutpub.com)** on a laptop. A phone helps in gig 3, but isn't needed.
2. Make your artist passkey (or press Not now), then **Start Longy's gig**. You're Longy and one of his fans, in two tabs; test sats are already in the wallet. The passkey opens all three gigs on another laptop: **Back to your gigs**.
3. Follow the **Judges** line at the top of each page. Then gigs 2 and 3: each builds on the last.

Test mint, test sats: they have no value. I'm one person, building this with Anthropic's Claude as my coding agent. A [Refueler Labs](https://refueler.io) project, entered in [NutNovember](https://nutnovember.org) 2026.

---

## The three gigs

Each poster on the home page opens a practice stage of its own (`<id>.thenutpub.com`), as the artist. The **Judges** line tells one line of the story and the one thing to do next; you press the artist's own buttons. Run them in order.

| | Gig | You'll see | Device |
|---|---|---|---|
| 1 | **Longy, online** | Cellar and the 12 words, a £20 Watch online ticket (one 402), a tip with a comment that meets both stretch goals, Pub TV | Laptop |
| 2 | **Frankie Peroni, pay as you watch** | 60 sats a minute: each 10-second piece answers 402 until the browser wallet pays for it. Stop and nothing more is charged. Then the fan's leftover sats go home | Laptop |
| 3 | **Longy at The Fickle Pickle** | A £35 venue ticket, blind-signed, with a free drink; a 30-second door QR; your phone as the Doorman's List; the drink handed over as an animated QR | Laptop, phone optional |

Every gig ends on **Your takings**: the night's earnings move to [Cashu.me](https://cashu.me) in one tap, then **Finish gig**. No phone? Every phone step has a laptop button. The demo never uses the laptop's camera.

**Gig 1:** the fan's page after the 50,000-sat encore tip, both goals met.
![Gig 1: Longy's fan page, the live chat and a 50,000-sat tip](docs/img/gig-1.jpg)

**Gig 3:** Show Time, with the fan's phone holding the door QR. It changes every 30 seconds.
![Gig 3: Show Time with the fan's phone showing its 30-second door QR](docs/img/gig-3.jpg)

**Producers and moderators:** invited from Cellar with a link that works once, for 7 days. Each signs in with a passkey of their own (a moderator can use Nostr instead), and neither can reach the takings. A moderator has a page of their own, the Mod page: the chat at full height with Quiet and Undo, Slow mode and the pin, beside the stream as fans see it.

**A safer chat:** an artist alone on a free stream can't watch the chat, so comments go with a tip while none of their mods is on, slurs and the artist's own words are kept out, a busy chat slows itself, and Quiet keeps a phone out for the night (Undo lets it back). People on the artist's Nostr mute list are kept out too.

**The gig, live on Nostr:** while it's on, Nostr apps that list live streams show it, with a link to the gig page. The artist's browser signs it; the stream itself stays behind the ticket. Off on the three practice gigs: Plan gig's switch turns it on.

<img src="docs/img/doormans-list.jpg" alt="The Doorman's List on a phone: Let the Nutter in, 1 in of 1 sold" width="260" align="right">

**The Doorman's List:** any phone becomes the door scanner. It knows a ticket is real and unused, never who bought it.

Everything the NutPub does, ticked off with its specs, is on [The Kitchen](https://thenutpub.com/kitchen). The [Pub Noticeboard](https://thenutpub.com/noticeboard) shows a ticket bought by a script.

<br clear="right">

---

## An agent buys a ticket

Every price is a plain HTTP 402, so a script can pay one as well as a browser. This one buys gig 1's Watch online ticket with test ecash. Start gig 1 first; your stage's address is in the address bar. Needs Node.js 22 or later.

```bash
git clone https://github.com/rajesh-taylor/nutpub && cd nutpub && npm install
npm run agent -- https://<your stage>.thenutpub.com
```

A fresh run, 21 Nov 2026:

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

The script is [`scripts/agent.js`](scripts/agent.js).

---

## How it works

Every price is an HTTP **402 Payment Required** (NUT-24). The browser wallet answers with ecash **locked to the recipient's public key** (NUT-11): the artist for tickets, minutes and tips; the bar for the drink. The artist's keys are made in the artist's own browser.

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
| BIP-39 · BIP-32 | The artist's 12 words |
| Ed25519 · HKDF-SHA256 | The 12 words win a gig back after a lost or stolen device |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts). The NUT-16 encoder is cashu-ts's own, copied unchanged from pull request [#1309](https://github.com/cashubtc/cashu-ts/pull/1309) into `vendor/cashu-ts-nut16`, with the spec's test vectors as tests.

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

It runs on a Cloudflare Worker (free plan). Each practice stage is a SQLite Durable Object and the main site uses D1. Video runs on Cloudflare Stream. There's no mint of its own: the demo uses the public test mint. Requires Node.js 22 or later and a Cloudflare account.

```bash
npm install
npx wrangler d1 execute nutpub --remote --file schema.sql   # after creating the D1 database and KV namespace (ids in wrangler.jsonc)
npm test
npm start                                                     # http://localhost:8787
npm run deploy
```

- **Media:** the example clips and photos aren't in the repo. Cut a video into 10-second pieces with `scripts/cut-set.sh <video> [name]` and put photos in `public/img/`.
- **Secrets:** set with `npx wrangler secret put <NAME>`. See `wrangler.jsonc`.

The original hackathon build (btc++ Berlin, October 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

---

## What the server can and can't do

**It can:**
- answer each price with a 402, check that the payment is locked to the right key and unspent (NUT-07), and record it
- sign a venue ticket blind, and tell at the door that a ticket is tonight's, fresh and used once
- delete everything from a night 7 days after it ends, except one line of totals
- keep slurs and the artist's own words out of the chat before anyone sees them
- change a gig's settings, as its artist can: it keeps each stage's setup key, which a passkey or the 12 words hand to the artist's browser

**It can't:**
- spend a payment: it never holds the artist's or the bar's private key
- tell which purchase a ticket at the door came from, or who came in: no name, email or address is asked for
- see the artist's 12 words, or bring them back: they never leave the artist's browser, which forgets them once they're checked
- let anyone else in as the artist: that takes one of their passkeys or the gig's 12 words (they sign a one-time challenge); a new device gets a code from one with a passkey, good once, for 5 minutes

---

## The honest list (as of 27 Nov 2026)

The NutPub is a working concept on a test mint, not a production service.

**What's built, and what isn't yet:** both are on [the Kitchen](https://thenutpub.com/kitchen).

**Before November:** everything up to commit `0ce025e` (30 Oct), tagged `before-nutnovember`: the site on Cloudflare, the test mint, a recorded set paid per 10 seconds, the door ticket with its first drink, tips, the chat, Takings and the poster. The rest is November's.

**Limits:**
- Test sats only. They leave by Move to Cashu.me, on the same test mint; sending to a Lightning wallet isn't built yet.
- Ecash is a claim on its mint. The NutPub never holds the sats, but if a mint fails, sats not yet moved go with it.
- A ticket's passkey is renamed or forgotten only when the fan opens that gig's page again. A closed stage nobody revisits leaves its passkey in the password manager, and Firefox can't be told at all.
- The Nostr listing is signed in the artist's browser, so it changes (live, ended) only while Show Time is open. Seen on relay.primal.net and nos.lol; relay.damus.io turned the connection away (503) from two networks.

**What went wrong on the way:**
- **Move to my phone** (21 Nov) was drawn, built and deployed before anyone timed it. A phone wallet took 15 to 25 seconds to read the animated QR, and one wallet refused it. It came out the same day and waits on the Kitchen; Move to Cashu.me does the job in one tap.
- **The first server ran on my laptop behind a tunnel** (October), so it was down whenever the laptop slept. It moved to Cloudflare's free plan on 29 Oct.
- **A DLEQ check was too slow for the free plan** (29 Oct: 10 ms of CPU per request, about 10 ms per note). The gate asks the mint whether each coin is spent (NUT-07) instead.
- **A reload started the stream again at piece 0** (6 Oct) and replayed pieces already paid for, against an empty wallet. It looked exactly like a broken gate. A reload now carries on at the next unpaid piece.
- **Two Nostr NIPs were listed before they were built** (21 Nov). Built and planned now sit apart on the Kitchen; NIP-53 was built on 23 Nov. Free to watch, paid up front, is built but switched off (19 Nov) until it's redesigned.
- **Undo didn't bring a line back** on fans' chats (23 Nov): each chat asks only for lines newer than its last. Lines that come back are now sent again.

---

## Licence

[Apache-2.0](LICENSE). Fonts: Bebas Neue and IBM Plex Sans, SIL Open Font License (`public/fonts/README.txt`).
