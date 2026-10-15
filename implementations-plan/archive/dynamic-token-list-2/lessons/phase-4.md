# The warning arc (W1–W3) and its review loop

## Plan review (2026-10-15, base `dfdf4c31` merged as `43775c01`)

- **Codex `gpt-6.1-sol` high, session 01a1417a: conditional approve.** Kept D8. Must-fix: a reconnect read the flags only from `refreshIfStale`, which can wait on the price provider; a restored row stored without `0x` missed its flag (reproduced in memory against the token codec and the address parser).
- **Opus 5.5 Plan: conditional approve.** Kept D8 and added the `TokenInfo` rejection (Home's rows keep the balance service's token map). Must-fix: the token page had no price client; the smoke Home row needs a balance row and a worker restart; a separate fixture export at an unused address; a `toSnapshot` assertion; picker and Holdings screenshots.
- Both legs' dispositions are in `plan.md` § Audit verdicts.

## Gates

- W1: token-flag, usePrices, price service and token-list suites green; `lint` 0; `typecheck:all` 0. Mutations, each restored after: dropping the `adopted` guard, and moving the list read out of the reconnect path, each red the reconnect test.
- W2: `bun run test` 0 (797 files), `test:components` 0, `lint` 0, `typecheck:all` 0.
- W3: armed `build:chrome` and `build:firefox` 0; `tests/e2e/token-list.test.ts --retry=0` 2/2 on each. The new scenario took 17.5 s on Chrome and 16.7 s on Firefox (estimated 35 s).
- A token test first asserted against `CHAIN_IDS.LOCAL`, which does not exist: the negative control passed on `undefined`. It now uses `CHAIN_IDS.SANDBOX`.
- The fixture row first lacked transfer functions, so the token page showed "Private and public transfers disabled" and Send hid its type card. Seeding them makes the shots read as for any sendable token. The token page's own refresh then reads 0 for a row with no balance functions, which only the shot shows.

## Review loop (diff `43775c01..HEAD`, plans excluded)

- **Codex round 1** (`gpt-6.1-sol` high, read-only, fresh session `01a1418e`): approve, moderate. Two non-blocking notes. Accepted: the smoke scenario used structural selectors (`+`, `:has`), which the e2e selector rule bans; it now reads each card's test ids through `$$eval`. Rejected: `tokens/[id].vue` should disconnect its price client before disposing `usePrices`. Every other `usePrices` owner disposes first (`TokenCard`, `TokensView`, `BalanceView`, `holdings`, `send`, `SelectTokenPopup`), and CLAUDE.md's example orders a fee composable whose dispose must follow its own service.
- **Deviation:** the round-1 prompt left out the standard's two verbatim rules and the adversarial ask. Round 2 carried all three and re-read the whole arc diff under them.
- **Opus 5.5 diff review**, beside round 1: conditional approve. Must-fix: the build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` for every new `src/utils` export, and CI's "build left generated sources unchanged" step reds until they are committed. Should-fix: the picker test's `SettingItem` stub drew a description for every row, so an empty second line on an unflagged row passed (now drawn only when the slot is passed, mutation-checked); `ARCHITECTURE.md` named neither the flags nor their channel; a banner doc comment named its callers. All applied in `ab0133f2`.
- **Codex round 2** (same session, resumed over `ab0133f2`): approve, moderate. Two comment trims, applied in `aeb1c882`. No new material finding: the loop converged.

## Final gates (after merging `origin/dev` at `110446a4`)

- `lint` 0; `typecheck:all`, `test:all`, `test:ci-gating` and `check:plans`: see `plan.md` § Outcome.
- `e2e:agent tests/e2e/network/default-token-seeding.test.ts --retry=0` 1/1 at `30ab9b36` (93 s): the price service now builds every answer with the flags, and seeding still runs.
- Rerun at `ab0133f2`: the scenario took 17.2 s on Chrome and 15.6 s on Firefox.
