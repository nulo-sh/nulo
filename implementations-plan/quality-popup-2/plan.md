---
plan: quality-popup-2
tier: light (the spawn prompt names it; one Codex audit at high on gpt-6.1-sol, plus one Opus Plan lens)
status: approved by the final Codex pass; arc 1 in review; phase 5 waits on OA-1
issues: "#1469, #1476, #1445 (arc 1, Closes); #1468, #1473 (arc 2, Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 6c7ba2867
trunk: dev
post_implementation_hardening: not scheduled
---

# quality-popup-2: one row card, named amount widths, a task mirror and a re-ask hook; one passkey ask; two config reads

Five quality findings on the popup, all refactors a person never notices. Arc 1 is the activity feed and its detail pages: the amount width and journal gate (#1469), the rows, scope and detail cards Home, History and the detail pages each assemble (#1476), and the Home feed's hand-rolled task mirror and re-ask sheet (#1445). Arc 2 is the passkey-gated pages' panel move and stored-passkey ask (#1468) and the hand-rolled config reads (#1473). The owner's word on these findings (2026-11-02) is the go: "If they are worth doing and legit. I'd do them." Recon, with every claim that did not hold: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** the next contributor who adds a row kind, changes the row's amount width or the journal amount gate, adds state to the Home feed, changes the stored-passkey request, or changes how a page reads config.
- **Excellent:** (1) each of those is one edit in one named place: a row kind in one card, a width in one constant, the gate in one function, Home's per-scope state behind two hooks with `reset()`, the passkey request in one typed helper. (2) Nothing a person can observe changes in arc 1 or phase 4: same screens pixel for pixel, copy, testids, stored rows and log lines, proven by the existing tests left unchanged except where a seam moved (each such commit says so), plus the pins each phase adds first. Phase 5's one behaviour change waits on the owner (OA-1).
- **Good enough:** tx, incoming and journal rows keep their own amount rules (D4, D15); `PopupManager` keeps its seed (D14).

## Assumptions

**Facts** (citations in recon.md):
1. Only `journalCardAmount` parses a journal amount with `parseSide`; the terminal card and the journal page hand the raw string to `BigInt`, which reads `"0x10"` or `"-5"` as a number and throws on `"1e5"`. Every wallet writer stores a decimal integer string.
2. `amount.callers.test.ts` never reads `balanceFormatted`'s length argument, so a named width keeps every per-file count.
3. Home and `TransactionsList` dispatch the same three row cards with the same props, except Home's `!token` arriving gate and its `id` spread; nothing in `src` or `tests` reads that `id` attribute (searched `getElementById`, `[id=`, `attributes("id")`).
4. `useJournalMirror` takes its side effects as `onRecord`/`onSnapshot` callbacks and makes `dispose()` terminal with a flag; the task clears read the task refs, the pending-cancel set, the account and, for the snapshot clear, the mirror's rows.
5. `RecentActivityView.test.ts` reads the exposed refs as unwrapped `vm` properties and mutates `pendingCancelJobIds` once (`:1216`); re-exposing the hooks' writable refs under the same names keeps that surface.
6. `leavePanelFor(route)` runs `closesOnFocusLoss()` and calls `moveToOwnWindow(route)` before its first suspension, so `void leavePanelFor(route)` behaves as the inline form.
7. `useConfigRead` is a reconnect-safe read, not a subscription; `createReconnectRead` counts the first connect as the mount's own.
8. `getPasskeyUnlockParams` is a client method that calls `this.request`: passed unbound, it throws.

**Inferences:**
- I1. Dropping the receipt's tx-hash `gap="12"` moves no pixel: the row's two items never meet at the popup's narrowest width. Phase 2's screenshots settle it (D7).

**Asks:** OA-1 (OWNER-ASKS.md), phase 5 only; nothing in arc 1 or phase 4 waits on the owner.

## Architecture & Implementation

Paths under `apps/extension/src/`. New exports under `utils/` and `composables/` regenerate `types/auto-imports.d.ts`; commit it with the export (CI's build fails on drift).

**Arc 1, the activity feed (branch `worktree-quality-popup-2`).**

- **Phase 1, #1469.** `utils/snack-amount.ts` exports `ROW_AMOUNT_LENGTH = 8`, used at the six row sites; `popup/pages/detail-page.ts` gains `DETAIL_AMOUNT_LENGTH = 8` for the three heroes (D2) and `showsDeveloperFields(props: readonly ConfigProp[]): boolean`, called inside both pages' existing `onMounted`. `utils/journal-state.ts` gains `journalTransferAmount(op, token): { raw: string; decimals: number } | null`, the one gate (a transfer, a non-empty `amountRaw`, known decimals); `journalCardAmount` keeps its `parseSide` refusal on top, `transferCardFields` keeps setting `amountSymbol` only with the amount, and `journal/[id].vue`'s hero and fiat read it (D3, D15). Pins: a `journalTransferAmount` table, one row per refused class plus a success control; one pin that the terminal card still formats `"0x10"` while the in-flight card refuses it.
- **Phase 2, #1476.** (a) New `utils/active-scope.ts`: `activeAccountScope(app)` returns `{ profileId, networkId, account }` or `undefined`, replacing the four literals; `app.vue` keeps its `isLogined` and route clauses. (b) New `popup/components/modules/activity/ActivityRowCard.vue` (props `row`, `tokens`, `tokenById`, `fiatLabel`, `isArriving`): one row's card, the terminal props computed once, no `id` attribute (D6); Home passes `isArriving` only off the token page, History its own; both pages' builder wrappers go. (c) `received/[id].vue` uses `TxHashRow` with its two testids and `@copy="(hash) => copy(hash, 'Tx hash')"` (D7). (d) New `popup/components/modules/tx/DetailAddressCard.vue` (props `label`, `address`, `addressTestid`, `explorerUrl`, `explorerName`, `linkTestid`; a default slot for a body that is not an address): with an address it renders `AddressDisplay` and emits `copy` on a click that ends no selection; without one it is the static card, its `.address_card.card_static` compound rule moved in whole (D8). Used by the tx page's two cards and the receipt's two. Seams, each named in its commit: `stubs: { ActivityRowCard: false }` in `RecentActivityView.test.ts` and `incoming-row-parity.test.ts`; `a11y-css.test.ts`'s receipt link count 3 → 2 (the link moves into `TxHashRow`, already counted); `scripts/type-roles/identifier-sites.expected.json` (the four `AddressDisplay` sites become the card's); `popup/app-wiring.test.ts` (the sends scope text). New tests: `activeAccountScope` (each missing part, a full scope); `DetailAddressCard.test.ts` (copy, a selection, the static card, the link's `aria-describedby`); a source pin for the compound static rule beside `detail-page.styles.test.ts`. Before/after screenshots of Home, History, the tx page and the receipt (address, Private and Mint From cards) at 240 and 360 px.
- **Phase 3, #1445.** Two C1 hooks, called from the view's existing scope watcher and `onBeforeUnmount`:
  - `composables/useExecutingTask.ts({ taskService: Pick<TaskServiceClient, "getTasks">, accept, account, journalRows })` returns writable refs `task`, `subtasks`, `pendingCancels`, plus `activeStepLabel`, the three task handlers (the view subscribes them, as it does the journal mirror's), `snapshot()` (begins its own run, as `loadExecutingTaskSnapshot`'s default does), `markCancelling(jobId)`, `onJournalRecord(op)` (the pending-cancel and own-terminal clears), `onJournalSnapshot()` (the 30 s clear), `reset()` (invalidates the run, then clears) and `dispose()` (a terminal flag checked before the request, before landing and in the handlers, as `useJournalMirror` does). `accept` is the view's `isExecutingTask`; `clearAwaitingTransactionFallback` stays in the view (it reads the store's placeholders).
  - `composables/useReaskReview.ts({ acceptQueuedFee, findOp, usdRate, amountOf, symbolOf })` owns `REASK_KEY`, the opened snapshot, `sending`, `useSendReview` and the changed-fee watcher; returns `opened`, `isOpen`, `order`, `depth`, `ready`, `sending`, `open(jobId)`, `send()`, `close()`, `reset()` (closes and forgets the snapshot, leaves `sending` as today); no `dispose()` (D10).
  - The watcher becomes `journal.begin()`, `journalOps.value = []`, `executing.reset()`, `reask.reset()`, then, for a ready scope, the journal reload and `executing.snapshot()`, all `flush: "sync"`. `onBeforeUnmount` keeps `reask.close()` first and adds `executing.dispose()` after the disconnects. `defineExpose` keeps its seven names (Fact 5).
  - Pins first, added to `RecentActivityView.test.ts` and green before the move: a parked `getTasks()` whose scope then collapses (network gone, address kept) resolves with a UI transfer that carries no `networkId`, and the task stays cleared (proves `reset()` invalidates, Codex F2); a `(BUG PIN)`: with A's re-ask send parked, a switch to B keeps `sending`, B's second send makes no call, and A settling closes B's sheet (D16).
  - Tests: each hook ≥10 cases (CLAUDE.md § Composables), in `effectScope` with `EventHandler` fakes, as `useSendsInProgress.test.ts` does, including a run begun after `dispose()` that never requests and both pins' contracts. `RecentActivityView.test.ts` otherwise changes only by the phase 2 stub.

**Arc 2, the passkey pages and config reads (branch `quality-popup-2-arc2`, on arc 1).**

- **Phase 4, #1468.** New `utils/profile-passkey.ts`: `askProfilePasskey(runCeremony, profiles: Pick<ProfileServiceClient, "getPasskeyUnlockParams">, { profileId, step, profileName }, isCurrent): Promise<PasskeyCredentialData | undefined>` calls `profiles.getPasskeyUnlockParams(profileId)` as a method (Fact 8), returns `undefined` with no ceremony when `isCurrent()` is false, else runs `{ mode: "get", credentialId, prfSalt, step, profileName: profileName() }`. `profileName` is a getter (D11): account, seed and unlock-method close over the name they read before the lookup; auth and backup read it live. Account export passes `() => isCurrent() && scope === approvalScope()`; backup maps `undefined` to `"handled"`; `auth.vue` keeps its Firefox branch; `currentPasskey` becomes a wrapper. Every post-ceremony fence, verification, toast, log and navigation stays at its call site. The four inline moves become `void leavePanelFor(route)` inside each page's own gate. Pins first, green before and after: account export's approval-scope check (the parked lookup resolves and `appStore.network.chainId` changes in one synchronous block: no ceremony; the same scope: one); account export's move with its `?address=` query; the name read before the lookup (seed) and after it (auth). The own-window mocks in `seed.test.ts`, `full-passkey.pins.test.ts`, `unlock-method.test.ts` and the new account pin add `leavePanelFor: async (route) => closesOnFocusLoss() && moveToOwnWindow(route)` over their mocked pieces, so every existing assertion stays byte for byte (D12). Helper tests: the exact request, the stale lookup, a rejected lookup.
- **Phase 5, #1473, only on OA-1.** `BalanceView.vue` and `holdings.vue` read through `useConfigRead`, one instance per key so each key settles alone (holdings has two), created before any config request; each keeps its `onUpdate` listener; each `land` skips a key `updatedSince` names; `dispose()` after `configService.disconnect()`. Pins first: a reconnect re-reads `BalanceView`'s flag; an update during a read wins; holdings' privacy key lands while the dust read hangs and then rejects. Seams: `holdings.test.ts`'s `mountPage` fires the first connect, as the real client does; `BalanceView.test.ts`'s config mock gains `onConnected`.

**File-level change map.** Arc 1: `utils/{snack-amount,journal-state,active-scope}.ts`, `popup/pages/detail-page.ts`, `popup/pages/{tx,received,journal}/[id].vue`, `popup/pages/activity.vue`, `popup/app.vue`, `popup/components/modules/activity/{ActivityRowCard.vue,TransactionsList.vue,TransactionCard.vue}`, `popup/components/modules/tx/DetailAddressCard.vue`, `components/composite/activity/TransactionIncomingCard.vue`, `popup/components/modules/general/RecentActivityView.vue`, `composables/{useExecutingTask,useReaskReview}.ts`, `types/auto-imports.d.ts`, `scripts/type-roles/identifier-sites.expected.json`, their tests. Arc 2: `utils/profile-passkey.ts`, `popup/pages/settings/security/{export/account,export/seed,export/full,unlock-method}.vue`, `popup/pages/auth.vue`, `composables/useFullBackupExport.ts`, `popup/components/modules/general/BalanceView.vue`, `popup/pages/holdings.vue`, `types/auto-imports.d.ts`, their tests.

**UI impact:** none on the Home feed, History, the tx, receipt and journal pages or the four passkey pages: no markup a person sees, copy, testid or style value changes; phase 2's screenshots are the proof for the moved cards. Phase 5 (the balance hero, Holdings): OA-1.

## Security & Adversarial Considerations

- **Threat model.** A hostile dApp names its origin and sends calls that become journal and task rows; an outside writer can store a malformed row; a profile, account or network switch, a lock or a worker restart can land between any two awaits. The refactor moves code on those paths, so the risk is a moved read, a lost fence or a reordered reset, not new input.
- **Invariants kept, with their proof:** the dApp name bracketed before it labels a card (`sanitizeJournalSubtitle`, unchanged); the switch reset synchronous and complete before the next paint, the captured-account guards on both snapshots, journal side effects only for in-scope records (the containment suites in `RecentActivityView.test.ts`); the stored-passkey order lookup, fence, ceremony, with account export's approval-scope check between lookup and ceremony (phase 4's new pin, and the stale-lookup tests at `account.test.ts:497`, `seed.test.ts:321`, `unlock-method.test.ts:595`, `useFullBackupExport.test.ts:270`); each malformed journal amount rendering as it does today (D15).
- **Changed on purpose:** after unmount, the task hook neither requests nor assigns, so a snapshot no longer reopens a disconnected port; phase 5 (OA-1): a reconnect re-reads the fiat setting, a stale read no longer overrides a newer toggle, holdings' mount sends two reads instead of four, and `BalanceView`'s failed read no longer logs an unhandled rejection. **Input validation, crypto, supply chain, least privilege:** no new dependency, crypto or permission. **Logs:** no other log line changes.

## Phases and gates

Every gate runs from the worktree root. A test command is `cd apps/extension && bun --bun vitest run <paths> --retry=0`. Pass: exit 0 for each command, and no test skipped that ran on the base.

- [x] **Phase 1.** Tests `src/utils src/popup/pages/journal src/popup/pages/tx src/popup/pages/received src/popup/components/modules/activity src/components/composite/activity`; `bun run lint`; `bun run typecheck:all`.
- [x] **Phase 2.** Phase 1's tests plus `src/popup/pages/activity.test.ts src/popup/incoming-row-parity.test.ts src/popup/app-wiring.test.ts src/popup/components/modules/general src/popup/components/modules/tx scripts/type-roles`; lint; typecheck; the screenshots in `lessons/phase-2.md`.
- [x] **Phase 3.** Tests `src/composables/useExecutingTask.test.ts src/composables/useReaskReview.test.ts src/popup/components/modules/general src/popup/incoming-row-parity.test.ts`; lint; typecheck.
- [x] **Arc 1 end.** `bun run audit:vue`; `bun run test:all`; `bun run audit:dup` (production clones and dup lines no worse than 177 / 8775); smoke `cd apps/extension && bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/received-fee-privacy.test.ts tests/e2e/navigation.test.ts --retry=0` on Chrome and with `NULO_E2E_BROWSER=firefox`; network `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/cancel-mid-prove.test.ts tests/e2e/network/account-switch-isolation.test.ts tests/e2e/network/account-switch-live-session.test.ts` on Chrome; `bun run check:plans` after staging.
- [x] **Phase 4.** Tests `src/utils/profile-passkey.test.ts src/utils/own-window.test.ts src/popup/pages/settings/security src/popup/pages/auth.test.ts src/composables/useFullBackupExport.test.ts`; lint; typecheck.
- [ ] **Phase 5 (on OA-1).** Tests `src/popup/components/modules/general/BalanceView.test.ts src/popup/pages/holdings.test.ts src/composables/useConfigRead.test.ts`; lint; typecheck.
- [ ] **Arc 2 end.** After merging `origin/dev`: arc 1's end gate, with smoke `security.test.ts security-backup.test.ts passkey-paths.test.ts fiat-display.test.ts sw-resilience.test.ts` on both browsers and `toolbar-panel.test.ts` on Firefox; no network file (no service path moves).

## Decision ledger

- D1. Two arcs by file family, stacked as the lane brief asks: arc 1 owns every activity file, which no other lane touches; arc 2 touches `unlock-method.vue`, `export/full.vue` and `auth.vue`, which `quality-popup-1` and `quality-services-1` edit in other regions, so it merges `origin/dev` and reruns its gate before its PR. Opus O11 (arc 2 as a sibling off `dev`) rejected: the brief names the stack, and one close-out home.
- D2. `ROW_AMOUNT_LENGTH` lives in `snack-amount.ts`, where the row's form is already named; `activity-rows.ts` imports `journal-state.ts`, so it cannot host it. `DETAIL_AMOUNT_LENGTH` stays apart: whether heroes follow rows is the owner's, and today they only happen to agree.
- D3. `journalTransferAmount` returns the raw string and the decimals: the row and the hero format at different widths, and each caller keeps its own parse.
- D4. No `activityAmount`/`activityFiat`. Tx rows and the tx page already share `tx-amount.ts`; the incoming card's check equals `knownDecimals` for its one caller; the receipt's missing empty guard differs only on rows no writer stores, and #1555 declined to guard that render. A helper "with explicit parameters so rendering stays the same" is a flag helper.
- D5. No `useAccountIncoming`: Home and History differ in `afterRead`, `loaded`/`refresh` and connect order, so a hook would carry an option per caller.
- D6. `ActivityRowCard`, not `ActivityRow` (a row type in `activity-rows.ts`). No `id` attribute: nothing reads Home's (Fact 3; both legs agree), and keeping it means a journal-only pass-through in Home's template.
- D7. `TxHashRow` gets no `gap` prop (I1; Opus agrees). If the screenshots differ, the receipt keeps its own row and the PR says why.
- D8. `DetailAddressCard` derives "copyable" from having an address (Opus O8): the receipt's `fromClickable` is exactly that. The Private and Mint bodies fill its slot; their `from_name` class stays on the receipt page.
- D9. `useExecutingTask` takes the client's `getTasks` and a late-bound `journalRows` getter (the mirror is built after it, and `onSnapshot` fires only after rows land); the view subscribes its handlers, so teardown is today's. No `begin()` (Opus O4): `reset()` invalidates and `snapshot()` begins, which keeps "a newer trigger supersedes" without a caller able to kill its own new run.
- D10. `useReaskReview` has no `dispose()`: its watcher stops with the view's scope and `useSendReview` disarms by `onScopeDispose`.
- D11. `askProfilePasskey` takes the name as a getter: three callers read it before the lookup, two after; the getter runs after the fence, which is what makes auth's live read safe.
- D12. The page tests keep mocking `moveToOwnWindow` and add a delegating `leavePanelFor` (Opus O6): every assertion stays as written, the new account pin passes before and after the move, and a bare `leavePanelFor` mock would flip the two "no move off the panel" assertions.
- D13. `BalanceView`'s and holdings' move to `useConfigRead` changes what a person can see after a missed update, so it is OA-1 (Codex C6), not a panel call.
- D14. `PopupManager` stays: it seeds `useIncomingTrustPrompts`, which fails open and registers its listener after the seed; moving it would change that hook's contract, not remove a copy.
- D15. The journal gate keeps each caller's parse (Codex C6, Opus Ask 1): unifying on `parseSide` would hide hex and negative amounts the terminal card and the journal page now show, on rows only an outside writer stores. The divergence is a known limit, filed closed with the arc 1 PR: #1593.
- D16. A re-ask send that settles after a scope switch closes the next scope's sheet (Codex C5; `RecentActivityView.vue:417-428`): it needs a switch from another window inside one RPC, and costs one tap. The hook preserves it verbatim under a `(BUG PIN)`; a known limit, filed closed with the arc 1 PR: #1594.
- D17. Arc 2 delivers as one PR off `dev`, not a stack (the orchestrator's instruction once arc 1 merged): branch `quality-popup-2-a2` from `origin/dev` at `422e22932`, with the close-out as its last commits. Phase 5 stays out (OA-1 unanswered), so the title is the without-phase-5 one and #1473 stays open with a comment.
- D18. Account export and the lock screen stop on the helper's `undefined` before their own check: their predicates (the approval scope, `moved()`) can read true again after reading false. Seed, Unlock method and the backup re-check a run fence, which never does, so their existing check covers it; the backup maps `undefined` to `"handled"` as planned. No production ceremony resolves `undefined`.
- D19. Seams the move shifted, each in the phase 4 commit: the backup composable's await-count pin counts the helper's await too (18 = 17 + 1, rows unchanged: both park points remain); the profile chaos model re-cites 21 lines by line diff from the base files, and two fragments (the reveal's and the account file's ceremony call) move to the ask's argument line.

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 (`gpt-6.1-sol`, high) | conditional approve | C1: one `useConfigRead` per holdings key, with a hanging-read pin; C2: the parity test's stub; C3: a terminal `dispose()`; C4: an approval-scope pin and name-timing pins; C5: the send-across-switch path kept and pinned (D16); C6: phase 5 to the owner (OA-1), the journal parse kept per caller (D15) | D6's `id` and D7's `gap` kept as decided (Opus agrees) |
| Opus Plan lens | conditional approve | O1: the lookup as a client `Pick` (Fact 8); O2: the scope pin's method; O3: holdings' first connect, the read counts; O4: no `begin()`, a terminal `dispose()`, writable refs; O5: the parity, `a11y-css`, `type-roles`, `app-wiring` and auto-import seams; O6: the delegating mock (D12); O7: Fact 1 restated, `amountSymbol` coupling kept, the log line named; O8: copyable derived, the compound rule; O9: D10's wording, `reset()` leaves `sending`; O10: the two account-switch network files | O11 (D1) |
| Codex final (fresh) | conditional approve | F1: OA-1 names the dust fold and states Holdings' reconnect as it is; F2: a component pin that a collapsed scope's parked task read lands nothing; F3: D16's pin on the component before the move, covering `sending` | none |
| Codex final (resumed) | approve | none; F1-F3 verified, no regression; phase 5 still waits on OA-1 | none |
| Arc 1 Codex R1 (diff from `6c7ba2867`) | changes, no production regression | A1: the corner-link pin sends its click through `sendEvent`; A2: the dispose pin holds a recent own record (mutation-checked); A3: `accept`'s comment; A4: four restating comments cut | A4 in part: the `isArriving` and `tokens` prop comments kept (each states a rule the code cannot) |
| Arc 1 Opus review (beside R1) | approve, no defect | seven comments corrected (dApp tasks refused, the catch, the window, an empty snapshot, the cancel and scope comments, a stale line); one unused import dropped | none; two findings duplicated A3 and A4 |
| Arc 1 Codex R2 (resumed) | approve | none; fixes verified, no regression | none |
| Arc 2 Codex R1 (diff from `422e22932`) | approve | B1: the await-count pin's restating comment cut | none |
| Arc 2 Opus review (beside R1) | approve | O1: a pin per page for D18's `undefined` stop (red with the stop removed); O2: the helper's TSDoc names the stop; O3: `currentPasskey`'s comment keeps only what the wrapper adds | none |
| Arc 2 Codex R2 (resumed) | approve | none; fixes verified, no regression | none |

## Delivery

- **Arc 1** (phases 1-3): branch `worktree-quality-popup-2` to `dev`, `gh pr create` (the stack's base), ready, no labels at creation. Title: `refactor(activity): one row card, named amount widths, task and re-ask hooks off the feed` (89 characters). Body: what moved and why, the gates with outcomes, `audit:dup` and the touched files' line counts before and after, the screenshots, "Not done, and why" (D4, D5), the two known limits (D15, D16), `Closes #1469`, `Closes #1476`, `Closes #1445`.
- **Arc 2** (phases 4-5): `gh stack add quality-popup-2-arc2` after arc 1's loop converges; `gh stack submit --auto` when its own does. Title: `refactor(popup): one passkey ask, leavePanelFor on four pages, two views on useConfigRead` (89 characters; without phase 5: `refactor(popup): one stored-passkey ask, and leavePanelFor on the four passkey pages`). Body adds "Not done, and why" (D14), `Closes #1468`, and `Closes #1473` only with phase 5. The close-out is arc 2's final commits.
- **Parallelism:** none; arc 2 is small and waits on other lanes' edits to its files (D1).

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `6c7ba2867`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 per arc over that arc's diff (arc 1 from `6c7ba2867`, arc 2 from arc 1's head), then one fresh pass over the net diff after arc 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block (`Known limits:` the D15 and D16 issues); lessons promoted with a pruning pass; a comment on any issue left out; `STATUS.md` deleted; `git mv` to `archive/quality-popup-2/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/quality-popup-2/plan.md`, then `agent-worktree done quality-popup-2 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-3 ✓ in implementations-plan/quality-popup-2/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff from 6c7ba2867; a ready PR to dev closing #1469, #1476 and #1445; `bun run test` and `bun run lint` exit 0. Then phases 4-5 the same way on the stacked arc 2, phase 5 only on OA-1.
- `/loop 15m` Drive implementations-plan/quality-popup-2 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.

Size: under light's 150-line target.
