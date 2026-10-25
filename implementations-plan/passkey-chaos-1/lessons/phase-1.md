# Phase 1: arc C1

Every consult, gate and meaningful attempt of arc C1. Paths repo-relative.

## C1.1 design consult (2026-10-25, Codex gpt-6.1-sol, high, read-only)

Asked, before any driver: challenge the pure layer (`apps/extension/tests/e2e/helpers/profile-chaos/model.ts`, `checkers.ts`, `apps/extension/scripts/e2e/profile-chaos-model.test.ts`) for false greens, and five deviations. Verdict: "fix the gaps below before building drivers; several false greens are reproducible in memory." Each finding was reproduced or read in the tree before its disposition; all twelve accepted:

1. A planned restart's unobserved log window stays incomplete (D5 holds, D24). My proposal to count it green after a drain right before the stop was withdrawn: the store persists on a debounce (`apps/extension/src/wallet/logger/store.ts:115-127`) and a timer can log between the drain and the stop.
2. O4 copied raw error text into a violation: the message now names the error's class and the text rides in `detail`, kept only in the local record after masking.
3. `ownerOf` needed the owner to be known, so an unknown owner of a plain root row read as ownerless and passed. Now a sealed row's owner is its envelope's, a plain root row's is its id up to the first separator, a value key has none; a sealed family's row without an envelope is its own violation.
4. O6 passed a profile that imported a file with no sentinel read back, and compared siblings at index 0 only. Now the sentinels must be exactly the model's, and every overlapping index is compared.
5. A held restore's successor did not follow its stage: now per stage and competing step, with a fixed cleanup lock (D22).
6. Delete is reachable twice more: the restored profile once `account-state` holds (`apps/extension/src/composables/useFullBackupImport.ts:483`), and from the lock screen through Forgot password (`apps/extension/src/popup/pages/settings/security/reset.vue:5`) (D22, D23).
7. Background ownership by the step's two endpoints missed `verifyAll`'s intermediate profiles and a restore target's network seeding (`apps/extension/src/wallet/services/network/service.ts:366-380`): a background write may also land for a profile the contract names. Boot integrity verification covers only the active profile (`apps/extension/src/wallet/services/account-integrity/coordinator.ts:112-114`), so no wider rule is needed.
8. Replay lists accepted a reused profile ref (two `P1`s) and an account index of -1: refs a step introduces must be new, indices non-negative integers below the derived count, and a duplicate answer given exactly when the wallet warns.
9. O1 passed an open session with the anchor on the lock screen, and a locked reading that never tried a protected call: both are violations now.
10. O5 passed a settle past its bound when the state was reached: the elapsed time is checked too.
11. The disconnect allowance covered whole families, strict toggles and double unlocks included: scoped by `endsOf` (D24).
12. Several citations pointed at comments or the wrong file: every `code:` source now names the implementing line, and a unit test fails on a cited file or line that no longer exists.

It found the driver split sound (D21).

## C1.1 gate (2026-10-25)

- `profile-chaos-model.test.ts`: 124 tests, 30 consecutive runs at retry 0 on the committed state, 30/30 green (11 s to 35 s per run on a shared host); the three files' SHA-256 matched before and after the 30 runs.
- Fast layers: `bun run lint`, `bun run typecheck:all` and `bun run test:all` green; the first `test:all` caught `browser-seam.test.ts` refusing the model's capability fields under the driver flags' names, so `Caps` names capabilities and the spec maps the facts (D21); the extension suite then passed again, 15,304 tests.
- Every break fixture prints its violation as `[break] <oracle> <label>: …` in the verbose reporter's output; each one fails for its own reason only (two O6 fixtures that also tripped the sentinel or recorded-address check were isolated).
