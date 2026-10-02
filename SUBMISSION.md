# btc++ submission: text to paste

## The form (btcpp.dev → Create project)

**Project name**
The NutPub

**One-line pitch**
A pub where the tickets, the bar and the band all take ecash. Everyone gets paid, and nobody learns who you are.

**GitHub URL**
https://github.com/rajesh-taylor/nutpub

**Demo URL**
(leave empty: the tunnel address changes on restart; the demo is live at the expo)

**What you built**
The problem: paying for a night out leaves a trail. Ticket sites know who goes to every gig, card payments carry your name, and bands get paid weeks later, if at all.

The build: Cashu's new HTTP 402 (NUT-24) runs a whole night at a pub, on the judges' own phones, with real ecash on a public mint.
- The door is a 402 that checks the mint's DLEQ proof offline, so Rupert from the Ministry of Fiat can't get in with relabelled money.
- The free pint is ecash locked to the bar's key. Your phone lights up when the mint says it's been poured; a copied QR only pours once; an unpoured pint goes back to the house at last orders.
- The livestream asks for a fresh 402 every 10 seconds. Stop paying and the music stops. If a reply goes missing, the phone asks again with the same token: same song, charged once. The same token for the next song is refused. That rule is our Base58 proposal (PROPOSAL.md).
- The finale is a 402 that requires a locked token: pledges to the artist, with a refund key each phone makes for itself. Goal hit: the artist's key claims them. Goal missed: at last orders every phone takes its own sats back. No refund desk.

What works: all of it, end to end, in English and German, with a pocket wallet in the browser (Lightning top-up, take it home). Drinkers identified: 0.

**Challenges to opt into:** Base58, Most Based Payment Protocol (PROPOSAL.md).

---

## Longer notes (if anything else asks)
**Pitch (short):**
Cashu's new HTTP 402 (NUT-24) runs a whole night at the pub, on the judges' own phones. The door is a 402 that checks the mint's DLEQ proof offline, so Rupert from the Ministry of Fiat can't get in with relabelled money. Your free pint is ecash locked to the bar's key. The livestream sends a fresh 402 every 10 seconds: stop paying and the music stops. And the finale is a 402 that *requires* a locked token: pledges to the artist, with a refund key your phone makes for itself. Hit the goal and the artist is paid over Lightning before he's unplugged; miss it and every sat comes home at last orders, by itself. Drinkers identified: 0.

**Pitch (longer, if the form wants it):**
- *What it does:* door (NUT-24 + NUT-12 DLEQ offline), free pint (NUT-11 P2PK + locktime + refund to the house, Pint Signal via NUT-07), pay-per-10-seconds livestream with tips, Basement58 (a lost reply is retried with the same token: same song, charged once; the same token for the next song is refused), an all-or-nothing round for the band (402 with `nut10`, pledges held unswapped, claimed by the artist's key or reclaimed by each fan's own refund key after the locktime), payout over Lightning (NUT-05 to his Lightning address), a pocket wallet with Lightning top-up (NUT-04), English and German.
- *How we built it:* Coco 2.0.0 wallet in the browser (IndexedDB), cashu-ts rc.4 and Express on the server, esbuild, a Cloudflare tunnel, Minibits as the mint, a second `cdk-mintd` for Rupert's SuitCoin.
- *Base58:* `PROPOSAL.md`: retry is safe, reuse isn't (bind a NUT-24 token to the request it paid for); redeem through NUT-19 so the server's own retry is safe; refundable payment requests (a `nut10` marker asking the payer's wallet to add its own fresh refund key).
- *Honest bits:* Minibits is custodial (tiny amounts); tonight the server signs for the bar and the artist; the card rail is a placeholder.

**Challenges to opt into:** Base58, Most Based Payment Protocol (`PROPOSAL.md`).

**Team:** Rajesh Taylor.

**Repository:** _(GitHub URL once pushed)_

**Demo:** live at the expo, Talks Stage. _(Fallback video URL, if recorded.)_

**Supporting links:** `PROPOSAL.md` (Base58), `README.md` (declarations).
