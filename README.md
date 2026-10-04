# The NutPub

**A show paid for in Cashu ecash, 10 seconds at a time.** The artist or venue sets up a show; viewers pay per 10 seconds of the set (or watch free and tip), chip in to an all-or-nothing goal that refunds itself, and take their change home. Every payment is Cashu's HTTP 402 (NUT-24).

v1.0 is being built for the Cashu dev call on Thu 29 Oct 2026. The hackathon version (btc++ Berlin, 1 to 2 Oct 2026) is at [rajesh-taylor/nutpub-btcppberlin26](https://github.com/rajesh-taylor/nutpub-btcppberlin26).

> **Test only.** The demo runs on the NutPub Test Mint: cdk-mintd with a fake Lightning wallet. Its sats have no value, and it can't pay a real invoice.

## Run it

Needs Node 24 or newer (for `node:sqlite`) and [cdk-mintd](https://github.com/cashubtc/cdk) 0.18.1 on the `PATH`. `cloudflared` only if you want a public address.

```bash
npm install
cp .env.example .env   # optional: tunnel hostnames
npm start              # the test mint, the server and the tunnel; Ctrl-C stops them all
```

Open http://localhost:8787. All state lives in `data/` (SQLite for the server, `data/mint/` for the mint), so a restart loses nothing. Logs: `data/logs/`.

With a Cloudflare named tunnel, set `TUNNEL`, `SITE_HOST` and `MINT_HOST` in `.env` and route both hostnames to it once (`cloudflared tunnel route dns <tunnel> <host>`). The mint needs its own public hostname: its URL is written into every token, so phones must be able to reach it.

## Licence

Apache-2.0. The font is Bebas Neue under the SIL Open Font License (`public/fonts/OFL.txt`).
