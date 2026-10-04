# Next

**Goal:** a 3-minute demo on the Cashu dev call, **Thu 29 Oct 2026** (screen share, slides before and after).
**Feature freeze: Wed 21 Oct.** Practice runs Thu 22 to Wed 28 Oct. Times are UK time.

## Start everything (Mac)

```bash
cd ~/Documents/nutpub-v1
npm start
```

That starts the test mint (`data/mint`, :3340), the server (:8787) and the named tunnel `nutpub`:
- site: https://nutpub.rajeshtaylor.com
- mint: https://nutpub-mint.rajeshtaylor.com

Ctrl-C stops all three. If one dies, it is restarted. Logs: `data/logs/{mint,server,tunnel}.log`. The admin key is kept in `data/nutpub.db` (printed at start).
`npm start` refuses to run if :8787 or :3340 is taken, or if another cloudflared is already running the `nutpub` tunnel.

**Check it** (seen on the iPhone and the Pixel, Sun 4 Oct): the home page lists the server (start number and first start) and the mint (name, *TEST ONLY*, version).
A restart bumps the start number and keeps the first-start date: that's the state on disk.

## Where we are

| Evening | Plan | State |
|---|---|---|
| 1 · Sun 4 Oct | Rename + new repo; skeleton; state on disk; test mint behind the tunnel; one command | **done** |
| 2 · Sun 4 Oct (the extra hour) | Setup page and show template (saved to disk) | **done** (`npm run setup`; `-- --qr` for a phone) |
| 3 · Mon 5 Oct | Viewer page: the set behind the 402, pay per 10 s or free + tips, tip button, orientation | **server side done Sun 4** (the set cut, gate, passes, tip; `npm run check` passes). Browser wallet and a first Pocket page (`/pocket.html`: top up 100 test sats, Take it home) done Sun 4, seen on both phones and the Mac. Viewer page at `/` (TEST banner on every page; status check moved to `/status.html`): plays, pays 1 sat per 10 s, tips, goes full screen sideways; seen on the Mac. Left: Monday's list below |
| 4 · Thu 8 Oct | Stretch goal with refunds; Pocket / Take it home; safe retry (+ PROPOSAL.md renamed "Retry-safe 402") | |
| 5 | Languages (EN/DE; ES/FR/PT if time); TEST banner; Stripe test mode if time | |
| 6 | Polish on the real phones; 3-minute script and slides; first full run | |

Evenings this week: Sun 4, Mon 5, Thu 8. Ask each week (next: Sun 11 Oct). Two evenings done on Sun 4, so about 6 left to the freeze for 4 planned: **2 spare**.
**Cut order if behind:** Stripe test mode, then ES/FR/PT, then the room ticket.

## Monday 5 Oct (2 to 3 hours; agreed Sun night)
1. **Tip sats, your amount**: a third button right of the tip; asks for an amount, pays it as its own 402. (~20 min)
2. Setup: **title + description (optional)** instead of title + artist; the tag line shows the title only.
3. **Player controls on the picture**, like YouTube: play/stop bottom left, "This set: n sats", full screen bottom right. Below the player: the money buttons only, compact (the tip label can be short, e.g. "🍺": it's the account holder's own text).
4. Setup "orientation" becomes **video shape**: landscape 16:9 or portrait 9:16. Turning the phone sideways still goes full screen.
5. Phone sideways: the TEST strip shrinks to a small corner tag, so it stops covering the picture.
6. Free mode: hide the per-10-s price and "This set"; check on the phones.
7. Then start evening 4: the **stretch goal with refunds** (the pledge gate on the server, from the hackathon).

## Plan to the freeze (Wed 21 Oct)
- **Thu 8 Oct:** goal with refunds finished on the phones; safe retry demo (lost reply, same payment, charged once) + PROPOSAL.md as "Retry-safe 402".
- **Week of 12 Oct (ask on Sun 11):** EN/DE (+ ES/FR/PT, machine-translated); Stripe test mode (should: the card rail for fiat tippers); polish on the phones; the 3-minute script and slides; **first full run by Wed 14 Oct**.
- **To 21 Oct:** fixes from the runs only. Being ahead buys rehearsal, not features: the hackathon's first lesson.

## Commands
- `npm start`: mint, server, tunnel. `npm run setup` (or `-- --qr`): the setup page.
- `npm run check`: a phone's night from the command line (top up, pay the set, safe retry, reuse refused, tip). Run it after any server change.
- `npm run cut-set -- <video>`: cut a recorded set into 10-s pieces in `media/set/` (not in git). Tonight's set: `~/Documents/Longy at Peggy Sue's Music Bar 2025.mp4` (29.7 s → 3 pieces, the last padded to 10 s). Your own 3 clips are kept in `media/source/`.

## Notes
- The hackathon repo is now `rajesh-taylor/nutpub-btcppberlin26` (local: `~/Documents/NutPub`). Its old mints (:3338, :3339) and its old quick tunnel are still running; nothing here uses them.
- Copied across so far: the NUT-24 gate (replay list now on disk), segment cutting, the Coco wallet wrapper (with the pledge and refund calls, not used yet). Still to come: the pledge gate on the server (Thu), the EN/DE table.
- `npm start` builds the browser bundles (`public/js`, not in git) before anything else.
