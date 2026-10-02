# btc++ submission: text to paste

**Project name:** The NutPub

**One line:** A pub where the tickets, the bar and the band all take ecash. Everyone gets paid, and nobody learns who you are.

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
