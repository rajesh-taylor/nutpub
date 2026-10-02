# The NutPub

**A pub where the tickets, the bar and the band all take ecash. Everyone gets paid, and nobody learns who you are.**

Built at btc++ Berlin 2026 (Payments Edition, "money in movement"). Pay-per-10-seconds music in Cashu ecash, and a finale that pays the artist if the room hits the goal, or sends every sat home by itself.

Cashu's own HTTP 402 (NUT-24) runs the whole night: the door, the music and the band's pay.

## The night

1. **The door.** Each judge scans a gift QR: 105 sats of real ecash land in a wallet on their phone (Coco, in the browser). The door answers `402` with an `X-Cashu: creqA…` payment request; the phone pays in-band and asks again. The door checks the mint, unit and amount, then the **DLEQ proof (NUT-12) offline**, then swaps (NUT-03). *"If your sats ain't signed, you ain't coming in!"*
2. **Rupert, the Man from the Ministry of Fiat**, tries to pay in SuitCoin, printed this morning on his own mint: refused (`wrong_mint`). He relabels it as NutPub Mint money: refused again, because the DLEQ "hologram" doesn't match the real mint's keys, and the door never had to phone the mint to know.
3. **The free pint.** 21 sats locked (NUT-11 P2PK) to the bar's key, with a locktime at last orders and a refund to the house. The QR appears only when you ask for it. The bar scans and pours; the fan's phone lights up because it asked the mint (NUT-07) whether its pint was spent. Scan it again: *"Already poured, mate."*
4. **Lights up.** One stage light per phone through the door; then Longy, live. In the room you paid once; at home on the livestream your phone gets **a fresh 402 every 10 seconds** and pays 1 sat. Stop paying and the music stops, at once.
5. **Basement58.** The reply to a payment goes missing (a basement, a tunnel). The phone asks again **with the same token**: same song, charged once. The same token for the next song: refused. That rule is the [Base58 proposal](PROPOSAL.md).
6. **A round for the band.** The pledge 402 uses `nut10` to *require* a lock: P2PK to Longy's key, locktime at last orders, and a refund key the fan's phone makes fresh for every pledge. Most 402 gates refuse tokens with conditions; this one refuses tokens *without* them, and never swaps them. Seven stage lights climb.
   - **Goal hit:** "Longy's paid!" Longy's key claims every pledge, and his takings melt (NUT-05) to his Lightning address.
   - **Goal missed:** nobody stands at a refund desk. At last orders the mint's clock opens the locks and every phone takes its own pledges back with its refund keys: *"+21 sats home."*
7. **Closing time.** Drinkers identified: 0. And on the walk home, Rupert finally finds somewhere that wants to know everything about him: the **KYC Kebab Shack**, where every cookie banner he accepts costs a topping off his Doner Credit Score™.

Also on the phone: **Pocket** (balance, what tonight has cost, Lightning top-up via NUT-04, paste ecash), **Longy** (the artist page, tip on Fountain), a livestream player with **tips** (their own 402, straight into Longy's takings), and every line in **English and German**.

## NUTs used

| NUT | Where |
|---|---|
| 00, 01, 02, 03 | Tokens, keysets, swaps: every payment the house takes |
| 04 | Top up the house float and the phone's Pocket over Lightning |
| 05 | Pay Longy's takings to his Lightning address (LNURL-pay) |
| 07 | The Pint Signal; the pledge gate checks pledges are unspent without swapping them |
| 10, 11 | P2PK with locktime and refund: the free pint (to the bar, refund to the house) and the pledges (to Longy, refund to the fan) |
| 12 | DLEQ checked offline at the door: Rupert's relabelled SuitCoin fails here |
| 18 | Payment requests (`creqA`) in every 402 |
| 24 | HTTP 402: the door, every 10-second segment, the pledges (with `nut10`), the tips |

## Run it

Needs Node 20+, a mint, and (for phones on other networks) a tunnel.

```bash
npm install
set -a; . ./.env; npm start        # serves http://localhost:8787 and prints the admin key
```

`.env`: `ADMIN_KEY=…` (keeps private links working across restarts). Optional: `KITTY_URL` (the mint; default Minibits), `SUIT_URL` (Rupert's own mint, a second `cdk-mintd` with the fake wallet), `LONGY_LN` (Longy's Lightning address; unset = his takings stay as ecash), `CURTAINS_AT=3` (curtains go up by themselves at 3 phones), `LAST_ORDERS_MIN` (minutes from curtains up to last orders; default 4).

Tunnel: `cloudflared tunnel --protocol http2 --url http://localhost:8787`, then put the URL in `data/tunnel.url`; every QR code uses it.

| Page | What it is |
|---|---|
| `/` | The fan's phone: door, pint, livestream, pledges, Pocket, Longy |
| `/stage.html#k=<ADMIN_KEY>` | The stage screen: gift QRs, phones in, curtains up, the goal |
| `/bar.html` | The bar: the pint QR opens it on the bar's phone |
| `/rupert.html` | Suit mode: Rupert tries the door |
| `/kebab.html` | The KYC Kebab Shack (read-only; nothing is sent) |
| `/fund.html#k=<ADMIN_KEY>` | Top up the house float over Lightning |

Photos of Longy live in `public/img/` and aren't in this repo; the pages work without them.

## The honest bits

- **Minibits is a third-party custodial mint** (on screen: "NutPub Mint"). It holds the sats while they're ecash, so keep amounts pub-sized.
- Tonight **our server signs for the bar and for Longy** (their keys live on the server). In a real pub each would hold their own key; the private takings links are a stand-in, not a login.
- The card rail is a placeholder: card payments aren't switched on. A card payer would give their name to Stripe; ecash payers don't.
- The goal is a promise we make; the refund is enforced by the mint (the locktime and the fan's own refund key).
- The livestream is Longy's track cut into 10-second segments (`scripts/segments.sh`), not live video. Until his file is in, a generated placeholder tone plays.

## Declarations (btc++ rules)

- Built from scratch after kickoff: first commit Thu 1 Oct, 17:15 Berlin time.
- Libraries: [Coco](https://github.com/cashubtc/coco) 2.0.0, [cashu-ts](https://github.com/cashubtc/cashu-ts) 5.0.0-rc.4, Express 5.2.1, qrcode 1.5.4, esbuild 0.28.2. Font: [Bebas Neue](https://github.com/dharmatype/Bebas-Neue) (SIL Open Font License, `public/fonts/OFL.txt`).
- Tools: ffmpeg, cloudflared, cdk-mintd. AI assistance: Claude Code.
- Made before kickoff (no code): the slides, the Numo menu (not used in the end) and Longy's track (used with his permission).
- Minibits is a third-party custodial mint: use tiny amounts.

## Licence

Apache-2.0. The font is under the SIL OFL (see `public/fonts/OFL.txt`).
