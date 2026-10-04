# Lessons

The hackathon's lessons (NUT-24 gate, DLEQ, Coco in the browser, locked pledges, venue networks) are in the
[btc++ repo](https://github.com/rajesh-taylor/nutpub-btcppberlin26). New ones for v1.0 go here.

## Setup (Sun 4 Oct)
- **cdk-mintd 0.18.1 keeps its config in its database.** First start: `cdk-mintd -w <dir> config init --new-mint --file config.toml`. After that, change it with `config apply --file …` (staged; used on the next start). `scripts/start.js` does both.
- **Cloudflare's free certificate covers one level of subdomain.** `mint.nutpub.example.com` fails on HTTPS; `nutpub-mint.example.com` works.
- **One tunnel, two hostnames** needs a config file with `ingress` rules (the `--url` flag only takes one). Point the services at `127.0.0.1`, not `localhost` (which may resolve to `::1`).
- **Never run two connectors for one tunnel**: Cloudflare shares the traffic between them, so half the requests go to the wrong server. `npm start` refuses to start if one is already running.
- **macOS folders ignore case**: `~/Documents/nutpub` is the same folder as `~/Documents/NutPub`.
- **Cut the set from the original, not from hand-made clips.** Exported clips came out 9.7 to 9.98 s; a 10-second timeline needs exactly 10 s per piece or the joins click. `cut-set.sh` pads the last piece (silence, last frame held).
- **Keep media out of the repo's top folder.** Anything there goes in with `git add -A`; `media/` is git-ignored.
- **Coco needs a few seconds on first load** (IndexedDB, the mint's keysets); the Lightning top-up on the test mint lands in about 4 to 5 s without a reload. Show the buttons only once the wallet is open.
- **Name the address the page was opened at**, not the public one: `localhost:8787` and the tunnel address are two different wallets.
- **Coco 2.0.0 pins cashu-ts 5.0.0-rc.4**, so the server stays on rc.4 too: one copy, the version the gate was proven on.
