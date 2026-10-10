# Backlog (after 29 Oct, not before)

Nothing here gets built before the Cashu dev call. Something comes out before anything goes in.

- **Live from OBS with Cloudflare Stream** (chosen Sat 10 Oct; replaces a box of our own for video). A Stream live input gives an RTMPS/SRT server URL + stream key; the setup page shows them so a streamer adds us as one more destination in OBS (beside Fountain). Their OBS multistreams; we never relay out. Stream's recording off (nothing stored). Live mode is free + tips: Stream's video doesn't pass our 402, so pay per 10 s stays with the recorded set until a key-per-slice design. About $1 per 1,000 minutes watched. Not near term (Aaron isn't using it yet).
- **Won't build** (Sat 10 Oct): running a real mint; holding or forwarding anyone's sats; multistream relay-out; server-side transcoding or dual output; recordings or replays (artists' own apps do that); follower lists; "X joined" notices; IP blocklists; location questions; other languages.
- **A/V-team roles**: a venue's sound, lights, ticketing and bar as separate logins (v1.0: one account type).
- **Messages with tips** (like ShoSho). On desktop: comments and sat donations in a panel to the right of the player, not over the picture (like YouTube live chat). Mobile with a 16:9 video: comments in a box under the player, so the streamer reads them fast and only viewers see the money buttons (closer to what new users know). **Moved into v1.0 on Tue 6 Oct** (our own feed, and the panel on the right for wide screens and TVs; see NEXT.md). What stays here: the streamer-only view, and comments without a tip.
- **Several quick-tip buttons**, each with its own emoji and price, set in the template (e.g. 🍺 21, 🍕 100, 🎸 500). The row under the wallet box already has room (Tue 6 Oct).
- **Comments from Fountain and zap.stream** (Nostr, NIP-53: live chat and zaps are public events on relays). Read them into the messages feed, marked with where they came from; sending ours back needs a Nostr key and real Lightning zaps. First topic for the design session after the call (decided Tue 6 Oct).
- **An MCP / agent API**, and agent payments (own session).
- **The Pass umbrella and real fiat** (own session; v1.0 has a Stripe Payment Link button only, Sat 10 Oct).
- **The cloud-server move**: Docker Compose on a small server, so the demo runs without the laptop.
- **Real money at Bitfest** (Aaron: the music livestream and its artists, a few hundred people). Options:
  - Lightning only: tips straight to each artist's Lightning address. No mint, no custody.
  - Otherwise: a small Hetzner server, and a real Lightning backend (e.g. phoenixd) for our own mint vs a public mint.
  - Either way: who holds the sats, and the custody question that comes with it.
- **Lightning payout to the artist (NUT-05)**: the code path stays off; a test mint can't pay a real invoice.
- **A product domain.** Not under Refueler (closed-loop stamp mint, FCA position). Candidate: thenutpub.com (free on 4 Oct, $10.46/yr; nutpub.com and nutpub.net are taken). Streamers get `thenutpub.com/<name>`, no domain of their own. Switch addresses before practice or after the call, never during: a new address means new browser wallets.
- **Several mints, chosen by the account holder** (like Numo's mint list: a main mint, others accepted). NUT-18 lets a payment request list several mints (`m`). Accepting ecash from a mint you don't trust means moving it over Lightning (melt there, NUT-05; mint here, NUT-04), so it needs real Lightning: not on the test mint.
- **A free one-minute test broadcast** for new streamers, with the brand in the player (like the TEST strip).
- **Fiat tippers:** Stripe tips (v1.0 uses a Payment Link for tickets only); real fiat is its own session.
- **Pay one-offs straight from the viewer's own wallet** (tip, your amount, ticket): a QR with a NUT-18 payment request, or a Lightning invoice. Pay-per-10-s still needs the Pocket (a payment every 10 s can't wait for a wallet app).
- **An embed code** (iframe) so streamers put the player on their own site, instead of a domain of ours per streamer. Note: browsers partition storage by the top-level site, so the Pocket inside an embed on `aaron.example` is a different wallet from the one on our own page.
- **A pre-show screen** with several photos (a slideshow before Play), or a short loop video, on top of v1.0's single background photo. A countdown to the start time.
- **A login for hosts** (after the call; noted Tue 6 Oct): today the setup page opens with a private link. A login that keeps our promise: no custodial accounts, no email list. Passkeys or a Nostr login fit; the login opens the setup page and templates, it never holds anyone's sats.
- **Comments that float up from the bottom right** over the picture, as in ShoSho and Instagram live (on top of the feed under the player).
- **The night's messages as a file** for the host (download or copy: time, amount, message).
- **Show stats for the host**: phones watching, sats taken (stream, tips, tickets), the goal. Say plainly what the platform sees: today our server runs the gate and holds the takings, so it sees amounts and counts, never names. "We never see it" is only true once hosts run their own server.
- **Let the viewer choose how to pay**: Cashu (private: the mint can't tell who paid what) or straight from a Bitcoin/Lightning wallet (no mint, less private), said plainly, as NumoPay does. Builds on "Pay one-offs straight from the viewer's own wallet" and "Several mints".
- **Stripe (cards)** beyond a Payment Link (checkout we verify, receipts at the door): v2.0. A Payment Link button for tickets moved into v1.0 on Sat 10 Oct.
- **Business meetings**: a plain mode for companies (their logo instead of photos, no stage lights, maybe no pay per 10 s). A product of its own: after the call.
- **Page addresses once several hosts share the site** (squatters): we give addresses out (by invite) rather than first come, first served; a reserved list (well-known artists and venues, our own words); unused ones released after a while; impersonation taken down. Register the product domain before announcing it.
- **A focus point for the background photo** (top, middle, bottom), so the artist's face never sits behind the player.
- **Several shows on one night** (Tue 6 Oct): v1.0 runs one show per server. Each show needs its own setup link, settings, takings and page (`/<artist>`), and its own holding state before the set starts. Builds on "One site, a page per artist" below.
- ~~**Languages back in**~~: dropped Sat 10 Oct. English only, GBP only (no EU audience: EU VAT on live events follows the viewer's country).
- **One site, a page per artist: `<site>/<artist>`.** Artists share the link or a QR code (socials, posters). Every fan's Pocket then lives on one site and works for every artist. Give the wallet its own hostname (e.g. `pass.<brand>/<artist>`), never a path on a site that hosts other apps: a browser shares storage across a whole site, so other pages there could read the Pocket's keys. Choose the permanent address before real money (moving later strands Pockets). Refueler or not: a business and FCA question, decide after the call. Short links: prefer our own short paths over tinyurl (a third party that sees every click).

## Ideas built on Coco + the 402 (talked through Sun 4 Oct; after v1.0)
- **Pay only if it's played:** a song request or shout-out is a pledge locked to the artist with a locktime; not played by then, it comes home by itself (the goal's lock, one fan at a time).
- **Splits:** takings divided automatically between band members, venue and sound crew as each payment lands (each share swapped to its owner's key).
- **Tickets as ecash:** a ticket is a locked token, checked at the door offline (DLEQ), passed to a friend by sending it on. No ticket platform, no name.
- **Agents and scripts pay too:** the same 402 works for a program as for a phone (clips, stems, a set's audio for an AI tool), no API key or account.
- **Fewer mint calls when paying every 10 s:** offline payment channels (Spilman, the open NUTs PR #296), settled once at the end.
- **Pay per anything:** a track download, a stem, a chapter, the encore. Every one is just a resource behind its own 402.
- **Pay the artist during the set:** when takings pass a threshold the artist sets (e.g. every 210 sats), send them on: as ecash locked to the artist's own key (no fees; works on any mint), or over Lightning to their address (NUT-05; a routing fee each time, hence the threshold; real mint only). Shortens how long we hold money. Show payments landing on the artist's page live.
- **Pay per play:** each song, or each play of a recorded track, is its own 402.
- **A professional setup page:** splits (band, venue, crew), the payout threshold and address, a live preview of the viewer page.
- **Other content:** lessons, chapters, video podcasts: each piece behind its own 402, for people and agents alike.
- **For businesses (Coco):** a wallet inside the business's own page (no app, no account), automatic payments of 402s, locked payments (deposits, "pay if delivered"). The open question is always the mint: who runs it, custody, the FCA.
