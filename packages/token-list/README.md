# @nulo/token-list

The `nulo-token-list/1` format: the signed list of default tokens the wallet fetches from
`https://tokens.nulo.sh/v1/list.json`, and the tools that sign it. The public description of the
format, for anyone verifying a list by hand, is [`infra/token-list/FORMAT.md`](../../infra/token-list/FORMAT.md).

The package is a dependency-free leaf (biome refuses `@nulo/*`, `@aztec-labs/*`, `@aztec-foundation/*`
and `zod` here): WebCrypto and `node:` builtins only, so the CI signer runs with `bun --no-install`
and no `node_modules`.

## Files

| File | Purpose |
|---|---|
| `src/envelope.ts` | Envelope encode, sign and verify (Ed25519, domain prefix `nulo-token-list/1\n`), canonical base64url, seed import. |
| `src/parse.ts` | Payload and source validation in `wallet` and `strict` modes, the `flagged` set included; `selectEntries` (bundled class, first 16 per chain, a price id only with its list's accepted feed). |
| `src/icon.ts` | An entry's picture: an SVG `data:` URL within the budget whose text passes the drawing allowlist (`isTokenIcon`, `iconBytes`). |
| `src/index.ts` | `readTokenList(text, keys, floor)`: verify, then parse, then refuse a sequence below the floor, then select. The wallet's one entry point. |
| `src/floor.json` | The compiled sequence floor, `SEQUENCE_FLOOR`: the last list that delisted or flagged a token. Raised by that list's publish PR. |
| `src/keys.ts` | The pinned public keys, `nulo-ci-1` and `nulo-recovery-1`. |
| `src/class-ids.ts` | Token classes the wallet bundles an artifact for, each with the public storage slots of its `symbol` and `decimals`. |
| `src/price-feeds.ts` | What a list's `priceFeeds` record may say (id spelling, USD band bounds, ticker), and Fee Juice's compiled `aztec` feed, the one feed no list carries. |
| `src/sign.ts`, `src/sign-cli.ts` | Signs `infra/token-list/list.source.json`; sequence = signing time in seconds, above the published one. |
| `src/keygen-cli.ts` | `install`: run once as a keyed run, sets the CI secret over stdin and prints the public keys. |

## Invariants

- **Verify before parse.** `readTokenList` decodes no payload byte until the signature over
  `nulo-token-list/1\n` + payload verifies against a pinned key. Every refusal throws a fixed category
  (`EnvelopeError.reason`, `PayloadError.path`) and never echoes list bytes.
- **Refuse, never normalize.** Upper-case hex, a field element at or above the BN254 modulus, an
  out-of-range number or a control, bidi or separator character in `name`/`symbol` refuses the list.
- **The signer signs only what a wallet accepts**: strict parsing, a key matching the pinned one,
  a sequence above the published envelope's, and a self-verification of the bytes it writes.
- **A flagged pair is never listed.** Both modes refuse a list that names a pair in `tokens` and in
  `flagged`, and the approver's digest (`listSha256`) covers both arrays and the feeds.
- **Pins live in the extension.** `apps/extension/src/wallet/services/token-list/token-list-pins.test.ts`
  ties `BUNDLED_TOKEN_CLASS_IDS` to `getBundledTokenClassId()`, `TOKEN_METADATA_SLOTS` to the bundled artifact's `storageLayout`
  and `BN254_FR_MODULUS` to `Fr.MODULUS`.
- **A feed prices only its own list's entries.** A record outside the bounds is refused by the signer
  and dropped by the wallet, never repaired, and the rest of the list still reads.
- **A picture is drawn only as an image.** Strict refuses a picture `isTokenIcon` does not accept and
  the wallet drops it, keeping the entry; the allowlist keeps it a static drawing, and the browser's
  image mode, not the allowlist, is what stops script and outside loads.
- **No private key in the tree.** Tests generate a key per run (`src/test-keys.ts`). The real seeds
  exist only in 1Password and, for the CI key, the `token-list` environment secret.

## Scripts

| Script | Does |
|---|---|
| `bun run test` | Envelope, parse, signer, keygen and import-closure tests (vitest on Bun). |
| `bun run typecheck` | `tsc --noEmit`. |
