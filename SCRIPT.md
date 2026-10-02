# Expo script: 3 minutes, 3 judges (Fri 2 Oct, 15:30 Berlin, Talks Stage)

**Devices.** **Mac** = the stage, `/stage.html#k=…` (gift QRs, one lamp per phone, curtains, the goal). **Pixel** = the bar (its camera opens the bar page) and your presenter tab for Basement58. **iPhone** = Rupert, `/rupert.html`. **The judges' own phones** = everything else.

**Today (judging at the desk, Fri afternoon):** the server runs on the Mac's fake mint (`KITTY_URL=http://127.0.0.1:3338`, `LONGY_LN=` empty: no fake "paid over Lightning"). Minibits was down at 15:00 Berlin. The Mac on the desk is the stage screen.

**Before each group (2 min):**
1. Stage → **New show** (everyone pays the door again; goal and lamps reset).
2. Pixel presenter tab (`localhost:8787`, the one that has opened `#k=`): pay the door with a **Livestream pass** (1 sat). It's crew: it lights no lamp and doesn't raise the goal (goal = 21 × judges = 63).
3. iPhone: Rupert page open, first button showing. Pixel: camera app ready. Float: ~320 sats per group of 3.

**How to read this.** Left: who taps what. Middle: the story, in character. Right: **step out**, name the NUT the judge just watched in one or two plain sentences, then step straight back into the story. "—" = stay in the story.

---

## Desk flow (loose): one judge, their own phone, ~3 minutes

**The story in one line:** a night out needs money to do four jobs: **get you in, pay as you go, chip in for the band, and come home with you.** Each job is a NUT, and the judge watches each one happen on their own phone. (Rupert stays in the background: show him only if asked about counterfeits.)

| The job | Judge taps | What they see | The NUT, in one plain sentence |
|---|---|---|---|
| **0. Money in your hand** | Scan the gift QR | *105 sats in your pocket* | **NUT-00 to 03**: ecash is notes the mint signed blind; your phone holds them, no account, and the mint can't tell whose they are. |
| **1. Get you in** | **Livestream pass · 1 sat** | Straight into the player | **NUT-24 + NUT-18**: the server answers "402, payment required" with a payment request; the phone pays inside the same web request. **NUT-12**: the door checks the mint's signature on the note itself, offline. |
| **2. Pay as you go** | Watch; then **Stop paying**, **Play** | Longy's video; *This set: n sats* climbs 1 per 10 s; Stop = silence at once | **NUT-24, every 10 seconds**: each 10 s of sound and picture is its own 402. No subscription, no card on file: stop paying and it stops. |
| *(Basement58, your Pixel tab)* | **Basement** | *Same payment, same song. Charged once.* → *Refused* | **Our Base58 proposal** for NUT-24: a lost reply is retried with the same token; a token can't buy a second song. |
| **3. Chip in for the band** | **A round for the band · 21** | Lamps fill; **Longy's paid!** (goal = 21 × phones) | **NUT-18 `nut10` + NUT-11**: the 402 *requires* a locked token: to Longy's key, a locktime at last orders, and a refund key the phone made for itself. Goal missed? After last orders each phone takes its own back: no refund desk. **NUT-07**: the server checks the pledges are unspent without taking them. |
| **4. Come home with you** | **Pocket** → **Top up 100** → then **Take it home** | +100 (the test mint's Lightning pays itself); then one note to paste into any Cashu wallet | **NUT-04**: Lightning in, ecash out. **Take it home**: the whole pocket as one bearer note. **NUT-05** (Lightning out) pays the artist; it's off today so the screen never claims a payment that didn't happen. |

**Close:** "Drinkers identified: zero. Every NUT on this list is standard Cashu, on any mint; the one thing that isn't, retry-safe 402s, is our Base58 proposal."

**Ticket in the room instead of the pass** (if there's time): the free pint shows **NUT-11** locked to the bar's key and **NUT-07** (the phone lights up when the mint says it's spent).

## The pre-story: the gift (as they walk up; before the clock if you can)

**Say (two sentences):**
> "This QR is a gift: 105 sats of ecash, notes signed by a Cashu mint, and when you scan it they land in a wallet inside your phone's browser. No app, no account: it's your money for the night and you buy your own ticket with it. Today it's a test mint on my laptop with pretend Lightning; the same code runs on Minibits with real sats."

Mac: **Next gift · guest 105** → judge 1 scans with the camera → *105 sats in your pocket* → **Next gift** → judge 2 → judge 3.

## The night

| Time · who taps what | Story (say it) | Step out: the NUT |
|---|---|---|
| **0:00 · The door.** Judges tap **Ticket · 21 sats**. A lamp lights on the stage for each phone. | "The NutPub: a pub where the tickets, the bar and the band all take ecash. **The ecash on your phone pays your way in.** If your sats ain't signed, you ain't coming in." *(Not a word about the pint.)* | **NUT-24**, Cashu's HTTP 402: the door answered "payment required" with a payment request, and your phone paid it inside the same web request. No invoice, no app switch, no name. |
| **0:20 · Rupert.** You, iPhone: **Pay in SuitCoin** 🎺 → **Pretend it's NutPub money** 🎺 → **Try again, with confidence** 🎺 | "Rupert, the Man from the Ministry of Fiat. He pays in SuitCoin. Printed it this morning." 🎺 "Fine, it says NutPub money now." 🎺 "Same notes, fresh confidence." 🎺 *Sir, this is NutPub.* | **NUT-12**, DLEQ: every real note carries a maths proof that the mint signed it. The door checks it against the mint's public key on its own machine, without phoning the mint, so relabelled notes fail. |
| **0:45 · Inside: the surprise.** The *Free pint* button is there. A judge taps **Free pint** → QR. You, Pixel camera → bar page → **Pour it**. Their phone fills with beer. Scan the same QR again. | "**First pint's on the house while the support acts warm us up.** Ticket holders only: you're in the room." … 🎺 *Already poured, mate.* "Copy it all you like: it only pours once." | **NUT-11**: the pint is 21 sats locked to the bar's key, so only the bar can spend it, with a **locktime** at last orders and a **refund** key for the house: unpoured, it goes back by itself. Then **NUT-07**: your phone never heard from the bar; it asked the mint "is my pint spent?" and lit up on yes. |
| **1:15 · Lights up.** Mac: **Curtains up**. Lights up on every phone and the stage; Now playing. You, Pixel presenter tab: the stream is playing. | "**Longy's on. Live from anywhere, 10 seconds at a time. Stop paying, the amp goes quiet.** In the room you paid once. At home your phone gets a fresh 402 every ten seconds." *(A judge can tap **Tune into the livestream**; sideways = full screen.)* | — (the same NUT-24, every 10 seconds: no new NUT, keep moving) |
| **1:30 · Basement58.** You, Pixel presenter tab: **Basement**, wait for the next payment: *Signal lost… asking again with the same payment* → *Same payment, same song. Charged once.* → **Same payment, next song?** → 🎺 *Refused.* | "Basement bar: the signal drops right after you pay. Did it go through? Same payment, same song: charged once. Same payment for the next song: no." | Not a NUT yet: our **Base58 proposal**, an addendum to NUT-24. A token is bound to the request it paid for, so a retry is safe and a reuse isn't. |
| **1:55 · A round for the band.** Judges tap **A round for the band** (21 each; goal 63). Seven stage lights climb. **Longy's paid!** Amber, sats rain. | "Round for the band? Twenty-one each, and it only goes to Longy if the room hits the goal." … "**The room hit the goal. Paid before he's even unplugged.**" | **NUT-18** payment request with **`nut10`**: this 402 *requires* a locked token, to Longy's key, locktime at last orders, plus a refund key your phone made fresh for this pledge. Most 402s refuse tokens with conditions; this one refuses tokens without them. |
| **2:20 · Paid.** Today the stage says *The room hit the goal* (payout off on the test mint). | "His takings sit as ecash under his key, claimed the moment the goal hit." | **NUT-05**: give it his Lightning address and the mint melts the takings straight to it. Tested on this mint; off today so the screen never claims a payment that didn't happen. |
| *If the goal misses* (a judge didn't pledge): the stage says *Missed* at last orders. | "**Missed it. Every sat goes home on its own. No refund desk, no queue.**" Phones: *+21 sats home*. | The locktime passes and each phone signs its own refund path (NUT-11 refund key): nobody presses refund. |
| **2:30 · Closing time.** Judges tap the amber screen → *Cheers. That was Longy.* · *Drinkers identified: 0*. Point at **Pocket**. | "Built on Cashu's new 402, standard NUTs, any Cashu mint. Drinkers identified: zero. Your change is yours: **Pocket → Take it home** puts it in any Cashu wallet. And Rupert's at the KYC Kebab Shack on your phone, if you dare." | **NUT-04**: run dry, and Pocket tops up from any Lightning wallet: the mint sells you ecash for an invoice. |
| **3:00** | Stop. | |

**Last orders with a pint unpoured** (a judge never tapped Free pint): their phone says *Your free pint's still behind the bar. When the bell rings it goes back to the house. That's the lock on it, not us.* Say it as it shows, then **Show me my pint** and pour.


## Short version: one judge, livestream only (desk judging, Fri afternoon)

| Who taps what | Story (say it) | Step out: the NUT |
|---|---|---|
| Mac: **New show** → **Curtains up** → **Next gift · guest 105**. Judge scans. | Gift line (above). | — |
| Judge: **Livestream pass · 1 sat**. Straight into the player; Longy's video in ~10 s; sideways = full screen. | "You're at home. Longy's on, 10 seconds at a time. Stop paying, the amp goes quiet." | **NUT-24**: every 10 seconds is its own 402; the phone pays it inside the request. The picture for those 10 s is only handed to a phone that paid for them. |
| Judge: **Stop paying**, then **Play** again. | "Stopped. Nothing more is charged." | — |
| You, iPhone: Rupert, three taps (optional). | Rupert lines. | **NUT-12** (DLEQ offline). |
| Judge: **A round for the band · 21** (goal 21 with one phone) → **Longy's paid!** | "A round for the band, from home." | **NUT-18 + nut10**: the 402 requires a locked token, to Longy, with a refund key the phone made. Missed goal → it comes home by itself (NUT-11 refund). |
| Judge: tap the amber screen → closing time; point at **Pocket → Take it home**. | "Drinkers identified: zero." | **NUT-04** top-up, if asked. |

## Where the ecash lives (say it right, to judges and to anyone watching)

> "Your sats live in a wallet inside the browser on your phone, at this web address. Close the tab and they're still there: open nutpub.rajeshtaylor.com again. They're gone if you clear your browsing data, use a private window, or open it in another browser or phone; and on iPhone, Safari wipes a site after 7 days without a visit. So take it home: Pocket → Take it home moves them into Minibits or cashu.me. And the mint is custodial: pub money, not savings."

The Pocket page says the same (🇬🇧 and 🇩🇪), with the address filled in.

## If you're behind the clock
- **At 1:30 and behind:** skip Basement58 on the phone, just say the line; point at `PROPOSAL.md`.
- **Rupert:** two taps, not three (drop "Try again, with confidence").
- **The NUT-04 aside** is the first to go: say it only if asked.
- **KYC Kebab Shack:** not demoed in the 3 minutes. One line at closing; the judges can open it themselves afterwards.

**Only say it if it's on screen:** "paid over Lightning" (needs *Went to Longy over Lightning ✓*), "Longy live" (today: a 30-second clip of him at Peggy Sue's, on a loop).

**If something breaks:** Rupert down (SuitCoin mint off) → skip to inside. Pint QR won't open on the Pixel (no internet in Vanadium) → skip the pint, say the NUT-11 aside anyway. Basement58 doesn't drop → say the line, show `PROPOSAL.md`. Goal misses → that's the refund story, tell it. Fixed address down (`curl -sI https://nutpub.rajeshtaylor.com` says 530) → check `data/tunnel-named.log`: cloudflared reconnects by itself within ~30 s once the Mac is back online.
