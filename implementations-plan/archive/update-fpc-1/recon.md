# update-fpc-1: recon

Read at `origin/dev` `040334f53`. One Explore sweep (sonnet) over six capabilities, then the parent's own reads and one diagnostic live run ([lessons/phase-0.md](lessons/phase-0.md)).

## The lost row

The live update scenario from v1.1.0 on Chrome, candidate `1.1.0.1` built at `040334f53`, with an uncommitted log of the release's own reads of its fee payer rows and networks (`readRelease` in `endOnSecondAccount`), reds with exactly `nulo:core:fpcs@c2769f0f: lost in the update`. The release read that row as:

| id | chainId | network (kind) | type | address | name |
|---|---|---|---|---|---|
| `c2769f0f` | 1685367866 | Sandbox (custom) | 1 (`DefaultSponsoredFpc`) | `0x2d8fff82…ad169d3`, the canonical sponsor | Sponsored |
| `167a9995` | 1685367866 | Sandbox (custom) | 2 (`PrivateFpc`) | the canonical PrivateFPC | Private Fee Juice |

The release holds no fee payer row on Alpha Mainnet (chain 2070860441), Testnet or the Local Network. The run's sandbox is added as a custom network, so its chain id is `walletChainId(31337, rollupVersion)`, not 0, and `offersSponsoredFpc` is false there. The removal is `FpcService.withoutUnofferedSponsor` on the first `getFpcs(chainId)` after the update on that chain (here the sandbox visit in `verify`), followed by `saveFeePick({ kind: "forgetFpc" })`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Canonical sponsor address in e2e code | `tests/e2e/helpers/fpc-seeds.ts:9-12` `PROTOCOL_FPCS` (private const, mirrors the pin in `src/wallet/services/fpc/protocol-fpcs.test.ts`). `protocol-fpcs.ts` cannot load under the e2e vitest configs (no `@private-fpc-artifact` alias there); `fixtures/aztec.ts` derives it through the Aztec SDK | reuse: export the constant from `fpc-seeds.ts`, no second copy |
| Which chains offer the sponsor | `src/wallet/services/fpc/sponsored-fpc-chains.ts` `offersSponsoredFpc`, already imported by `fpc-seeds.ts` | reuse as-is |
| "Is the canonical sponsor" predicate | `service.ts:58` `isCanonicalSponsor` (private; type plus `sameFieldAddress`). Importing `service.ts` or `@nulo/wallet-bridge`'s barrel into e2e pulls the service graph | adapt: type plus a lower-case compare against the canonical lower-case address, equivalent for a well-formed address and never matching a malformed one |
| The release's fee payer rows with chain, type, address | sealed: `readRelease` → `rows.fpcs` (`fixtures/update/read-release.ts:74`), computed in `endOnSecondAccount` and dropped; plaintext: JSON in `before`, parsed by `rowsOf` local to `tests/e2e/update-replay.test.ts:113` | adapt: return `fpcs` from `endOnSecondAccount`; move `rowsOf` to `fixtures/update/stored-rows.ts` as `storedRows`, the replay importing it |
| Excusing an expected change in the checker | `updateProblems` (`fixtures/update/verify.ts`): `drained` behind `balancesAsserted`, `moved`, `rekeyed`, fixture keys. No expected-deletion option | build new: one option shaped like `balancesAsserted`, off by default, so the replay and arrival callers are unchanged |
| Forgetting a fee payer's picks | `src/utils/fee-picks.ts` `applyFeePickUpdate({ kind: "forgetFpc" })`, `readAppPicks`, `readSendPicks`: the product's own code | reuse as-is |
| Unit tests of the update checker | `apps/extension/scripts/e2e/update-rows.test.ts` (`updateProblems` over the signed goldens), run by `vitest.config.ts` (`scripts/**/*.test.ts`), so by `bun run test` | extend |

## Search trail for absences

- No expected-deletion hook: read every opt of `updateProblems`; grep `updateProblems(` across `apps/extension/tests` and `apps/extension/scripts` (live `:356`, `:394` with `balancesAsserted`; replay three calls, arrival one, none with opts).
- No e2e import of `protocol-fpcs` or `@private-fpc-artifact`: grep across `src`, `tests`, `scripts`; read `vite.shared.ts:63-66` and the three e2e vitest configs.
- No duplicate issue: `gh issue list --state all --search "update test sponsored fee payer"`; no closed limit: `--label known-limit --search "update fpc sponsor"`.

## Callers of `getFpcs(chainId)` (when the removal can run)

`src/stores/balances.store.ts:557` (`runFpcFetch`, the active scope's chain, on every balance refresh), `src/wallet/services/execution/service.ts:365` through `gas-balance-reader.ts:183`, and the fee payer settings and popups. All need an unlocked session. So the removal never runs before the first unlock, and runs on the first fee read on the sandbox chain: for v1.0.0 and v1.1.0 (sealed, ending on Testnet) after `expectReleasePreferences`, for a plaintext release (selection on the sandbox) possibly before it.

## Collisions

- `tests/e2e/update-replay.test.ts` calls `updateProblems` with no opts and checks fee payer ids in `expectIdentity` through `getFpcs()` with no chain, which never removes. Both replays pass from v1.1.0 (lane brief), so the replay reaches no fee read on the sandbox chain.
- v0.31.0's plaintext Sponsored row names `0x2adfb70e…`, an older Aztec line's sponsor, which the candidate treats as hand-added and keeps.
