# Next session (Fri 2 Oct)

## Start everything (Mac)
1. Mints: `cdk-mintd -w ~/cdk-suitcoin-mint` (SuitCoin, :3339). Fake Kitty fallback only: `cdk-mintd -w ~/cdk-fake-mint` (:3338).
2. Server (Minibits): `cd ~/Documents/NutPub && set -a && . ./.env && npm start`
   - Fake mint instead: add `KITTY_URL=http://127.0.0.1:3338`. Shorter last orders for testing: `LAST_ORDERS_MIN=1`.
3. Tunnel: `cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8787 > data/tunnel.log 2>&1 &`
   then `grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' data/tunnel.log | head -1 > data/tunnel.url` (QR codes read this file).
4. Pixel over USB: `adb reverse tcp:8787 tcp:8787` (redo after replugging).
5. Stage: `<tunnel>/stage.html#k=<ADMIN_KEY from .env>`. Float top-up: `/fund.html`.

## Where we are
- Tier A, B done. Tier C: finale core done (pledges, goal, lights, countdown, paid, +21 home).
- Real-money checkpoint passed on Minibits (00:50). House float: ~500 real sats.
- Chapter banner, EN/DE pill, presenter arrows, pint pour animation, closing-time screen.

## To do, in order
1. Longy's audio file → `scripts/segments.sh <file>` (placeholder tone until then).
2. Longy's photos: Rajesh to name the two files → `scripts/photo.sh <file> longy-live` and `… longy-pint`.
3. Payout to Longy: melt (NUT-05) his claimed pledges to his Lightning address (need the address).
4. Basement58 (retry rule) — 40 min max, else the proposal text only.
5. KYC Kebab Shack (Rupert, read-only, on the phones).
6. README with the §13 declarations, PROPOSAL.md, then the btc++ form (due 15:00).
7. Rehearse the 3-minute script twice with a stopwatch.

## Known rough edges
- Pixel can't reach the internet from Vanadium on venue wifi (check Vanadium's Network permission); bar page via USB works.
- The tunnel URL changes on every restart; QR codes follow `data/tunnel.url`.
- SSE doesn't pass the tunnel; pages poll every second.
