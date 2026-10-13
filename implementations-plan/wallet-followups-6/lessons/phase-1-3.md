# Phases 1-3 (arc 1): implementation and review log

## Implementation

- Phase 1 (#332): red on base: the four non-string names in `method-name.test.ts` (base threw `TypeError` or passed `["sendTx"]`), and both new `background.refusal-log.test.ts` rows (base logged at `error`). Gate green.
- Phase 2 (#331): red on base: 27 rows (19 Buffer-shaped positions, three spellings at `registerToken[1]`, the bare preimage, three upper-case sender rows in `dapp-grant.characterization.test.ts`, the dispatcher's `*`-scope `grantPublicAuthwit`). Controls green on both. `wireInstance` gained `currentContractClassId`; its local was renamed from `preimage`, which it no longer is.
- Phase 3 (#345): red on base: seven refused cases. The compatibility pin passes on base and head (a success control). `stale-session.test.ts`'s helper had to change shape: the envelope type is now a discriminated union, so a `ping` default overridden to `secure-message` no longer type-checks; the helper casts once and takes the hostile extra keys as input.
- The artifact pin measured 5.3 s under a host load average near 200 (read 1.1 s, `loadContractArtifact` 0.2 s, `jsonStringify` 1.5 s, `encrypt` 2.6 s), past vitest's 5 s default; it carries a declared 60 s budget, as other fixed heavy scans in the app do.

## E2E runs

- First Chrome run found no test files: zsh does not word-split an unquoted `$FILES`, so vitest got one filter string. Fixed by `$(cat <list>)`.
- Second run refused at the proverless guard: `tx-sendTx-noFrom` is `@requires-proverless`. The arc's list runs with `NULO_E2E_PROVERLESS=1`, the mode most CI network shards use; the arc changes ingress, not proving, and the prover-ON canary is CI's.

## Codex fix loop (gpt-6.1-sol, high; session 01a13534)

- Round 1: `reject`. (1) High, demonstrated: an own `__proto__` key in a secure message's `content` passes `z.strictObject` (zod 4.4.3 skips that key in its unknown-key check), and the wrapper forwards the original message, so the padding reaches the decrypt queue; reproduced with real SDK encryption. Fixed: own keys checked on the raw value before the parse; a `JSON.parse` row, red on d820fa59. (2) Low: two comments inexact. Fixed.
- Opus 5.5 lens beside round 1: `approve with fixes`. The same `__proto__` finding (fixed). A `batch` registering several large artifacts in one message can exceed 16 MiB and is dropped unanswered: plausible, no dApp known to do it; not local (it would move D-345b), so a known limit, and the constant's doc says the bound is per message, a batch included. Nits applied: the IV comment, the test table's header. Declined: trimming the 19-position table (the plan names it) and the transport row (the plan names it; it proves the real wrapper drops the over-budget case).
- Round 2 (first send refused by Codex's cyber filter; re-sent with a defensive framing): `approve`. One optional low: the `method-name.test.ts` header's file-placement clause duplicates the freeze marker in `method-descriptors.test.ts`; removed. Converged.
