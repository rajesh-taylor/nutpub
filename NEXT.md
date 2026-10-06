# Next

**Goal:** a 3-minute demo on the Cashu dev call, **Thu 29 Oct 2026** (date and time to be confirmed: usually the last Thursday of the month; screen share, slides before and after).
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
| 4 · Thu 8 Oct | Stretch goal with refunds; safe retry demo (+ PROPOSAL.md renamed "Retry-safe 402") | |
| 4b · extra evening this week (2 h) | Design pass on the phone screen first (a mock-up: what gets the top two-thirds, how the feed grows); then **messages with tips**, open from doors | |
| 5 · Sat 10 Oct (3 h) | **Doors and Start the show**: holding page with a 2–4 photo slideshow (setup page), see-through player; host's **Start the show** → lights up on every phone, then the set; **Back to doors** if pressed by mistake | |
| 6 · Sun 11 Oct (3 h) | **Room ticket + welcome**; the room filling (one stage light per phone at doors); TV layout if time | |
| 7 · week of 12 Oct | Polish on the real phones; 3-minute script and slides; **first full run by Wed 14** | |

Changed Tue 6 Oct: an extra 2-hour evening this week and 3 hours each on Sat 10 and Sun 11. **Stripe test mode is out** (BACKLOG, v2.0;
no greyed-out card button on the show page: one line on the closing slide instead). The freeze stays **Wed 21 Oct**: it's when
demo practice starts; building carries on after the call.
**Cut order if behind:** the TV layout, then the room filling (lights up stays), then the room ticket. Messages and Start the show stay.

## Monday's list (done Tue 6 Oct instead; Monday was missed)
Done Tue 6: 1, 3, 5, 6 (looked over and approved; committed `cc3fa37`), then 2 (phones to check), plus:
- **Pocket is now Wallet** (clearer, says money): `/wallet.html` (`/pocket.html` redirects); the setting is `wallet.on` (old shows load).
- Wallet page: Back to set + Take it home side by side; no top-up there (it's on the viewer page); notes in cream, as three bullets.
- Tip is one tap (the price is on the button). A reload carries on at the pass's next unpaid piece (it used to replay paid pieces free, so an empty wallet looked like it played).
- Quiet buttons and notes in cream, not grey; player controls in amber: venues are dark rooms.

1. **Tip sats, your amount**: a third button right of the tip; asks for an amount, pays it as its own 402. **done**
2. Setup: **title + description (optional)**; the tag line shows the title only. The artist field stays (Tue 6): the buttons use the name ("Send Longy a message").
   Also today: the wallet balance shown large, above the money buttons, so it's seen before tipping. **done** (phones to check): description under the title on the viewer page (hidden when empty); the balance in a box with "+100 test sats" and Wallet.
3. **Player controls on the picture**, like YouTube: play/stop bottom left, "This set: n sats", full screen bottom right. Below the player: the money buttons only, compact (the tip label can be short, e.g. "🍺": it's the account holder's own text). **done**: edge to edge on phones; full screen button (real full screen on Android and the Mac; on iPhone the page fills the screen); messages just under the picture (over it in full screen).
4. Setup "orientation" becomes **video shape**: landscape 16:9 or portrait 9:16. Turning the phone sideways still goes full screen. **done** (phones to check): setting `shape` ('16:9' default, '9:16'); the old `orientation` never changed the page, so it's dropped.
5. Phone sideways: the TEST strip shrinks to a small corner tag, so it stops covering the picture. **done** (full screen too)
6. Free mode: hide the per-10-s price and "This set"; check on the phones. **done** (phones to check)
7. **Background photo** (last of the list, Tue 6): upload one on the setup page (size and type checked, kept in `data/`, never in git); the viewer page shows it dimmed with grain, behind the player. Default until one is uploaded: the Berlin picks (before Play `peggy-5-1372`; while playing `fp-32`, `fp-37`, `peggy-17-8266`; files in the hackathon's `public/img/candidates/`, copied to `public/img/`, git-ignored). **done** (phones to check): Setup page → Background photo → Choose a photo (saved at once; the server checks the first bytes, not the file name; 5 MB at most) or "Use the Berlin photos". Kept in `data/photo.*`. The Berlin picks are in `public/img/` (git-ignored): after a fresh clone, copy them from the hackathon's `public/img/candidates/`, or the page is plain midnight. `npm run check` tries an upload only when none is up.
8. **Wallet: paste ecash** (receive a token from any Cashu wallet), as the hackathon Pocket had. **done** (phones to check): this show's mint only (another mint's note is refused, said plainly); a used note says so.
9. **A page per artist**: the viewer page at `/longy` too (`nutpub.rajeshtaylor.com/longy`), so "one link per artist" is true on the call. (~10 min) **done** (phones to check): the address comes from the artist's name. **Host flow** (added Tue 6): the private setup link is the host's login (no accounts); the setup page opens with **Share the show** (the link, Open the show page, Copy, Share on a phone, a QR code at `/api/show/qr.svg`). No setup link on the show page (it looked like an open door on a shared screen; the host keeps two tabs). The meter ("This set", the price per 10 s) moved off the picture into the wallet box.
10. Then start evening 4: the **stretch goal with refunds** (the pledge gate on the server, from the hackathon).

## Added Tue 6 Oct (agreed)
- **Messages with tips** (extra evening, 2 h). "🍺 · 21 sats" stays one tap. A new **"Send Longy a message"** button: an amount + a message (≤ 140 characters), paid as its own 402. A **feed between the picture and the wallet**, newest first, refreshed every few seconds on every phone (and on the artist's view). Setup page: the message button's label and the tip emoji; button text takes the artist's name.
- **Doors and Start the show** (Sat 10). Doors: whoever opens the link sees the holding page: the title, the start time, a slideshow of the host's 2–4 photos (picked on the setup page), the player see-through, messages and tips already open (people chat from 7:30 for an 8:00 start). The host presses **Start the show** on the setup page: on every phone, lights up (black, three stage lights one by one, then the artist; from the hackathon), then the set. **Back to doors** undoes it: every phone goes back to the holding page, the set stops, nothing more is charged.
- **The comments feed takes the bottom of the phone screen**: about a third at first, half once it fills. Design pass before building it.
- **Room ticket + welcome** (Sun 11, ~1.5 h). The ticket is a 402 of its own; a phone holding one plays the set without paying per 10 s and sees: "You're in the room. The set plays free; leave a message for the night, and tip." (Already on the setup page; now built, not cut.)
- **Landscape / TV layout** (Sun 11 if time, ~1 h). Wide screens and a TV (people at home mirror it): picture left, messages right, like a video site's live chat. A phone held sideways stays picture only.
- **To BACKLOG, not v1.0: comments from Fountain and zap.stream** (both Nostr: live chat and zaps are public events we could read from relays). Longy's set isn't on either, so the feed would be empty on the call unless staged; their sats are real and ours are test sats (only say on screen what's true). First topic for the design session after 29 Oct.

## Plan to the freeze (Wed 21 Oct)
- **Thu 8 Oct:** goal with refunds finished on the phones; safe retry demo (lost reply, same payment, charged once) + PROPOSAL.md as "Retry-safe 402".
- **Extra evening this week:** design pass, then messages with tips. **Sat 10:** doors and Start the show. **Sun 11:** room ticket, the room filling, TV layout if time.
- **Week of 12 Oct (ask on Sun 11):** polish on the phones; the 3-minute script and slides; **first full run by Wed 14 Oct**.
- **Languages are out of v1.0's musts** (decided Sun 4 Oct: the dev call is in English). If the musts, the runs and their fixes are all done, EN/DE first, then ES/FR/PT. The background photo took their place.
- **To 21 Oct:** fixes from the runs only. Being ahead buys rehearsal, not features: the hackathon's first lesson.

## Commands
- `npm start`: mint, server, tunnel. `npm run setup` (or `-- --qr`): the setup page.
- `npm run check`: a phone's night from the command line (top up, pay the set, safe retry, reuse refused, tip). Run it after any server change.
- `npm run cut-set -- <video>`: cut a recorded set into 10-s pieces in `media/set/` (not in git). Tonight's set: `~/Documents/Longy at Peggy Sue's Music Bar 2025.mp4` (29.7 s → 3 pieces, the last padded to 10 s). Your own 3 clips are kept in `media/source/`.

## Notes
- The hackathon repo is now `rajesh-taylor/nutpub-btcppberlin26` (local: `~/Documents/NutPub`). Its old mints (:3338, :3339) and its old quick tunnel are still running; nothing here uses them.
- Copied across so far: the NUT-24 gate (replay list now on disk), segment cutting, the Coco wallet wrapper (with the pledge and refund calls, not used yet). Still to come: the pledge gate on the server (Thu), the EN/DE table.
- `npm start` builds the browser bundles (`public/js`, not in git) before anything else.
