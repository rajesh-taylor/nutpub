# Expo script: 3 minutes, 3 judges (as built, Fri 2 Oct)

**Devices.** Mac: the stage, `/stage.html#k=…` (gift QRs, one lamp per phone, curtains, the goal). Pixel: the bar (camera → bar page) and your own fan tab for Basement58. iPhone: Rupert, `/rupert.html`. The judges' phones: everything else.

**Before each group:** stage → **New show** (everyone pays the door again, the goal resets). The float needs ~320 sats per group of 3 (gifts 315; door and stream money comes back; poured pints come back; unpoured pints come back at last orders). Optional: `CURTAINS_AT=3` in `.env` so the curtains open by themselves.

| Time | On screen / action | Say |
|---|---|---|
| 0:00 | Stage: **Next gift · guest 105**, one judge scans; next gift for the next judge | "The NutPub: a pub where the tickets, the bar and the band all take ecash. Scan this. That's 105 sats each." |
| 0:15 | Their phone: *105 sats in your pocket*. They tap **Ticket · 21 sats**. A lamp lights on the stage for each phone | "That's Cashu's own HTTP 402, NUT-24. No list of names at this door: if your sats ain't signed, you ain't coming in. Everyone in the room gets a free first pint." |
| 0:30 | iPhone, suit mode: three taps, three trombones | "Rupert, the Man from the Ministry of Fiat. He pays in SuitCoin. Printed it this morning." 🎺 "Fine, it says NutPub money now." 🎺 "Real NutPub Mint notes carry a maths hologram. The door checks it without phoning the mint." |
| 0:50 | Stage: **Curtains up** (or automatic at 3). Lights up on every phone and the stage | "In the room you paid once. At home on the livestream your phone gets a fresh 402 every ten seconds. Stop paying and the music stops." (A judge can tap **Tune into the livestream**; turn the phone sideways for full screen.) |
| 1:05 | A judge taps **Free pint**; the Pixel scans the QR, **Pour it**; their phone fills with beer. Scan the same QR again | "Your pint is ecash locked to the bar's key. Your phone lit up because the mint said it was spent." 🎺 *Already poured, mate.* "Copy it all you like. It only pours once." |
| 1:30 | Your fan tab (Pixel): **Basement**, wait for the next payment: *Signal lost… asking again with the same payment* → *Same payment, same song. Charged once.* → **Same payment, next song?** → 🎺 *Refused* | "Basement bar, the signal drops right after you pay. Did it go through? Same payment, same song: charged once. Same payment for the next one: no. That rule is our Base58 proposal." |
| 1:55 | Judges tap **A round for the band** (21 each; goal 63). Seven stage lights climb. **Longy's paid!** Amber, sats rain | "Round for the band? This 402 asks for a *locked* token: to Longy, with a refund key your phone just made for you." If `LONGY_LN` is set and the stage says *Went to Longy over Lightning ✓*: "And he's paid over Lightning before he's unplugged his guitar." If they miss: "Every sat you pledged comes home at last orders. Nobody presses refund." |
| 2:40 | Tap the amber screen → closing time | "Built on Cashu's new 402, standard NUTs on a public mint. Drinkers identified: zero. And Rupert's at the KYC Kebab Shack on your phone, if you dare." |

**Only say it if it's on screen:** "paid over Lightning" (needs `LONGY_LN`), "Longy's track" (needs the file; otherwise "a placeholder tone tonight").

**If something breaks:** Rupert down (SuitCoin mint off) → skip to curtains. Pint QR won't open on the Pixel → skip the pint. Basement58 doesn't drop → say the line, show `PROPOSAL.md`. Goal misses → that's the refund story, tell it.
