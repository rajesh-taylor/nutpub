# Backlog (after 29 Oct, not before)

Nothing here gets built before the Cashu dev call. Something comes out before anything goes in.

- **RTMP stream keys and multistreaming**; a real live ingest (v1.0 plays a recorded set). Aaron and other streamers will multistream (several services at once), so the setup page needs the RTMP URL and key per destination, not just one.
- **Cloudflare Stream** (or similar) for the video.
- **A/V-team roles**: a venue's sound, lights, ticketing and bar as separate logins (v1.0: one account type).
- **Messages with tips** (like ShoSho). On desktop: comments and sat donations in a panel to the right of the player, not over the picture (like YouTube live chat). Mobile with a 16:9 video: comments in a box under the player, so the streamer reads them fast and only viewers see the money buttons (closer to what new users know). Plan it in a design session after the call.
- **An MCP / agent API**, and agent payments (own session).
- **The Pass umbrella and real fiat** (own session; Stripe test mode is a v1.0 "should").
- **The cloud-server move**: Docker Compose on a small server, so the demo runs without the laptop.
- **Real money at Bitfest** (Aaron: the music livestream and its artists, a few hundred people). Options:
  - Lightning only: tips straight to each artist's Lightning address. No mint, no custody.
  - Otherwise: a small Hetzner server, and a real Lightning backend (e.g. phoenixd) for our own mint vs a public mint.
  - Either way: who holds the sats, and the custody question that comes with it.
- **Lightning payout to the artist (NUT-05)**: the code path stays off; a test mint can't pay a real invoice.
- **A product domain.** Not under Refueler (closed-loop stamp mint, FCA position). Candidate: thenutpub.com (free on 4 Oct, $10.46/yr; nutpub.com and nutpub.net are taken). Streamers get `thenutpub.com/<name>`, no domain of their own. Switch addresses before practice or after the call, never during: a new address means new browser wallets.
- **Several mints, chosen by the account holder** (like Numo's mint list: a main mint, others accepted). NUT-18 lets a payment request list several mints (`m`). Accepting ecash from a mint you don't trust means moving it over Lightning (melt there, NUT-05; mint here, NUT-04), so it needs real Lightning: not on the test mint.
- **A free one-minute test broadcast** for new streamers, with the brand in the player (like the TEST strip).
- **Fiat tippers:** Stripe (test mode is a v1.0 "should"); real fiat is its own session.
