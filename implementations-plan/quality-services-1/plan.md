---
plan: quality-services-1
tier: light
status: approved (Codex round 3); arc 1 in review, arc 2 next
issues: "#1436, #1441, #1447, #1467 (arc 1); #1437 (arc 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 93b9a2dfb
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-services-1: one owner each for the row protocols and the construction seams

Five quality findings, done as behaviour-preserving refactors in two arcs. Arc 1 (wallet services): the unlock-time sealing shell (#1436), the deletion-fenced create (#1441), the account-scope purge matcher and the sealed envelope and commit tail (#1447), the positional optional constructor seams (#1467). Arc 2 (popup): owned writers for the `managers` registry and a read-only registry (#1437). The owner's go (2026-11-02): "why wouldn't we want to do them? If they are worth doing and legit. I'd do them." Evidence: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Paths are under `apps/extension/src/` unless they name a package.

## The items, checked

Each is a quality finding, **demonstrated** by code trace (recon), with no runtime defect: the consequence is change cost (a new sealed store, fence step or optional seam is one more copy). Each is worth its diff: every copy it removes is a rule written two to twelve times with nothing checking the copies agree.

**Claims that did not hold.** (1) #1441: typing `admit` as `() => void` does not make "no await between the check and the commit" a type-level fact: TypeScript accepts an async function there. The helper never awaits `admit`, and its TSDoc says so. (2) #1437: 6 test writes go through the `set` trap, not 7; no account or network client is `.connect()`ed (both open on first request). (3) #1467: 45 test constructions, not about 40 (JournalReaper 23, TokenBalanceService 12, TokenService 6, IncomingTransferService 4), of which 35 pass an optional argument. (4) #1447: the status predicate is identical to the row one, so it need not stay at its call site. (5) #1441's comment: token `:559` (`finishAdd`) deletes only under an owned ticket, so it is not an instance.

## Outcome & Quality Bar

- **For whom:** the maintainer who next adds a sealed store, a fenced create, an optional service seam or a popup client slot.
- **Excellent:** each rule has one function with a TSDoc contract and a test that fails if the rule breaks; every log string, stored byte, wire message and screen is unchanged, and the existing tests pass with only seam edits; `audit:dup` falls and no touched file grows without reason.
- **Good enough:** enrolment stays explicit: nothing makes a new store or service join the helpers by itself.

## Assumptions

**Facts** (verified at `93b9a2dfb`; recon has the lines)
1. `EventHandler.invoke` runs callbacks synchronously and drops a returned promise, so every shell `void`s its handler; an async function runs to its first `await` when called.
2. The twelve shells, their locks and message strings are recon's #1436 table; only account's string is pinned by a test.
3. The five fenced creates are recon's #1441 table; account states why an emit stays in the turn of the final epoch check (`account/service.ts:841-842`).
4. The two purge matchers are identical apart from parameter names (`auth-registry/service.ts:666-678`, `token-balance/service.ts:609-623`).
5. `commitSealedTogether` must dispatch `area.set` before it returns (`sealed-entity-storage.ts:70-74`); its callers are ui-preference and incoming-transfer.
6. `managers` has six production writers in five files and no alias; `initAppServiceContext`'s two callers discard its result.
7. The four constructors' optional parameters are read only in `init` or later, never by a field initializer.

**Inferences.** I1 (checked by both legs, now a fact): no caller of `commitSealedTogether` builds an empty batch (D2). I2 (checked: the guard sees only `.warn(` and `log*(` openers; the messages are fixed strings): the log-payload guard (`utils/log-payload-ban.test.ts`) accepts a log call whose message is a parameter of a helper; phase 3's gate runs it.

**Asks.** None. Nothing here changes what a person sees.

## Decisions

- **D1 (#1447, matcher).** `accountScopeMatcher(profileId, scopes)` in `wallet/services/account/spec.ts` returns `{ row, raw }`: the full `(profileId, chainId, account)` tuple, and for a raw row only when `chainId` is a number and `account` a string, so an old-shape row is left to its root's legacy sweep. Both rule comments move onto it. auth-registry passes `status: match.row` (the same three fields). The plain-arrow lock comment and the empty-scopes return stay at the call sites.
- **D2 (#1447, storage).** `commitWithRemovals` becomes the module-level `setThenRemove(area, items, removals)`: `set` only when there are items, `remove` once it lands. `commitSealedTogether` stays non-async and returns it, so `set` is still dispatched in the call. A private `keyedRowText(naturalId, text)` builds the `{ k, r }` JSON the three keyed writes seal, the counterpart of the reader at `:578`; bytes and key order are unchanged. Explicit choice: an empty batch no longer calls `set({})`. Neither caller builds one: every `applyFeePickUpdate` branch returns both or one map object (`utils/fee-picks.ts:141-152`), the selection and pin writes are one each, and an acceptance always carries its trust row. A second tail kept for an input no caller sends would be the copy the item removes.
- **D3 (#1441).** `commitFencedCreate(deletion, fence, write, remove, { admit, landed })` in `wallet/services/create-fence.ts`, beside `restore-fence.ts`: `assertCurrent`, then `admit()`, then `await write.commit()`, then the re-check (on a stale epoch `await remove()` and throw `profileDeletedError`), then `landed()` in the same turn. It exports `DeletionFence = { profileId: string; epoch: number }`. Sites: network's seeding and `addNetwork`, contact (`admit`: `assertStillLive`), dapp-session, fpc's `writeFencedRow`; the three emits (`addNetwork`, contact, dapp-session) move into `landed`. fpc keeps its first check, `prepare` and the awaited network check, and passes the session check as `admit`; its caller emits after decorating, as today. Network's five and fpc's two `ReturnType<ProfileService["getDeletionState"]>` become `ProfileDeletionState`; network's inline fence shapes become `DeletionFence`. Token, account and the seed-offer write stay (other compensations).
- **D4 (#1436).** `wallet/services/seal-on-unlock.ts` exports `runSealing(warn, message, task)` (await, catch, `warn(message, { error })`) and `sealOnRowKeysReady(profiles, warn, message, seal)` (`profiles?.onRowKeysReady.add(...)` around `runSealing`). `runSealing` calls `task` in the same turn as the event, inside its `try` (transaction captures its deletion epoch as its first statement). Each service passes `warn` as `(...data) => this.logWarn(...data)`: a bare `this.logWarn` loses `this`. Eleven services enrol in one statement; ui-preference keeps its subscription and calls `runSealing` per store in its loop. Handler names stay (`sealLegacyRows`; account's and transaction's `onRowKeysReady`); their bodies lose the try/catch, so a direct call now rejects on failure (the two cast-calling tests are success paths). Messages stay byte-identical with the `{ error }` key; auth-registry and dapp-session keep two stores under one boundary.
- **D5 (#1467).** Exported options types beside each class: `TokenServiceOptions { pxeClientFactory?, seederOverrides? }`, `TokenBalanceServiceOptions { ticker?, projectionGate? }`, `IncomingTransferServiceOptions { pollIntervalMs?, publicReader?, incomingPollGate? }`, `JournalReaperOptions { now?, bootCutoff? }`, each the last parameter with `= {}`. Defaults are applied with `??` in the constructor, so each is still created at construction. `runtime.ts` loses four placeholders and the `:591` comment; the E2E stamp lines stay. Tests: the 35 constructions that pass an optional argument move to the options object; the 10 that pass only required ones stay as written. `ConstructorParameters<typeof TokenService>[3]` becomes `TokenServiceOptions["seederOverrides"]`.
- **D6 (#1437, writers).** `utils/core.ts` adds `replaceNetworkClient()`, `replaceAccountClient()` and `ensureAccountClient()`: synchronous, each returns the slot's client; replace disconnects the previous client first, as the call sites do today. `initTransactionService` writes through the same private slot writer. The five sites call them; `app.vue` passes `replaceAccountClient` as the network-switch dependency. The two ensure sites call `ensureAccountClient()` for its effect only and read the slot when they use it (`new-profile-helpers.ts` through `requireAccount()` after its await), so a bootstrap that replaces the slot meanwhile is still followed, as today. The new `utils/` exports regenerate the tracked `src/types/` auto-import files, which the arc commits. The fences, captured references, callback registration, timing and cleanup order are unchanged, and all three `initTransactionService` calls stay.
- **D7 (#1437, read-only).** `managers` becomes `Readonly<AppServices>`, its Proxy `set` throws, and `initAppServiceContext()` returns `void`. `utils/core.test.ts` replaces its six trap writes: the unset state by `vi.resetModules()` and a fresh import, the set state through the owned writers with the client modules mocked. Page tests write their own `@/utils/core` mock through a hoisted handle.
- **D8 (tests).** Each new or changed rule gets the smallest test, red at the base through a stub where the export is new: `create-fence.test.ts` (a deletion during the commit removes the row, throws, and skips `landed`; on success `landed` runs before a deletion queued as a microtask at the final check, and `remove` never; a stale epoch commits nothing and skips `admit`); `seal-on-unlock.test.ts` (a failing seal warns once with the message and `{ error }` and leaves no rejection; a passing one warns nothing; a `null` source subscribes nothing; the task has started when `invoke` returns), plus the two odd boundaries: ui-preference's first store failing still converts the next, and auth-registry's authwit failure skips its statuses (its existing two-store test is the success control); `accountScopeMatcher` cases in a new `account/spec.test.ts` (tuple match, chain 0 included; another chain, address or profile refused; an old-shape raw row refused, a full one matched); in `sealed-entity-storage.test.ts`, the exact opened text of the three keyed writes (`prepare`, the legacy seal, adoption: `{"k":…,"r":…}` with the row text verbatim) and `set` dispatched in the call by a keyed prepared write and by `commitSealedTogether`, pinned before D2 moves them; `core.test.ts` (replace disconnects and installs; ensure keeps an existing client and creates one when unset; a write through `managers` throws while an owned writer works). No e2e scenario is added.

## Architecture & Implementation

| Arc | Files | Change |
|---|---|---|
| 1 | `wallet/services/account/spec.ts` (+ new test), `auth-registry/service.ts`, `token-balance/service.ts`, `wallet/storage/sealed-entity-storage.ts` | D1, D2 |
| 1 | new `wallet/services/create-fence.ts` (+ test), `network/service.ts`, `contact/service.ts`, `dapp-session/service.ts`, `fpc/service.ts` | D3 |
| 1 | new `wallet/services/seal-on-unlock.ts` (+ test), the twelve services of recon's table | D4 |
| 1 | `token/service.ts`, `token-balance/service.ts`, `incoming-transfer/service.ts`, `operation-journal/reaper.ts`, `wallet/runtime.ts`, the 35 test constructions that pass an optional argument | D5 |
| 2 | `utils/core.ts` (+ test), `composables/useProfileBootstrap.ts`, `popup/app.vue`, `popup/pages/auth.vue`, `popup/pages/profile/new-profile-helpers.ts`, and their tests' `@/utils/core` mocks | D6, D7 |

Alternatives not taken: the sealing shell as a base `Service` method (`packages/extension-messaging` sits below the extension); one subscription per ui-preference store (four conversions at once); the helper in `wallet/storage/` (it is a ProfileService-event protocol, like `restore-fence.ts`, not a row format); a network-private `writeFencedRow` (the free function serves all five); injecting the owned writers into `useProfileBootstrap` (its five callers would pass the same functions; it already imports `initTransactionService`, and `vi.mock` gives the seam; so the composable still reaches the app-scope registry directly, which #1437's Decision comment says); positional seams kept for `JournalReaper` (a placeholder would stay at `runtime.ts:694`).

## UI impact

None. No screen, copy, row or format changes; arc 2 changes which function writes a popup client slot, not when.

## Security & Adversarial Considerations

- Trust boundaries untouched: no stored shape, wire message, permission, dependency, CSP or log content changes. The sealed bytes are pinned by `storage/sealed-entity-storage.test.ts`; D2 changes only which function dispatches them.
- The deletion fence protects against a row landing after a profile deletion's snapshot (an orphan that survives the purge). D3 keeps every check in place and order: the assert with no await before the dispatch, the re-check and compensation after it, the emit in the re-check's turn. `create-fence.test.ts` pins each.
- The purge matcher decides which rows an account deletion erases. D1 keeps the full tuple, so a sibling profile's rows (shared addresses are supported) and another chain's rows stay; `account/spec.test.ts` and the existing purge tests pin it.
- The sealing failure boundary stays a warn with `{ error }` (`trim` projects it to name and message), at the same level and reach. Known limits: none.

## Phase 1 (arc 1): the matcher, the envelope and the commit tail (#1447) ✓

1. Post a `## Decision` comment (done, in which arc, and what the plan changed from the issue) on each of #1436, #1437, #1441, #1447 and #1467.
2. Add D8's `account/spec.test.ts` cases against a stub export; require them red. Add D8's `sealed-entity-storage.test.ts` pins; require them green at the base. Commit.
3. Make D1 and D2. Commit.

**Gate:** from the root, `bun run lint` and `bun run typecheck:all`; from `apps/extension`, `bun --bun vitest run src/wallet/storage src/wallet/services/account src/wallet/services/auth-registry src/wallet/services/token-balance src/wallet/services/ui-preference src/wallet/services/incoming-transfer --retry=0`. Pass: every command exits 0; the new cases red before, green after.

## Phase 2 (arc 1): the fenced create (#1441) ✓

1. Add `create-fence.test.ts` against a stub; require red. Make D3. Commit.

**Gate:** phase 1's root commands; from `apps/extension`, `bun --bun vitest run src/wallet/services/create-fence.test.ts src/wallet/services/network src/wallet/services/contact src/wallet/services/dapp-session src/wallet/services/fpc --retry=0`. Pass: as phase 1; the four compensation tests (recon) pass unchanged.

## Phase 3 (arc 1): the sealing shell (#1436) ✓

1. Add `seal-on-unlock.test.ts` against a stub; require red. Make D4. Commit.

**Gate:** phase 1's root commands; from `apps/extension`, `bun --bun vitest run src/wallet/services src/wallet/storage src/utils/log-payload-ban.test.ts --retry=0`. Pass: as phase 1; `git diff` shows every message string unchanged.

## Phase 4 (arc 1): options objects (#1467) ✓

1. Make D5, `JournalReaper` last. Commit.

**Gate (arc 1 boundary):** from the root `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run audit:vue`, `bun run audit:dup`; the armed builds (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then the same flags with `build:firefox`); `(cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/sealed-storage.test.ts tests/e2e/contacts.test.ts tests/e2e/settings-crud.test.ts --retry=0)`, then with `NULO_E2E_BROWSER=firefox`; from the root, `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-dapp.test.ts tests/e2e/network/tokens.test.ts tests/e2e/network/default-token-seeding.test.ts tests/e2e/network/incoming-transfers.test.ts --retry=0`; `bun run check:plans` after staging. Pass: every command exits 0 at retry 0; `audit:dup`'s clones and duplicated lines below the base (recon); the touched files' line counts before and after recorded.

## Phase 5 (arc 2): owned writers (#1437)

1. Add D8's `core.test.ts` replace and ensure cases against stubs; require red. Make D6, moving the page tests' mocks to the owned writers (the commit says the seam moved). Run `bun run --cwd apps/extension build` and commit `apps/extension/src/types/`. Commit.

**Gate:** phase 1's root commands; from `apps/extension`, `bun --bun vitest run src/utils src/composables src/popup src/onboarding src/components src/stores --retry=0`. Pass: every command exits 0; from `apps/extension`, `grep -rnE --exclude='*.test.ts' 'managers\.(network|account|transaction)\s*(\?\?=|=)[^=]' src` finds only `utils/core.ts` (none once phase 6 lands); the build leaves `git status` clean.

## Phase 6 (arc 2): the read-only registry (#1437)

1. Add the throwing-write case; require red. Make D7. Commit.

**Gate (arc 2 boundary):** phase 4's root commands and builds; `(cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/auth-flows.test.ts tests/e2e/wallet-lock.test.ts tests/e2e/settings-crud.test.ts tests/e2e/stale-network.test.ts tests/e2e/security-reset.test.ts --retry=0)`, then with `NULO_E2E_BROWSER=firefox`; `bun run check:plans` after staging. Pass: as phase 4.

## Delivery

- Stack with `gh stack`, base `dev`. Arc 1 `quality-services-1-a1` off this plan's commit: `refactor(services): one owner each for unlock sealing, fenced creates, purge match, seams` (89), `Closes #1436, #1441, #1447, #1467`. Arc 2 `quality-services-1-a2` on it (off `dev` if arc 1 merged): `refactor(popup): the managers registry's client slots get owned writers and go read-only` (88), `Closes #1437`. Close-out: docs-only `quality-services-1-close-out`. PRs ready, no label at creation; add `e2e:extension-network` to arc 1 if its path filter skips the network lane.
- Body: what and why, the claims that did not hold, the runs at retry 0, `audit:dup` and the touched files' line counts before and after, "Not done, and why" (none planned), ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Parallelism: the arcs share no file; arc 2 stacks on arc 1 only to keep one stack. Overlaps with other work (recon § Collisions) are textual; the later PR merges `dev` and reruns its gate.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `93b9a2dfb`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1; after arc 2, one fresh Codex session over the net diff. Prompts under `~/.cache/nulo-backlog/quality-services-1/`. Hard stop at three rounds; each round in `lessons/phase-N.md` and the table below.
- Approval boundary (stop): any change to a log string, stored byte, wire message or screen; a new helper option beyond D3's two hooks; a fix that adds state, a lifecycle, a lock or a retry.
- Close-out: the Outcome; lessons promoted within budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done quality-services-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/quality-services-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| Plan 1 | Codex `gpt-6.1-sol`, high | conditional approve | All three emits through `landed`, tested against a queued deletion; exact `{ k, r }` text and keyed and batch dispatch pinned before D2; the ui-preference and auth-registry boundaries tested; `--retry=0` on the network e2e and explicit directories; 35 edits, not 45 | Keep `set({})` for an empty batch: no caller builds one (D2); Codex withdrew it in round 2 |
| Plan 1 | Opus 5.5, Plan | conditional approve | The ensure sites read the slot when they use it; arc 2 builds and commits `src/types/`; phase 5's grep excludes tests and its vitest run widens; `runSealing` runs the task in the event's turn, `warn` keeps `this`; `keyedRowText(naturalId, text)`; `security-reset.test.ts` in phase 6; the C1 note on #1437 | none |
| Plan 2, resumed | Codex `gpt-6.1-sol`, high | conditional approve | D2's empty-batch reason corrected: `forgetFpc` always returns both maps, so no caller builds an empty batch (my trace was wrong; the Opus leg was right) | none |
| Plan 3, resumed | Codex `gpt-6.1-sol`, high | approve | the audit table's separator | none |
| Arc 1, round 1 | Codex `gpt-6.1-sol`, high | approve | none | none |
| Arc 1, round 1 | Opus 5.5, diff | approve | four comments: two restating their line or type deleted, one caller reference rewritten, one restated `if` dropped | an async-hook type guard: the TSDoc states the rule |
| Arc 1, round 2, resumed | Codex `gpt-6.1-sol`, high | approve | none | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1-4 of implementations-plan/quality-services-1/plan.md marked ✓ with their gates passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1436, #1441, #1447 and #1467; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/quality-services-1 per its plan.md and the README § Post-implementation standard at 93b9a2dfb: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the arc's PR, never merge, never change a log string, stored byte or screen; stop once its checks are green and report.
```
