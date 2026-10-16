---
plan: harden-quality-fixes-1
tier: light (the lane brief's call; one Codex audit, the Opus lens, a fresh Codex final pass)
status: approved 2026-10-16 (A1 refused, A2 accepted); arc 1 in progress
issues: "#536 step 1 and #549 (Refs; A1 refused), #557, #558, #559 (Closes); one arc"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; Codex resumes to verify
base: origin/dev at c5e9c8e8
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-quality-fixes-1: the cheap dedupe set of the 2026-10-15 quality harden

One arc, one PR against `dev`, no stack. It removes copies and dead paths the quality harden found and the owner promoted on decision page 21 (P21-05 A, P21-07 B, P21-09 A). No behaviour and no pixel changes. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #536 step 1 (the `deferred` copies); #549 (F-17); #557 (F-18); #558 (F-19, all four paths, the counter included); #559 (F-22).
**Out:** #536's other steps (the F-01 + F-06 lane); the three `deferred` files running lanes hold (recon.md); the Display toggle OA-1 names; #528 (a closed known limit); #538, #541, #542, #543, F-09, F-16, F-21.

## Outcome & Quality Bar

- **For whom:** the next contributor who adds an operation kind, a journal field, a contact rule or a test that waits on a promise.
- **Excellent:** a new operation kind fails `typecheck:all` until every switch handles it, and tests pin `validateSession`'s special arms. A journal field missing from the shape, the forwarding or the interface fails to compile. One helper settles every test promise. The diff changes no rendered DOM, no message and no stored byte.
- **Good enough:** the issues' own paths close. The other near-copies recon found stay, named in recon.md.

## Assumptions

**Facts** (recon.md has the citations):
1. All 25 listed copies exist; 22 are outside running lanes. 11 more have the same body under `_deferred`, `held` or `gate`.
2. Each of the 18 request types carries exactly one of `chain` or `account` (`dapp-interaction-protocol.ts:35-96`). An arm that reads the wrong one fails to compile.
3. `validateSession` has no `default`, so an unlisted kind gets no permission check; today all 18 kinds are listed. `materializeRequest`, the window and `dispatchOperation` throw at run time but compile with a kind missing. No test asserts `validateSession`'s refusals.
4. Every production constructor passes `browserApi` (`wallet/runtime.ts:497,518,519,532,569`); one test omits it on purpose (`profile/service.integration.test.ts:1819-1829`).
5. Header's task pipeline renders nothing; `highlightColor` stays live through its error and warning branches (`Header.vue:110`). `Header.test.ts` asserts none of the failure-badge behaviour.
6. Outside the Display toggle that writes it, `showNode`'s one reader was Header's write-only ref; the toggle already changes nothing.
7. Journal and network rows are not MAC'd or compared byte by byte; no migration or backup slice imports their schemas.
8. A new export in `src/utils/` becomes an auto-import global; CI's build fails on stale `src/types/` files.
9. `exactOptionalPropertyTypes` is off. `{ [K in keyof T]-?: T[K] | undefined }` drops the `undefined`; `{ [K in keyof Required<T>]: T[K] | undefined }` keeps it (reproduced on TypeScript 6.0.3).

**Inferences:**
- I1. Spreading one plain shape into two `z.object`s, both annotated `z.ZodType<T>`, keeps parse behaviour (zod 4.4.3; the house pattern, `incoming-transfer/spec.ts:126-155`). The codec and journal tests prove it.
- I2. Faking only `Date` runs the same eviction path the re-stamp reached; the lock's real timers and WebCrypto are untouched.

**Asks** (the orchestrator answers before phase 2; working assumption in brackets):
- A1. `popup/windows/execute/index.vue` is in execute-popup-readability's hold. **Refused** (orchestrator, 2026-10-16): the window hunk and the fee-seed helper are dropped; the PR says `Refs #549` and names the window's switch as the remaining hunk, routed after #508's PR merges.
- A2. The lane brief says "one exhaustive table" for #549. **Accepted**: exhaustive switches (D3).
- OA-1 (owner): the dead "Show network name" toggle. Ships unchanged.

## Architecture & Implementation

- **#536.** Each copy becomes an import of `deferred` (and `Deferred` where typed) from `@nulo/wallet-core/utils`; inside `packages/wallet-core` from `./deferred` (`src/utils`) or `../utils/deferred` (`src/base`). Renamed copies take the name `deferred`. A call that relied on an untyped copy's `unknown` gets a type argument (`useReceiptFee.test.ts` → `deferred<Fee>()`). `tests/helpers/held-read.ts` imports the helper for `holdReads` and re-exports it as `held`/`Held` for `send.test.ts` (D2). `useContactImportExport.test.ts` imports `deferred` directly.
- **#549.** Add `const unhandled: never = <op>` before the existing throw in `materializeRequest`, the window and `dispatchOperation`, and as a new throwing `default` in `validateSession` with a fixed message (D3, D4). Merge `materialize.ts`'s two send arms. Add one helper beside `isEmbeddedFeePayment` in `packages/wallet-bridge/src/operation-validation.ts`. It returns the embedded seed or `undefined`, and both fee-seed sites call it; `index.ts` already exports the module. Every await stays first in its arm.
- **#557.** Journal: `interface JournalMetadata` holds the nine fields and their doc comments. `OperationRecord` extends it, and `NewOperationInput` intersects it. `journalMetadataShape` is `satisfies Record<keyof JournalMetadata, z.ZodType>`, and both zod objects spread it. `service.ts` builds the nine as a value of type `{ [K in keyof Required<JournalMetadata>]: JournalMetadata[K] | undefined }`. A missed key fails to compile, and every key is still written (D5). Network: `CHAIN_KINDS` as `const`, with `ChainKind` and `ChainKindSchema` from it, above the row schema. One `networkShape` (`satisfies Record<keyof Network, z.ZodType>`); `NetworkSchema` overrides `endpoints` with `.min(1)` (D6). Every export keeps its `z.ZodType<…>` annotation.
- **#558.**
  - Header: delete the map in recon.md and the test's task-client mock. Deleting the mount's two awaited reads lets the failure badge subscribe earlier. `getTasks` also prunes stale tasks, and every view that shows tasks calls it first (`RecentActivityView.vue:705`, `TokensView.vue:266`). Nothing visible changes.
  - Dispatcher: delete the authwit case and its doc line.
  - Fallbacks: make `browserApi` required on `PriceService`, `ContactService`, `OperationJournalService`, `ProfileService`, `ProfileRepository`, `SessionManager` and `AccountIntegrityCoordinator`. Delete their `chrome.*` branches, `ChromeAlarmsFallback` and the no-port test. In `SessionManager`, make `alarms` and `dispatcher` required, drop the `?.` and the two `!this.dispatcher` guards (synchronous, before any await), and trim the "no port" docs and `runtime.ts:527-531` (D7).
  - Session writer: narrow `IDappSessionWriter` to its two members and trim the eleven stubs. `dispatcher.test.ts` types its writer as the interface plus `getDappSession` (D9). Delete `upgradeDappSession` and its test. The expiry test reaches the past through a fake `Date` (D8).
- **#559.** `utils/contact-rules.ts` gains `contactNameError`, `contactAddressError` and `canSubmitContact`. The validators take the value, the contacts as a `{ readonly value }` handle and an optional exclusion predicate. `canSubmitContact` takes `{ readonly value }` handles for loading, name, address and the two errors. Each one reads in today's order with today's early returns and messages, so no reactive read moves (D11). The callback names stay `c` and `v` (`contact-rules.ts:5`). Edit passes `isEditedContact`; its dirty gate and import branch stay in the popup.

## Security & Adversarial Considerations

- `validateSession` enforces a connected dApp's per-session method, account and event-scope permissions. Today an unlisted kind skips every check (fail open). The traced path: the dispatcher builds every operation itself (`packages/wallet-bridge/src/dispatcher.ts:503-664`, `buildOperation` at `:976-998`), so no dApp input reaches the missing default. The new `never` default makes a new kind a compile error and refuses an unknown one at run time. Exhaustiveness does not stop a kind moving out of the private-event or nested-action arm; phase 2's tests pin those refusals.
- No permission, message, stored shape or log line changes. The removed fallbacks are raw `chrome.storage` paths no runtime takes. Contact admission keeps every rule; #528's window is unchanged.
- No dependency changes; `bun.lock` untouched.

## Arc 1: every issue in one PR

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. Each phase also runs the touched package's suite (`bun run --cwd packages/<pkg> test`). Commit per phase.

### Phase 1: #536 step 1, the `deferred` copies
- Change: the 22 listed files, the 9 files with renamed copies (recon.md), `tests/helpers/held-read.ts`.
- Tests: none added; the suites are the gate.
- Gate: `F` and `bun run --cwd packages/wallet-core test`. The grep in recon.md § F-01 prints exactly the nine lines it lists.

### Phase 2: #549, exhaustive operation-kind switches
- Change: `materialize.ts`, `dapp-interaction/service.ts`, `execution/service.ts`, `popup/windows/execute/index.vue` (A1), `packages/wallet-bridge/src/operation-validation.ts`.
- Tests:
  - `operation-validation.parity.test.ts`: embedded gives the seed; a requested self-pay, a draft send and a non-send kind give `undefined`.
  - The `dapp-interaction/service` suite, one test per refused class: an unknown kind (the default's own message, and no step after validation runs); a private-events call outside the granted scopes; a `send_transaction` whose nested action the session does not grant. A permitted call is the success control.
  - `materialize.test.ts` and `execute/index.test.ts` stay green unchanged.
- Proof, not committed: delete one kind from one arm of each switch; `typecheck:all` fails at all four sites; restore.
- Gate: `F` and `bun run --cwd packages/wallet-bridge test`. The unknown-kind test fails on `c5e9c8e8`.

### Phase 3: #557, composed schemas
- Change: `operation-journal/spec.ts`, `operation-journal/service.ts`, `network/spec.ts`.
- Tests: `operation-journal/service.test.ts`: all nine fields survive create and read back, and `profileEpoch` is never stored. `network/spec.test.ts`: the row schema takes `endpoints: []` and `NetworkSchema` refuses it; both take each of the five kinds and refuse `"staging"`.
- Gate: `F`; `storage-codecs.test.ts` unchanged and green.

### Phase 4: #558, the four dead paths
- Change: `components/Header.vue` and its test; `packages/wallet-bridge/src/{dispatcher,services-contract}.ts` and the three suites stubbing the writer; the seven constructors, `price/service.ts`'s fallback class and `runtime.ts` (comment); `profile/service.integration.test.ts`; `dapp-session/service.ts` and its composition test.
- Tests: `Header.test.ts` gains one event-driven test: an error log sets `cacheStore.failureLog` red, a warning sets it yellow, and the timer clears the state. The expiry test fakes `Date` only, restores it before `tryGetDappSession`, and still asserts "Session expired" and the eviction.
- UI check, not committed: render `Header` at the base and on the branch with one set of props; the HTML matches. A difference stops this part (OWNER-ASKS).
- Gate: `F` and `bun run --cwd packages/wallet-bridge test`.

### Phase 5: #559, the contact admission rules
- Change: `utils/contact-rules.ts`, `NewContactPopup.vue`, `EditContactPopup.vue`; `src/types/` regenerated by `bun run --cwd apps/extension build`.
- Tests: `contact-rules.test.ts`, one case per refused class: a duplicate name by case and spacing, an invalid address, a duplicate address by hex case, a loading or empty form for submit. Also the excluded row accepted, and a clean form as the success control. Both popup suites stay green unchanged.
- Gate: `F`; `git diff --stat -- apps/extension/src/types` shows only `auto-imports.d.ts` and `.eslintrc-auto-import.json`, each gaining the three globals. If #534 lands first, merge `dev` and rebuild; never hand-merge them.

### Phase 6: arc gate
- Run `bun run test:all`, `bun run check:plans` and `bun run --cwd apps/extension build`. Then `git diff --exit-code -- apps/extension/src/types`.
- Wait for `load1 < 150`. Build the armed smoke bundle: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
- Run the smoke suite on Chrome: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension test:e2e -- --retry=0`.
- Run three network specs, one at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<f>.test.ts`, for `execute-scope-account`, `batch-mixed` and `data-privateEvents`.
- Pass: all green at retry 0. A red gets one rerun. Red again: run it on `c5e9c8e8`.
  - Green on base: the diff broke it; fix the cause.
  - Red on base too: decide in `lessons/phase-6.md` whether it is a flake or a defect, and file it (`flake` label only for a flake). The gate stays unmet: fix the cause, or report it as the blocker.
- No e2e scenario is added; CI runs all four e2e lanes, Firefox included.

## Delivery

Branch `worktree-harden-quality-fixes-1`; `gh pr create --base dev` after phase 6 and the Codex loop, without labels. Title (85): `refactor: share deferred, exhaustive kind switches, composed schemas, drop dead paths`. Body: the change and why per issue, each with `UI impact: none`; the A1 and A2 answers; the validation runs with outcomes; "no e2e scenario added"; `Refs #536`, `Closes #549`, `Closes #557`, `Closes #558`, `Closes #559`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision c5e9c8e8:
- Step 1 is absent (`code_review: off`).
- Step 2: one loop over the whole diff from `c5e9c8e8`, after phase 6. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Every prompt carries the standard's two rules verbatim and this plan's rule, verbatim: "An extraction that adds an await, moves a read, or adds a continuation is a defect." Log rounds in `lessons/phase-6.md`. Hard stop at three rounds.
- Step 3: the Delivery above.
- Step 4: the close-out is this PR's final commits. On #536, comment that step 1 shipped and name the left-out files.
- Step 5: after the merge, `agent-worktree done harden-quality-fixes-1 --merged`.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Which copies | the 22 listed outside running lanes, plus the 11 renamed copies | only the 25 (the next test copies a neighbour); other shapes (they park mocks, or return `read`, `open`, `release`) |
| D2 | `held-read.ts` | import the helper; re-export it as `held`/`Held` | migrate `send.test.ts` (send-fees-ux edits it); keep the copy |
| D3 | #549's shape | `never` defaults; one fee-seed helper; merged send arms; tests on the special arms | a `Record<kind, scope>` table: the types already carry the split, a table needs guards to narrow, and neither protects the special arms |
| D4 | `dispatchOperation` | the same `never` line | leave it: the issue names it, and it stays under the 80-line budget |
| D5 | Journal forwarding | `keyof Required<…>` mapping, key by key; the shape `satisfies` the interface's keys | `-?` mapping (drops `undefined`, Fact 9); a rest spread (stores a future input-only field); a key loop (needs a cast) |
| D6 | Chain kinds | one `as const` tuple | three lists and a comment (`ZodType<ChainKind>` misses a dropped member) |
| D7 | Fallback reach | every `browserApi?` in the chain, `SessionManager`'s optional fields included | stop at the issue's five (the fallback lives one hop down) |
| D8 | Expiry fixture | a fake `Date` past the 7-day expiry, restored before the eviction read | a hand-written row (rows are MAC'd); keep `upgradeDappSession` for a test |
| D9 | Writer reads in tests | a local type: the interface plus `getDappSession` | keep the five members for tests |
| D10 | "Show network name" | OA-1; unchanged | delete or wire it here (a UI change) |
| D12 | `dispatcher.ts` digest pinned by `identifier-sites.expected.json` (type-roles-coverage's hold) | re-attest (the edit removes an account-operation case; no `send_transaction` producer moves) and re-pin the three digest lines | keep the dead authwit case (leaves part of #558, which the owner chose to delete, P21-05 A) |
| D11 | #559's shape | two validators and a submit predicate over `{ value }` handles, read in today's order | value arguments (read every ref before the early returns); one rules object (a factory over the same three functions); gates left inline (a copy stays) |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a144e2): conditional approve, 7 findings, all accepted: #1 the `-?` mapping drops `undefined` (reproduced; D5); #2 exhaustiveness does not protect the special arms (tests added, claim narrowed; D3); #3 a submit object reads every ref early (handles; D11); #4 the network runs default to two retries; #5 no Header badge test; #6 `../utils/deferred` in `src/base`, and `holdReads` needs an import; #7 A1 and A2 stay Asks answered before phase 2.

**Round 1, Opus Plan:** conditional approve, 10 findings.
- Accepted: #1 the helper test in `operation-validation.parity.test.ts`, no `index.ts` edit, A1 sized at five lines, the helper dropped if A1 is refused; #2 the shapes `satisfies` the interfaces' keys; #3 the unknown-kind test fails on the base; #4 `SessionManager` and `runtime.ts` finished (D7); #5 the traced path replaces "not exploitable"; #6 smoke and network retry 0; #7 the `Date` restore; #8 Header's mount change recorded; #9 handles and the `c`/`v` names; #10 type arguments, the `src/types` diff gate, Fact 6, the cut "Not taken" line.
- Rejected: #2's statement that `-?` with `| undefined` is correct (Codex #1 reproduced the opposite).

**Round 2, Codex** (resume): conditional approve, 2 findings, both accepted: a red reproduced on the base leaves the gate unmet; the review rule keeps the binding words "moves a read". It verified the D5 mapping with the `satisfies` checks in an in-memory compile (no diagnostics), the handles, `SessionManager` and the `Date` restore.

**Final pass, Codex** (fresh session 01a144f8): conditional approve, 1 finding, accepted: the smoke gate needs the armed bundle (`global-setup-smoke.ts:45-52` refuses a plain build). It also corrected D11's reason for rejecting a rules object. **Resumed: approve**; no new material finding.

**Implementation review, round 1** (Codex gpt-6.1-sol high, session 01a14547; Opus general-purpose alongside):
- Codex: conditional approve, 2 findings, both accepted: the journal forwarding read the nine metadata fields before `kind` through `initialStage` (moves a read; now an inline literal with `satisfies` at the spread's place, key check re-proved); a restating comment on the test writer type.
- Opus: approve, 5 nits, all accepted: two comments that named a caller or a moment, the self-pay comment scoped to `aztec_sendTx` on the merged arm, a now-duplicate `stub` in one describe, a test name that kept its deleted partner's qualifier.

The plan is 163 lines against the 150-line light target: the audit verdicts and the ledger carry the four review rounds.

## Seeds

- `/goal`: Implement implementations-plan/harden-quality-fixes-1/plan.md phases 1-6, its Codex loop to convergence and its PR; every gate passing in the transcript.
- `/loop 15m`: Read STATUS.md and the open PR's checks; advance the next unmet gate of plan.md; never push a change that renders differently.
