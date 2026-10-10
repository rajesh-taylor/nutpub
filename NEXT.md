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
| 4 · Sat 10 – Tue 13 Oct | **Locked to Longy** (below), first | **done Sat 10** (`npm run check` passes; phones to check): every 402 is locked to Longy's key; the gate verifies (lock, DLEQ, NUT-07 unspent) and never swaps; key, Collect and the greyed-out *Send to my Lightning wallet* on `/takings.html` (setup page → *Longy's takings*; open it once before the show, or every 402 answers 409). Left: the real melt to his Lightning address (BACKLOG) |
| 5 · Sat 10 – Tue 13 Oct | Stretch goal with refunds; safe retry demo (+ PROPOSAL.md renamed "Retry-safe 402") (was Thu 8) | |
| 6 · Sat 10 – Tue 13 Oct | Design pass on the phone screen first; then a **comments panel like YouTube / PeerTube live chat** (beside the player on wide screens, under it on phones), open from doors: free comments plus **messages with tips** shown highlighted (tip minimum 21 sats, custom box too); a short cooldown per browser for free comments; word filter, host **messages off**, host **delete a message**, "a removed message isn't refunded"; no IP addresses logged | |
| 7 · Sat 10 – Tue 13 Oct | **Doors and Start the show**: holding page with a 2–4 photo slideshow (setup page), see-through player; host's **Start the show** → lights up on every phone, then the set; **Back to doors** if pressed by mistake | |
| **Wed 14 Oct, evening** | **First full run** | |
| 8 · Wed 14 – Tue 20 Oct | **Poster ticket** and **Numo at the door** (below); then tightening only. Also the 3-minute script and slides | |

Changed Tue 6 Oct: an extra 2-hour evening this week and 3 hours each on Sat 10 and Sun 11. **Stripe test mode is out** (BACKLOG, v2.0;
no greyed-out card button on the show page: one line on the closing slide instead). The freeze stays **Wed 21 Oct**: it's when
demo practice starts; building carries on after the call.
**Cut order if behind:** the TV layout, then the room filling (lights up stays), then the room ticket. Messages and Start the show stay.

## Changed Sat 10 Oct (agreed)
A test project, a concept, with Longy as the only use case. **Test sats on the call** (our test mint; no Minibits). First full run **Wed 14 (evening)**; freeze **Wed 21**; practice Thu 22 – Wed 28.
- **Locked to Longy.** Every payment (10-s pieces, tips, tickets) is locked to Longy's key (NUT-11, no locktime; the goal's pledges keep locktime + refund to the fan). The gate checks and never swaps: DLEQ (NUT-12), the lock names Longy, unspent at the mint (NUT-07), a replay list per proof. Longy's key lives on his takings page, where his payments collect: our server can't spend a sat. **Send to my Lightning wallet** (NUT-05 to his Lightning address) is built but off on the test mint, and the page says so.
- **English only, 🇬🇧 GBP only.** Languages are dropped (were in BACKLOG).
- **Stripe is back, as a link only:** the setup page asks for a Stripe Payment Link (the artist's own account, test mode). No Stripe keys stored. The card button shows **greyed out ("Card payments not set up")** until a link is pasted (reverses Tue 6).
- **A responsibility note on the setup page:** running it for your own shows on your own server makes you the provider under the Online Safety Act (risk assessment, report button, takedown, NCA registration); adult performers only; your own songs only, every writer a PRS member.
- **Poster ticket** (the room ticket, sold before the show): the poster's QR and link open **the show page** (`/longy`), one address for everything; before doors it shows *Tickets for the room*. Setup page: *Tickets for the room* (price in sats, optional Stripe link), and **Print poster** next to *Share the show*: `/longy/poster`, a print-ready A4 page (photo, title, date and time, a large QR, the link in big type; Print → Save as PDF). Tickets: **Bitcoin** (a 402 locked to Longy; the phone shows a ticket QR) or **Card** (opens the Stripe link).
- **Tips live on the call:** devs on the call open the show link, tap "+100 test sats", and tip with a message; it shows highlighted in the comments panel on the shared screen within seconds. Test sats on the test mint. Expect them to try to break it: message text is always shown as plain text (never HTML), the word filter and cooldown are on, and the host has **messages off**, **delete** and **slow mode** (the feed holds new messages back so each can be read) to hand. 10–20 people on the call.
- **Numo door → free pint** (for the call): shown through the Pixel's scrcpy mirror (`nutpub`). Numo sells *Door entry* (real sats, Rajesh pays himself) → webhook → the door screen plays three stage lights, then Longy, then a **free-pint QR** (21 test sats locked to the bar's key, as at the hackathon: `server/pint.js`, `client/bar.js` in the hackathon repo) → scanned into a phone's wallet → the Pixel's bar page pours it ("Already poured, mate" on a re-scan). Unlike the hackathon, the bar's key lives on the bar page, not the server. Say on screen: the door was real sats, inside is test sats.
- **Call checklist:** share the screen **with computer sound** (Longy's clip); the scrcpy window and the show page side by side; a fallback screen recording of a full run; Numo's webhook pointed at the current address (change it if the domain changes); USB debugging off afterwards.
- **Domain:** decided by Sun 25 Oct. If it changes then: new tunnel route, new browser wallets (test sats, so just top up again), Numo's webhook updated, and one practice run after the switch.
- **Live from OBS** is a section on the setup page, empty by default (OBS server, stream key, playback link): empty = the recorded set plays, as on the call. Wired up with Aaron after the call. The door phone scans a bitcoin ticket: "You're in", then "Already in, mate". A ticket plays the set without paying per 10 s. Copy: "Card: Stripe knows who you are. Bitcoin: nobody does."
- **Numo at the door** (for the call): Numo on the Pixel sells *Door entry* in real sats (Rajesh pays himself; the money stays in Numo). Its `payment.received` webhook tells our server, and the **door screen** plays three stage lights, quickly, then Longy's photo; the room count goes up. No Numo fork. Numo stays on the Minibits mint; pay its Lightning QR from a wallet other than the Minibits app, and check it at every practice run.
- **Not in v1.0:** recordings, live video from OBS, any server but the Mac. **Cut order now:** the TV layout, the room filling, the poster ticket's card button, the free pint, the Numo door. The 3-minute script decides which beats are shown.

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
