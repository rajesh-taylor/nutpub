# The NutPub

**A gig paid for in Cashu ecash.** Fans buy a ticket, pay by the minute to watch the live stream, and tip the artist, all from a wallet in their browser. No app, no account, no email. A Refueler Labs concept, entered in [NutNovember](https://nutnovember.org).

**Live demo:** https://thenutpub.com

> **Test mint · test sats.** The demo uses the public Cashu test mint (testnut.cashu.space). Its sats have no value.

## What it does

- **For the artist:** three pages. **Plan gig** sets up the night weeks ahead: venue tickets, Watch online or pay by the minute, prices, door scanner, moderators and poster, with a phone beside it showing what fans will see. **Show Time** runs the night with three buttons (Start stream, Start show, End night) and two previews of the fan's page, at home and on the fan's phone. **Your takings** shows what came in, with The NutPub's 5% on its own line, moves it to the artist's own Cashu wallet with one tap, and ends as a till receipt. **Your recordings** on Your takings: each broadcast as an MP4 to download, or delete; Stream's copy goes after 7 days.
- **Replays for 7 days:** after End night the gig page plays the recording until it's deleted, 7 days after the broadcast. Ticket holders watch free; everyone else pays once, one 402 for the whole replay, locked to the artist's key, at the price on Plan gig's **Replay** card (Off, or a price in £ ≈ sats). The price starts at a minimum set by the show's length and can't go lower: the server holds to it. Each fan can watch it twice through. The page counts the days down, and says so when the recording has gone or the artist deleted it early. Replays have their own tile on Your takings. A free stream with tips has no replay.
- **Free to watch, paid up front:** "free" is free for the fans, never for the stream. On Plan gig the artist picks the most viewers at once and sees the price, by viewers and hours plus a spare hour, then pays it with one 402 from their own wallet in the browser, locked to the NutPub's key. The stream can't open until it's paid. Past the cap, new viewers see **Full**; nobody watching is ever cut off, even if the show overruns. More viewers or a longer show later: the artist pays the difference.
- **The show's length:** any streamed gig needs its end time on Plan gig (unlike other streaming services), because the replay's minimum and a free stream's price go by it.
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
| 16 | Animated QR codes (proposed; the drink as a coin) |
| 18 | Payment requests |
| 24 | HTTP 402: tickets, each minute of video, tips |
| NIP-07 · 46 · 44 · 98 | Nostr sign-in, from an extension or a signer app |
| NIP-61 | Nutzaps |

Built on [Coco](https://github.com/cashubtc/coco) and [cashu-ts](https://github.com/cashubtc/cashu-ts).

## Judge for yourself

thenutpub.com opens on **Judge for yourself**: four gig posters, four ways to get paid in Cashu over HTTP 402, for artists, producers and venues. Each poster says **Laptop** or **Laptop + phone**. Test sats only.

Each poster makes a stage of its own, at its own address (`<id>.thenutpub.com`) with its own database, holding just that gig, and opens it on **1 · Plan your gig** as the artist. No passkeys and no account: this browser remembers the stage, so the poster then says **Open again** (back where you left off) or **Start fresh**. Stages close themselves 7 days after they're made; Your takings says when.

**Follow the Judges line.** Each of the artist's pages has one line at the top saying the next thing to do (Judges · 1 of 5), and you press the artist's own buttons and tabs: look at Plan gig, click 2 · Show Time, press Start show, open **Fan's page ↗**, End night once the fan's steps are done, then 3 · Your takings, Move and Finish gig. The fan's page has its own **Judges** strip at the top with the one next step; in full screen the next step sits on the picture. On gig 3 each step also tells a line of the story, and the fan's phone sits right beside Show Time.

1. **Longy** (start here): online only, one £20 ticket. Say hello in the chat (Aaron of Essex, his moderator, asks where everyone's watching from), go full screen and tip 30,000 sats there, then tip again under his stretch goal and watch it move.
2. **Frankie Peroni**: pay as you watch, 60 sats a minute (The Devils Train from The Fickle Pickle). Play, stop, play again, tip: you pay only for the minutes you watch. A £30 venue ticket is on sale too. After End night the fan's page becomes the replay: press play and it's one 402 for the whole replay, then it plays from the top, twice through. On a real gig that's the night's recording; here it's the clip.
3. **Longy at The Fickle Pickle** (laptop, phone optional): the fan's night, in eight steps. First, on Plan gig, Longy pays for his free stream up front: **Pay** in the Judges line, one 402 from his own wallet, locked to the NutPub's key. Then on Show Time, with the fan's phone beside it, buy the £35 venue ticket on that phone (or scan the QR with your own). Press Start show: your first drink, on Longy, arrives on the phone as the coin itself, an animated QR inside a pint glass. **Pour by hand** in the Judges line: the bar takes the coin at the mint with its own key, and the glass fills: "Cheers from Longy!". Press play and say hello in the Chat tab, tip 2,100 sats in the Tip tab, End night, then move the fan's leftover sats to Cashu.me. The stream is free, with tips.
4. **At the venue** (laptop + phone): Frankie's second night. A £30 venue ticket; the doormen's phone scans the ticket at the door. Its free stream is paid for up front first: **Pay** on Plan gig's Free to watch card, before Start show. Being rebuilt as the staff's night before 27 Nov.

Every gig ends the same way: **End night** on Show Time, then **Your takings**, **Move to Cashu.me** (it asks to add the test mint once: say yes). Your takings then shows the night as a till receipt (each kind of takings, the 5%, what moved and the mint's fee); **Finish gig** stamps it PAID OUT and keeps it under Past gigs, and **Save receipt** prints it. Fans move their own leftover sats to Cashu.me from their wallet page. Each wallet page says whose it is: fan (and for which ticket), artist or bar. The clips play through the site's own player: nothing to install. Practice sets and streams stop after 20 minutes. Up to 50 stages at once; when every one is taken, the oldest (made over an hour ago) closes to make room.

### What each gig uses

All four: ecash from a Cashu mint (NUT-00 to 04), each payment locked to the artist's own key (NUT-11 P2PK), paid through HTTP 402 (NUT-24). The server checks each payment and can't spend it. Your takings hands the artist one Cashu token (V4) for any wallet; Cashu.me receives it from the link alone.

- **Longy:** one 402 for the Watch online ticket; each tip is another 402, or a Nutzap signed with the fan's Nostr key (NIP-61; sign-in by NIP-07 or NIP-46, encrypted with NIP-44). The stretch goal fills from the tips.
- **Frankie:** the video comes in 10-second pieces; each answers 402 until the browser pays 10 sats for it. A live stream works the same way, a minute at a time, with a short-lived signed token. After End night the replay is one 402 for the whole of it; its pieces then play free, twice through.
- **Longy at The Fickle Pickle:** the free stream is paid for up front: a 402 from Longy's wallet, locked to the NutPub's key. The ticket is a 402. The first drink is locked to the bar's key until last orders, then falls back to Longy (a NUT-11 locktime; the mint enforces it). The fan's phone shows that coin itself as an animated QR in NUT-16's proposed fountain format, made by cashu-ts's own encoder (copied unchanged from its pull request #1309 into `vendor/cashu-ts-nut16`, with the spec's test vectors as our tests). Pour by hand swaps it at the mint with the bar's key; the phone sees it spent (NUT-07).
- **At the venue:** the ticket is a 402; its door QR changes every 30 seconds (TOTP), so a screenshot won't get in.

## Coming before 27 Nov

- Tickets the NutPub can't link to their buyer (blind-signed).
- Gig 4, the staff's night: the doormen's pass, the door scan, the price on a scanned ticket.

## Known limits

- The artist's key lives in one browser, with no backup yet. A passkey-sealed backup is planned.
- Put on a gig (a stage of your own, sealed with a passkey) is built but off the home page until after 27 Nov: judges use the three posters.
- On the test mint, a stream takes 10 viewers at a time.
- A replay plays one recording: if the stream dropped during the night, it plays the longest part. Twice through is counted in five-minute steps of the recording handed out.
- What the artist pays up front for a free stream isn't taken back if they lower the viewers or shorten the show.
- Finish gig keeps the replay going; giving the gig a new date on Plan gig ends it, and the next gig's page takes over.
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
