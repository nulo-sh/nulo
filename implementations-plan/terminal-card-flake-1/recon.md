# Recon: terminal-card-flake-1 (#903)

Base: `dev` at 44bc391f. One Explore agent (sonnet) swept the fixtures and the activity surfaces; the
driver verified each load-bearing claim below against the tree and ran one scratch probe
([lessons/phase-0.md](lessons/phase-0.md)). Paths are under `apps/extension/`.

## Reuse map

| Capability needed | Found | Verdict |
|---|---|---|
| Wait and read in one evaluation | `page.waitForFunction` whose predicate returns the data or `null`, then `handle.jsonValue()`: `waitForNameField` (`tests/e2e/fixtures/dom.ts:140-153`), `editorText` (`fixtures/code-editor.ts:34-44`), `shownToast` (`tests/e2e/helpers/contacts.ts:206-226`), `waitForPgResult` (`fixtures/playground.ts:145-167`); `withTimeoutMessage` (`dom.ts:83`) names the miss | reuse as is: inline the idiom, as every peer does; no generic helper exists or is needed |
| Proof the router committed the destination | `RouterLink` sets `aria-current="page"` when exact-active (vue-router 5.2.0, `node_modules/vue-router/dist/vue-router.js:1003`); the bottom nav renders one `RouterLink` per tab with testid `nav-<name>` (`src/popup/components/Navigation.vue`), shown on Home and History (`showBottomNav`) | reuse: read the state attribute on the testid, as fixtures already read `aria-checked` (`fixtures/settings.ts:72-85`, `fixtures/popups.ts:306-312`) |
| Wait for the leaving page's rows to go | `openSurface` (`tests/e2e/rows.test.ts:756-761`): element handles of the leaving rows, then a wait until none is connected | rejected for this fixture: a call on the page already shown (scope-refusal's Home read) remounts nothing, so the wait never ends |
| A unique page root on History | `activity-feed-root` is on History (`src/popup/pages/activity.vue:191`) and on Home's recent-activity widget (`RecentActivityView.vue:826,909`) | none without a product change |
| Unit tests for fixtures | `scripts/e2e/*.test.ts` (jsdom unit lane); no fake `Page` anywhere | none: the proof is the probe plus the three specs |

Absence trail: `tests/e2e` grepped for `jsonValue`, `waitForFunction`, `aria-current`, `\$eval`, and
helper names `waitForText|readWhen|waitAndRead|pollFor|waitForValue`; `src` grepped for
`tx-terminal-card`, `activity-feed-root`, `RouterView`.

## Callers of `readTerminalCard` (all network specs)

| Spec | Call | Page before |
|---|---|---|
| `tests/e2e/network/tx-sendTx-reject.test.ts:103` | `"#/popup/activity"` | Home, fresh popup (the CI failure) |
| `tests/e2e/network/scope-refusal.test.ts:35` (`readHistoryCard`, used at 68 and 129) | `"#/popup/activity"` | journal detail |
| `tests/e2e/network/scope-refusal.test.ts:127` | `"#/popup/general"` | Home itself |
| `tests/e2e/network/legal-acceptance-wall.test.ts:75` | `"#/popup/activity"` | journal detail |

## The same shape elsewhere in `tests/e2e/fixtures/`

A wait, then a separate read. A change needs a written path ([implementations-plan/README.md § Proportion](../README.md#proportion)).

| Fixture | Path for the read to miss or read the wrong node | Disposition |
|---|---|---|
| `readTerminalCard` (`journal-page.ts:48-60`) | demonstrated: CI and the probe | fixed |
| `readJournalDetail` (`journal-page.ts:19-32`) | none: no departing page holds `journal-detail-state`; every field renders in one `op && display` block (`src/popup/pages/journal/[id].vue:241`); a reload replaces `op` in place (`:182-186`); only an active-scope change blanks it (`:207-214`), which no caller makes | unchanged |
| `getTokenDetailBalances` (`tokens.ts:199-208`) | none: `private-balance-value` renders only with `tokenToDisplay` (`BalanceView.vue:322-327`), so Home cannot meet the wait, and both values sit in one block | unchanged |
| `readPinState` (`tokens.ts:189-196`) | none: the helper opens the menu itself; nothing closes it before the `$eval` | unchanged |
| `settledText` (`fee-quote.ts:56-68`) | none: returns the text by design for the caller's assertion | unchanged |
| `setAdvancedToggle`, `expectNameFieldPrefill`, `lockThroughConfirmDialog`, `readCapabilitySwitch` | none: static nodes after their ready signal | unchanged |

## Collisions

- #743 (onboarding-3) and #886 (connect-split-1) edit `.claude/skills/e2e-testing/SKILL.md`; #743 claims flake-ledger row 57, e2e-flakes-2 rows 58 and 59. Row 60 is on `dev`.
- encryption-at-rest-1 will edit `tests/e2e/fixtures/journal.ts`, a different file.
- No open PR touches `journal-page.ts` or the three specs.
