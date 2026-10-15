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
| `src/parse.ts` | Payload and source validation in `wallet` and `strict` modes, the `flagged` set included; `selectEntries` (bundled class, first 16 per chain, known price id). |
| `src/index.ts` | `readTokenList(text, keys)`: verify, then parse, then select. The wallet's one entry point. |
| `src/keys.ts` | The pinned public keys, `nulo-ci-1` and `nulo-recovery-1`. |
| `src/class-ids.ts` | Token classes the wallet bundles an artifact for. |
| `src/price-ids.ts` | The single price table: CoinGecko id, USD sanity band, proxy ticker. |
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
  `flagged`, and the approver's digest (`listSha256`) covers both arrays.
- **Pins live in the extension.** `apps/extension/src/wallet/services/token-list/token-list-pins.test.ts`
  ties `BUNDLED_TOKEN_CLASS_IDS` to `getBundledTokenClassId()`, `BN254_FR_MODULUS` to `Fr.MODULUS`
  and `PRICE_IDS` to the price map.
- **No private key in the tree.** Tests generate a key per run (`src/test-keys.ts`). The real seeds
  exist only in 1Password and, for the CI key, the `token-list` environment secret.

## Scripts

| Script | Does |
|---|---|
| `bun run test` | Envelope, parse, signer, keygen and import-closure tests (vitest on Bun). |
| `bun run typecheck` | `tsc --noEmit`. |
