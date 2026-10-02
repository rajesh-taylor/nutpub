# Lessons for Refueler (from The NutPub build, btc++ Berlin, 1 Oct 2026)

## The 402 shape (NUT-24)
- NUT-24 itself (re-read 1 Oct): 402 + `X-Cashu: creqA…` (or `creqB…`); retry with `X-Cashu: cashuB…`; 400 for wrong mint, wrong unit, too little, or a missing lock (`nut10`). **No transport field** (payment is in-band). It also says **wallets MUST support both creqA and creqB**. It says nothing about DLEQ, retries or replay: those are the server's choice.
- cashu-ts rc.4: `new PaymentRequest(undefined, id, amount, 'sat', [mintUrl], description, true).toEncodedCreqA()`. `cdk-cli decode-request` reads it back cleanly (`i`, `a`, `u`, `s`, `m`, `d`; no `t`).
- Set `Access-Control-Expose-Headers: X-Cashu` on the 402, or a cross-origin page can't read the request.
- Put a JSON body on the 402 too (`amount`, `unit`, `mints`): curl users and humans read the body, wallets read the header.
- Refusal order that keeps the mint out of it as long as possible: token parses → mint in `m` → unit → amount ≥ `a` (all from `getTokenMetadata`, no keyset lookup) → full decode against the mint's keyset ids → local replay set → DLEQ → swap.
- Give each refusal its own `error` code (`wrong_mint`, `wrong_unit`, `too_little`, `unknown_keyset`, `reused`, `no_dleq`, `bad_dleq`, `mint_refused`, `mint_unreachable`). The page picks its words from the code; the spec only needs the 400.

## Tokens and keysets
- `getDecodedToken(token, keysetIds)` in rc.4 **needs the mint's full keyset id list** (v2 keyset ids are shortened inside cashuB). Read the metadata first with `getTokenMetadata(token)`, which doesn't need ids, so a token from a foreign mint gets `wrong_mint` instead of a decode error.
- Minibits' active keyset is v2 (`01…`), input fee 0 (checked 15:55 Thu 1 Oct; mint now `cdk-mintd/0.17.7`).

## DLEQ (NUT-12)
- `hasValidDleq(proof, keyset, { require: true })`: the default (`require: false`) returns **true when the DLEQ is missing** (spec "verify if present"). For a door you want `require: true`, plus a separate `no_dleq` refusal so the error is honest.
- `cdk-cli send` tokens carry DLEQ. `getEncodedToken(t, { removeDleq: true })` strips it (good for testing the `no_dleq` path).
- A relabelled token (foreign mint's signatures, our mint's URL and keyset id) fails DLEQ offline, before any mint call. That's the "hologram".

## Replay
- In-memory set of accepted secrets catches reuse fast; after a restart the mint's own "Token Already Spent" on swap catches it. Map both to `reused`.

## Tooling
- `cdk-mintd` 0.18.1 won't start in a fresh folder until `cdk-mintd -w <dir> config init --new-mint --file config.toml`.
- Cloudflare quick tunnels need port 7844 (UDP for QUIC, TCP for HTTP/2). Some networks (here, an iPhone hotspot) block both; the precheck in the log says so in the first second.

## Coco 2.0.0 in the browser
- NUT-24 payment in Coco is three calls, and it works in-band: `coco.paymentRequests.parse(creqA)` → `.prepare(req, { mintUrl })` → `.execute(prepared)` returns `{ type: 'inband', token }`; `coco.wallet.encodeToken(token)` gives the cashuB for `X-Cashu`. Coco's tokens **keep DLEQ**, so they pass a `require: true` gate.
- `initializeCoco({ repo: new IndexedDbRepositories({ name }), seedGetter })`; call `await repo.init()` first. `seedGetter` must return 64 bytes. `coco.mint.addMint(url, { trusted: true })` before receiving.
- Balances come back as Amount objects: `Number(x.toString())` before you print them. `balances.byMint()` keys are the mint URLs; compare without trailing slashes.
- Bundle size with esbuild `--minify`: ~750 kB for Coco + IndexedDB + cashu-ts. Fine over a tunnel; don't put it on the critical path for the stage screen.

## Gift tokens
- A 105-sat gift (4 proofs with DLEQ) is a ~1,250-character cashuB. As a URL in a QR that's a dense code: use error correction L and draw it big.
- Put the token after the `#` and `history.replaceState` it away on arrival: it never reaches the server's logs and doesn't sit in the address bar.

## Web Audio
- Create or resume the AudioContext at the very start of the tap handler, before any `await`, or iOS Safari stays silent. `navigator.audioSession.type = 'playback'` so the silent switch doesn't mute it.

## Networks at a venue
- Hackathon wifi can block port 7844 (Cloudflare tunnels) **and** stop devices seeing each other. Phones may get no internet at all.
- Android over USB: `adb reverse tcp:8787 tcp:8787`. The phone opens `http://localhost:8787`, which also counts as a secure origin.
- If phones can only reach your server, relay the mint through it (`/kitty/*` → mint). In the page, wrap `window.fetch` so calls to the mint URL go to `/kitty`. **Tokens keep the real mint URL**, so the gate's `m` check and the gifts still match. Coco used only HTTP here (info, keysets, keys, swap, checkstate); refuse the mint WebSocket and it polls instead.
- **QR codes must carry the public URL, never `location.origin`.** A page opened as `localhost` (USB, the laptop) draws QRs that point other phones at *their own* localhost. The server hands out the tunnel URL in `/api/config` and every QR uses it.
- Cloudflare tunnels: try `--protocol http2` when QUIC (UDP 7844) is blocked but TCP 7844 is open. A guest wifi with a captive portal can leave a phone "connected" with no internet; check with `adb shell ping`.
- **Quick tunnels don't last the night.** Ours died after ~8 h ("Unauthorized: Tunnel not found" in the log, retrying for ever while the process stays up). Check the log, not just `ps`, before a demo; restart it and let every QR follow the URL file.
- Cloudflare quick tunnels **hold SSE back** (nothing arrived in 5 s through the tunnel, instantly on localhost). Always run a 1-s poll alongside SSE.

## Real money (Minibits back, Fri 00:50)
- Checkpoint passed on Minibits: a real gift through the door, reuse refused, relabelled SuitCoin fails DLEQ against Minibits' real keys, the P2PK pint pours once.
- **The Minibits app and the Minibits mint fail separately.** Tonight the app's own account login broke ("AUTH_ERROR … Please re-authenticate", Login did nothing) while the mint answered. Anything that only needs the mint (our gate, Coco wallets) kept working. Any Lightning wallet can pay a mint's NUT-04 invoice.
- **Never let a page own a paid invoice.** Android pauses background tabs, so a page polling "is it paid yet?" can sit there with the sats paid and unclaimed. Save open quotes on the server and have it claim them.
- A P2PK pint (3 proofs, locktime + refund tags) is ~1,800 characters with DLEQ. The bar never needs the DLEQ (it swaps), so strip it for the QR.

## Locked pledges (P2PK + locktime + refund) with Coco 2.0.0
- Send: `coco.ops.send.prepare({ mintUrl, amount, target: { type: 'p2pk', options: { kind: 'P2PK', data: lockPubkey, locktime, refundKeys: [refundPub] } } })`, then `execute`. Works.
- **Coco won't take it back:** `coco.ops.send.reclaim(id)` → "Cannot rollback pending P2PK send operation", even after the locktime. `coco.wallet.receive(token)` → "Key pair not found for public key <lock key>": it only looks at the **main** lock key, never the refund path.
- What works: keep the refund secret key (`coco.keyring.generateKeyPair(true)` returns it), and after the locktime call cashu-ts `wallet.receive(token, { privkey: refundSk })`. Then hand the fresh proofs back to Coco as a plain token.

## Making a web page look like the brand (Fri 2 Oct)
- **System fonts are the cartoon.** DIN Condensed is a Mac font; Android and iOS fall back to a wide system face and the poster look is gone. Self-host one condensed face (Bebas Neue, SIL OFL, 61 KB) with its licence file next to it.
- **Grain without a file:** an SVG `feTurbulence` tile as a CSS data URI, blended with `mix-blend-mode: overlay`. Grey noise has to vary around mid-grey (scale the channel, e.g. `2·R − 0.5`): flat mid-grey under overlay changes nothing.
- **Put grain and vignette under the content, not over it.** Over the top they'd dim QR codes and blur small type.
- **`background-attachment: fixed` doesn't work on iOS Safari.** Use a `position: fixed` layer at `z-index: -1` for a full-bleed photo.
- **Translate from one table, by key.** Keep each status line as a key plus its numbers (`say('home', { n: 21 })`), not as finished text, so the 🇩🇪 flag can say the last thing again in German. Unknown keys pass through, so raw server errors still show.
- **Lightning top-up in a browser wallet with Coco 2.0.0:** `coco.quotes.mint.create({ mintUrl, amount, method: 'bolt11' })` → `coco.ops.mint.prepare({ quote, amount })` gives `{ id, request }`. Coco stores it in IndexedDB and its processor mints once paid, even after a reload; `coco.ops.mint.checkPayment(id)` settles it now. That's the "never let a page own a paid invoice" rule, solved by the library.
- **Watch for shadowed names when you add a translate function called `t`.** An old `enter(t)` parameter quietly turned `t('…')` into "t is not a function" inside that one function.

## Paying the artist over Lightning (NUT-05), Fri 2 Oct
- Lightning address → invoice: `GET https://<domain>/.well-known/lnurlp/<user>` gives `callback`, `minSendable`/`maxSendable` (msat); `GET callback?amount=<msat>` gives `pr`. Fetching an invoice pays nothing, so it's safe to test.
- The fee reserve comes off the top: quote, read `fee_reserve`, ask for less until `amount + fee_reserve` fits the takings. Then swap to exactly that (`wallet.ops.send(need, proofs)`) and melt only those, so the change is just the unused reserve.
- On the fake mint, a melt to one of its own invoices settles internally: a free end-to-end test of the melt path.
- **Kill a dev server by its listening socket, not by port:** `lsof -ti tcp:PORT` also lists clients (here the browser pane). Use `lsof -nP -iTCP:PORT -sTCP:LISTEN -t`.

## Basement58: retry is safe, reuse isn't (Fri 2 Oct)
- Bind the payment to the thing it bought. Our gate already remembers each pass's paid segments, so a retry for the same segment answers again without touching the token, and the same token for any other segment hits the replay set and gets `reused`. **Check "already paid for this" before "is it still live?"**, or a phone that comes back late gets a 409 for something it paid for.
- To demo a lost reply without trusting venue wifi or airplane mode: the server holds its reply 5 s, the phone aborts at 2 s (`AbortController`), then retries with the same token. A real network cut takes the same code path.
- Only retry where the server is idempotent. Our door issues a new pass per request, so a door retry would be refused as `reused`; that's exactly the gap the Base58 proposal describes.
- A status line at the bottom of a long page is invisible. Pin it just above the tab bar.

## Say only what the code does (Fri 2 Oct)
- The last-orders screen said an unpoured pint "goes back to the house". The lock allowed it (refund key = the house's), but nothing ever took it back. Now the server sweeps unpoured pints after last orders with the house's refund key, retrying until the mint's clock agrees. Read every on-screen promise against the code before a demo.
- **Check the clocks.** The Mac and the Pixel were on UK time in Berlin. The event page's countdown was the only thing in Berlin time.

## Browser wallets belong to a web address (Fri 2 Oct)
- **A browser wallet lives on the address it was opened at.** `localhost:8787` and the tunnel address are two different wallets on the same phone, and every quick-tunnel restart is a new address. When last night's tunnel died, the sats in the phones' wallets on that address became unreachable (still unspent at the mint, but the page that holds their keys can't load).
- So: **sweep test wallets before restarting a tunnel** ("Take it home" in Pocket → paste into the Minibits app or the float page), and for anything that has to survive, use a stable address (a named tunnel on your own domain).
- **Store every bearer token you hand out until it's settled.** Thursday's unpoured pints were only in the server's memory; a restart lost them, and with them the house's right to take them back.
- **A fixed address with a Cloudflare named tunnel** (your own domain on Cloudflare): `cloudflared tunnel login` (once, in the browser) → `cloudflared tunnel create nutpub` → `cloudflared tunnel route dns nutpub nutpub.example.com` → `cloudflared tunnel run --url http://localhost:8787 nutpub`. Ten minutes, and wallets, bookmarks and QR codes stop breaking on restart.
- **Your CDN may overrule your cache headers.** Our Cloudflare zone's Browser Cache TTL turned `Cache-Control: no-cache` into `max-age=14400` for CSS and JS, so phones kept old code for 4 hours. Version asset URLs (`/app.js?v=<build>`) from the server and stop worrying.

## Rehearsal maths (Fri 2 Oct)
- **Count the room, not the passes.** The goal was 21 × passes and the stage drew a lamp per pass, so the presenter's own tab (needed for the Basement58 demo) quietly raised the goal past what the three judges could pledge. Mark crew passes (the door request carries the admin key) and count guests only.
- **Say where a browser wallet lives, precisely.** Closing the tab loses nothing; clearing site data, a private window, another browser or device, or Safari's 7-day storage limit does. Say it on the page and in the pitch, and give a way out (Take it home).

## Desk judging (Fri 2 Oct, afternoon)
- **A box whose children are all absolutely positioned has no width of its own.** In a flex column with `margin: auto`, our 16:9 player shrank to 0 px: the sound played, the picture was there, nobody could see it. Give such boxes `width: 100%`.
- **iPhone Safari may refuse to start even a muted video** (Low Power Mode). Let any tap on the player start it, and say so on screen.
- **Gate the picture with the sound.** The video for a 10-second segment is served only to a pass that paid for that segment: no second 402, no free stream.
- **Keep passes somewhere a restart can't wipe, or don't restart mid-group.** Ours live in memory, so every restart sent the phones back to the door.
- **Third-party mints go down at the worst time.** Minibits timed out 30 min before judging; the local fake mint (relayed through our server) kept the demo alive. Have the fallback one command away.
