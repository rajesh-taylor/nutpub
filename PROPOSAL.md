# Base58 proposal: retries in the basement, refunds without a refund desk

*The NutPub, btc++ Berlin 2026. Two additions to Cashu's HTTP 402 (NUT-24), plus one note on the server's own leg. All three come from things we had to decide while building, because the spec is silent on them.*

NUT-24 says how to ask for ecash (`402` + `X-Cashu: creqA…`) and how to pay (`X-Cashu: cashuB…`), and that a wrong mint, unit, amount or missing lock gets a `400`. It says nothing about **what happens when the reply is lost**, and a payment request can require a lock (`nut10`) but **can't ask for a refund path back to the payer**.

---

## 1. Retry is safe, reuse isn't (a NUT-24 addendum)

**The problem.** A phone pays for something and the reply never arrives: a basement, a tunnel, a train. Did it go through? If the client pays again, it may pay twice. If it sends the same token again, most servers say "already spent" (the server swapped it the first time), and the payment is lost. Both are wrong.

**The rule.**
- A server that accepts a token **binds it to the request it paid for**: the token's proof `Y` values (NUT-00, `Y = hash_to_curve(secret)`), the payment request id `i` (NUT-18), and the resource (method and path).
- **Same token, same request:** the server answers again (the same response, or an equivalent one) and **does not charge again**.
- **Same token, any other request:** `400`, with a distinct error such as `token_already_redeemed`.
- The binding lasts at least as long as the client might retry (we suggest 1 hour, matching the NUT-19 cache TTL on Minibits).

**Client behaviour.**
- After a network error on a paid request, a client **SHOULD retry with the same `X-Cashu` token** before doing anything else.
- It **MUST NOT** make a new token for the same request until the server has answered (accepted or refused) the old one.

**What we built.** Our stream sells 10-second segments, each behind its own 402. The server remembers which segments each pass has paid for; a retry for the same segment is served again without touching the token, and the same token for a different segment hits the server's replay set and gets `400 reused`. In the demo the server holds its reply for 5 seconds and the phone gives up at 2, then asks again: *"Same payment, same song. Charged once."* Then the same token for the next song: *"Refused."*

**Why it matters for servers that aren't idempotent.** Our door issues a new pass per request, so a door retry with the same token would be refused today. That's exactly the gap: without a binding rule, a lost reply at a non-idempotent endpoint burns the payer's money.

## 2. The server's own leg: retrying the swap

The same problem exists one hop further in: the server swaps the payer's proofs at the mint (NUT-03), and *that* reply can be lost too. If the server retries with fresh outputs, the mint says the inputs are spent and the server has lost the ecash.

Two ways out, both already in Cashu:
- **NUT-19 (cached responses):** resend the **identical** swap request (same inputs, same blinded outputs); a mint that caches `/v1/swap` returns the same signatures. Minibits supports NUT-19.
- **NUT-13 + NUT-09:** derive the outputs deterministically, so the server can restore the signatures after a lost reply.

**Proposal:** NUT-24 should say that a server **SHOULD redeem through one of these**, so its own retry is as safe as the client's. (We didn't build this leg; it's here because the rule in §1 is only as good as the server's ability to finish its own swap.)

## 3. Refundable payment requests

**The problem.** A 402 can require a lock with `nut10`: our pledge request asks for P2PK to the artist's key with a locktime at last orders. But for an all-or-nothing goal you also want **"and a refund path back to you, the payer"**, and the request has no way to say that. The server can't fill it in, because it doesn't know the payer's key, and it mustn't (a refund to the server isn't a refund).

**The rule.**
- A payment request's `nut10` may carry a marker meaning **"add your own refund key"**. For example, a tag `["refund", "@payer"]` in the request's `t` list.
- A wallet that sees it generates **a fresh key for this payment** (never a long-lived identity key: the mint reads the refund keys whenever the proofs are spent, so a shared key would let it link one payer's pledges), puts the public key in the lock's `refund` tag, and keeps the secret so it can take the pledge back after the locktime.
- A server that requires a locktime **MUST refuse a token with no refund tag** (after the locktime, anyone could spend it), and **MUST refuse one whose refund key is the lock key itself**.

**What we built.** The pledge gate checks every proof: locked to the artist, locktime at least last orders, a refund tag present, and not the artist's key. Then it checks the proofs are unspent (NUT-07) and **holds them without swapping**. Goal hit: the artist's key claims them. Goal missed: at last orders each phone signs its own refund path and takes its sats back, retrying every second until the mint's clock agrees. Nobody presses refund.

One thing we learned: Coco 2.0.0 can make these locks but can't spend the refund path of its own P2PK sends, so the phone keeps the refund secret and reclaims with cashu-ts. A wallet that honours `["refund", "@payer"]` should also be able to reclaim by itself.

---

**Pitch:** retries in the basement; refunds without a refund desk.

**Prior art:** a search of the cashubtc/nuts repo (28 Sep 2026) found no proposal on 402 retry rules or on payer refunds in payment requests. Related: NUT-19 (cached responses), and the open PR #296 (offline Spilman channels), the natural next step for streaming payments.
