# cashu-ts NUT-16 fountain encoder (copied, unchanged)

`src/utils/fountain.ts` and `test/vectors/nut16.json` are copied byte for byte from cashu-ts pull request
[#1309](https://github.com/cashubtc/cashu-ts/pull/1309) ("feat(utils): add base45 fountain encoding for animated QR
codes (NUT-16)") at commit `41529c69dab792ad89d4b56a21766fc57fbbb4b7`, implementing the proposed NUT-16 fountain format
([cashubtc/nuts #456](https://github.com/cashubtc/nuts/pull/456)). cashu-ts is MIT OR Apache-2.0; `LICENSE-MIT` is its
MIT licence, unchanged.

The NutPub has no format code of its own. The three small files beside it (`src/model/Errors.ts`,
`src/model/PaymentRequest.ts`, `src/utils/core.ts`) are ours: they point fountain.ts's imports at the cashu-ts The NutPub
already runs (5.0.0-rc.4). `test/nut16.test.js` checks the copy against the spec's vectors.

When #1309 is merged and released, delete this folder and import `FountainEncoder` and `FountainDecoder` from
`@cashu/cashu-ts`. If the draft changes before then, copy the new commit's files again.
