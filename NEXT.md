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
| 3 · Mon 5 Oct | Viewer page: the set behind the 402, pay per 10 s or free + tips, tip button, orientation | |
| 4 · Thu 8 Oct | Stretch goal with refunds; Pocket / Take it home; safe retry (+ PROPOSAL.md renamed "Retry-safe 402") | |
| 5 | Languages (EN/DE; ES/FR/PT if time); TEST banner; Stripe test mode if time | |
| 6 | Polish on the real phones; 3-minute script and slides; first full run | |

Evenings this week: Sun 4, Mon 5, Thu 8. Ask each week (next: Sun 11 Oct). Two evenings done on Sun 4, so about 6 left to the freeze for 4 planned: **2 spare**.
**Cut order if behind:** Stripe test mode, then ES/FR/PT, then the room ticket.

## Notes
- The hackathon repo is now `rajesh-taylor/nutpub-btcppberlin26` (local: `~/Documents/NutPub`). Its old mints (:3338, :3339) and its old quick tunnel are still running; nothing here uses them.
- Proven pieces still to copy across (when their evening comes): the NUT-24 gate, the pledge lock and refund, the Coco wallet wrapper, segment cutting (audio and video), the EN/DE table.
- The set: `~/Desktop/Longy at Peggy Sue's Music Bar 2025.mp4` (30 s) → 3 × 10 s, into `media/` (not in git).
