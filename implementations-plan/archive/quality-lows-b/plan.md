---
plan: quality-lows-b
tier: light
status: completed
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one Codex pass (gpt-6.1-sol, high) over this plan and the completed diff, then targeted verification of material fixes
base: origin/dev at 9c913679b
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24. One PR into `dev` from `quality-lows-b-a1`, one commit per issue; its merge archives this plan and closes #1977, #1978 and #1979.
- **Status:** completed.
- **Shipped:** `utils/pending-send.ts` (the refusal label and its toast helper, nine sites); `settleResolveError` and `dismissWrongProfile` in `useDappApprovalWindow`, whose options take the window's `requestId`; `createReconnectCheck` in `composables/reconnectRead.ts`, used by `createReconnectRead` and the three snapshot composables. New pins: each composable's answer to a read refused before the first connect, and the fee and execute windows' non-cancel refusal.
- **Review:** one Codex pass, no material finding, one comment nit applied (§ Review).
- **Gates:** lint, typecheck:all, audit:vue, test:all, build-storybook and check:plans green at retry 0; the touched smoke and network e2e specs green on Chrome and Firefox at retry 0 (§ Validation). A first audit:vue run hit three 5 s static-scan timeouts at a host load average near 300; they passed alone and on the rerun.
- **Deviations:** the fifth consumer of the shell, `network-unavailable`, passes its `requestId` (D2); two citations in the profile-chaos model moved one line with the file they cite.
- **Dispositions:** adopting `createReconnectRead` in the three composables, declined: it would add a first-connect re-read none of them makes today (D4).
- **Known limits:** none.
- **Open items:** #1985 (the health composable never re-reads a health read refused before its first connect; plausible but unverified).
- **Lessons:** none promoted; `lessons.md` sits at 8,148 of 8,192 bytes and nothing here generalizes past its own tests.
- **Seeds retired:** the `/goal` and `/loop` seeds in § Seeds were never run; the orchestrator drives delivery.

# quality-lows-b: approval endings, the pending-send toast and the reconnect rule get a home

Issues #1977, #1978, #1979 (quality run of 2026-11-23, filed on the owner's word of 2026-11-24). One PR against `dev` from `quality-lows-b-a1`, one commit per issue. **UI impact: none.** No string, class, testid, focus order or test expectation changes.

## Claims checked at `9c913679b`

- **#1978 holds**: nine `openToast({ kind: "error", label: "Finish or cancel your pending transaction first" })` in six files: `composables/useNetworkActivation.ts:25,30`, `popups/AccountsPopup.vue:37`, `pages/settings/accounts/index.vue:39,59`, `popups/NewAccountPopup.vue:62,79`, `popups/NewNetworkPopup.vue:79`, `popups/SelectProfilePopup.vue:66`. `NewNetworkPopup.vue:122`'s post-create wording is another string and stays. `SelectProfilePopup.vue`'s comment lists the guard's other call sites, not the toast's.
- **#1977 holds**: the `JobCancelledError` branch in fee `accept`, discover `resolveAllow`, capabilities `approve` and execute `showApprovalFailure`; `dismissWrongProfile` in fee and execute with the same comment. Each window's non-cancel branch differs (fee: `setError("Processing error.", msg)`; discover and capabilities: `console.error` + `setError("Something went wrong")`; execute: `holdRefusal` first). Reject guards differ on purpose (capabilities has no `requestId` check) and stay local.
- **#1979 holds**: `useSeedStatus` (`=== 1`), `useTokenBalanceSnapshot` (`>= 2`, plus `reset()` zeroing the count), `useIncomingSyncHealth` (`> 1`); `createReconnectRead` uses `> 1 || newestReadFailed`.

## Design

**#1978.** New `apps/extension/src/utils/pending-send.ts`: `PENDING_SEND_REFUSAL` (the label) and `toastPendingSendRefusal(openToast)`, which calls `openToast({ kind: "error", label: PENDING_SEND_REFUSAL })`, in the shape of `utils/clipboard.ts` (takes the caller's `openToast`; type-only import of `ToastOptions`). The nine sites call it. `utils/toast-call-sites.test.ts` reads the helper's one call (one literal, literal `kind`); 143 calls fall to 135, above its floor of 100. Tests keep their literal strings, so they still pin the characters.

**#1977.** `useDappApprovalWindow` gains, beside `closeWindow` and `endAndClose`:
- `settleResolveError(error, onOther)`: a `JobCancelledError` sets the window's `isInteractionCancelled` (overlay, never a banner); anything else runs `onOther()`. `onOther` takes no argument: each window's catch already holds `error`, so its log line stays byte-identical.
- `dismissWrongProfile()`: `requestId && !isInteractionCancelled ? options.reject("close") : closeWindow()`. The options gain `requestId: Ref<string | undefined>` (every window has one from `useDappInteractionPayload`), so the fifth consumer, `windows/network-unavailable/index.vue`, passes its own too: two lines, nothing else there changes.

Equivalence of `options.reject("close")` with today's `reject(requestEnd("close", true, profile))`: both windows pass `reject: (end) => reject(requestEnd(end, isWrongProfile.value, profile.value))`; the notice renders only under `v-if="isWrongProfile"`, and `isWrongProfile` is only ever set true (`fee/index.vue:183`, `execute/index.vue:464`), so at every press it reads `true`. The OK now ends the request exactly as the unload does, awaited.

Window teardown, `onBeforeUnmount`/`onUnmounted` bodies, reject guards, templates and testids are untouched.

**#1979.** `composables/reconnectRead.ts` gains `createReconnectCheck(): () => boolean`, called once per `onConnected`, true from the second call on. `createReconnectRead` uses it (`isReconnect() || newestReadFailed`, the count still taken first), and so do the three composables; `useTokenBalanceSnapshot.reset()` makes a fresh check. Retry schedules, `readOut` and the scope skip stay.

`createReconnectRead` itself fits none of the three, because each would change whether a read that failed before the first connect is recovered by that connect (it re-reads; none of them does today):

| Composable | A read refused before the first connect, today | Pinned by |
|---|---|---|
| `useSeedStatus` | not by that connect; its one timed retry (2 s) recovers it | new test |
| `useTokenBalanceSnapshot` | not by that connect; its one timed retry (2 s) recovers it | new test |
| `useIncomingSyncHealth` | not recovered until a reconnect, event, scope change or Retry | new test |

## Decision ledger

- D1. `onOther: () => void`, not `(error) => void`: the closure already holds the error; the log lines keep `{ error }` as written. Codex: see § Review.
- D2. `requestId` joins the options, required, rather than a parameter of `dismissWrongProfile` or an optional field: the options already carry the window's refs (`profile`, `isInteractionCancelled`, `isLoading`), and an optional one would make a forgotten id silently close instead of reject.
- D3. `useTokenBalanceSnapshot.reset()` replaces its check instead of the helper growing a `reset` for one caller.
- D4. `useIncomingSyncHealth` keeps its behaviour (brief); the gap it shows is filed as #1985 (plausible but unverified), not fixed here.

## Tests

- `utils/pending-send.test.ts`: the helper opens one error toast with the exact characters.
- `useDappApprovalWindow.test.ts`: `settleResolveError` (cancel sets the flag and skips `onOther`; another error runs `onOther` and leaves the flag), `dismissWrongProfile` (live request: `reject("close")`, no bare close; cancelled or no request id: `closeWindow()` with the listener kept, no reject). The window suites stay as they are and pin each window's endings; two cases join them for the one branch no window test held, an accept or approve refused for a reason other than a cancel (fee and execute: the error, never the overlay). Both pass against the base windows, and making `settleResolveError` treat every error as a cancel fails them and four other window tests.
- `reconnectRead.test.ts`: the check is false once, then true.
- The three composable suites: the row above, each. Each new pin passes against the base copies of the three composables (run at `9c913679b`'s files), so it pins today's behaviour.
- Moved, not changed: the profile-chaos model's two citations of `SelectProfilePopup.vue` (`tests/e2e/helpers/profile-chaos/model.ts`, lines 70 and 150 to 71 and 151), which the helper's import shifted; the model's citation check (`scripts/e2e/profile-chaos-model.test.ts`) read them as missing.
- Generated: `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` list the three new exports (the build writes them).

## Validation

Outcomes: audit:vue 1,057 files and 18,988 tests green; test:all green (extension 18,995 tests); smoke `accounts`, `settings-crud`, `auth-flows`, `popup-stack`: Chrome 24/24, Firefox 24/24; network `tx-sendTx-default`, `tx-sendTx-reject`, `cap-window`, `connect-deny`, `connect-every-site`, `connect-unserved-chain`, `in-flight-send-guard` (proverless): Chrome 13/13, Firefox 12/12 plus one Chrome-only case skipped.

Commands: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run audit:vue`, `bun run --cwd apps/extension build-storybook` (imports move in `src/utils` and `src/composables`), `bun run check:plans`. E2E: the specs that drive the four windows' cancel, wrong-profile and reject endings and the switch refusals (`git grep` under `apps/extension/tests/e2e`), smoke from `apps/extension`, network in one `e2e:agent` run, each on Chrome and Firefox (window handling), retry 0.

## Review

Bounded work: one Codex pass over this plan and the completed diff, adversarial (a window that ends differently on a raced cancel or a wrong-profile request; a reordered teardown; a toast call the call-site test no longer covers; a composable whose first read after a failed connect changed), then targeted verification.

**Verdict (Codex gpt-6.1-sol, high, 2026-11-24):** no material regression. It traced every ending of the five windows, the `isWrongProfile` chain behind D2's equivalence (set only true, the notice only under it, `requestEnd` mapping the close), the unchanged teardown order, the helper's one `openToast` call inside the call-site scan, the count taken first in all four handlers, and the pins failing on an immediate re-read; it judged D1-D4 sound and none of it over-built. One nit, accepted: the comment on `PENDING_SEND_REFUSAL` restated the name; deleted.

## Seeds

- `/goal` quality-lows-b: #1977, #1978, #1979 land as one PR with no visible change.
- `/loop` babysit the PR's checks until the orchestrator merges.
