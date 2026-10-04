# Backlog (after 29 Oct, not before)

Nothing here gets built before the Cashu dev call. Something comes out before anything goes in.

- **RTMP stream keys and multistreaming**; a real live ingest (v1.0 plays a recorded set). Aaron and other streamers will multistream (several services at once), so the setup page needs the RTMP URL and key per destination, not just one.
- **Cloudflare Stream** (or similar) for the video.
- **A/V-team roles**: a venue's sound, lights, ticketing and bar as separate logins (v1.0: one account type).
- **Messages with tips** (like ShoSho). On desktop: comments and sat donations in a panel to the right of the player, not over the picture (like YouTube live chat). Mobile: to be designed (below the player? a drawer?). Plan it in a design session after the call.
- **An MCP / agent API**, and agent payments (own session).
- **The Pass umbrella and real fiat** (own session; Stripe test mode is a v1.0 "should").
- **The cloud-server move**: Docker Compose on a small server, so the demo runs without the laptop.
- **Real money at Bitfest** (Aaron: the music livestream and its artists, a few hundred people). Options:
  - Lightning only: tips straight to each artist's Lightning address. No mint, no custody.
  - Otherwise: a small Hetzner server, and a real Lightning backend (e.g. phoenixd) for our own mint vs a public mint.
  - Either way: who holds the sats, and the custody question that comes with it.
- **Lightning payout to the artist (NUT-05)**: the code path stays off; a test mint can't pay a real invoice.
- **A product domain.** Not under Refueler (closed-loop stamp mint, FCA position). Candidate: thenutpub.com (free on 4 Oct, $10.46/yr; nutpub.com and nutpub.net are taken). Streamers get `thenutpub.com/<name>`, no domain of their own. Switch addresses before practice or after the call, never during: a new address means new browser wallets.
