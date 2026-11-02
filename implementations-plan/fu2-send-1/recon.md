# fu2-send-1 recon

Base: `origin/dev` at `1e6c5bc1f`. Two Sonnet explorers (a reuse sweep over the four arc-1 surfaces, a mapper of the in-progress send data); every line below was re-read by the planner. Paths are under `apps/extension/src/` unless they name a package.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Send's opening origin side | `popup/pages/send.vue` `initSendType` (:188-201) sets From from `cacheStore.preselectedBalanceType` when the token has both transfer kinds; nothing ever sets that value to anything but `"private"` (searched `preselectedBalanceType` in `src`: only `send.vue` and `stores/cache.store.ts:43`). Called after the first load (:741), whose `Promise.all` has already read the balances, and on each token pick (:595). | adapt: the sender branch reads the token's balance row |
| Parse a balance side safely | `utils/token-amount.ts` `parseSide` (absent → 0n, malformed → undefined) | reuse-as-is |
| Colocated pure Send helper | `popup/pages/send-amount.ts`, `send-fiat-gate.ts`; #1470 proposes `send-sides.ts` for the side rules | build new `send-sides.ts` (one function now; #1470 extends it) |
| Address field after paste | `components/composite/general/AddressInput.vue`, the one wrapper for Send's recipient (`RecipientField.vue:249`) and the contact form (`ContactFormFields.vue:42`, both contact popups); pins `scrollLeft = 0` only while blurred. The design `Input`'s own paste path runs only with `maxLength` (`packages/design/src/ui/Input.vue:330-352`); neither field passes one. No other `scrollLeft` write in `src` or `packages/design/src` (grep `scrollLeft`). | adapt: one native `paste` listener beside the existing three |
| Holdings split lines | `popup/components/modules/general/TokenCard.vue`: total `balanceFormatted(…, 10, { compact })` (:52), each side the same at 6 (:66-67). `BalanceView.vue:71-77` (Home hero, token page) already formats sides at 10. | adapt: sides at 10 |
| Priority row outline | `popup/components/modules/send/FeePriorityRow.vue`: `.priority_btn:hover` and `.priority_active` both set `border-color: var(--nulo-accent)`. House hover on Send rows: a `--nulo-surface-low` background (`RecipientField.vue:368-370`; `SelectTokenCard.vue:156` mixes it at 50%). | adapt: hover takes the house background |
| Sends in progress (one source) | Home: `general/RecentActivityView.vue` mirrors the journal (`useJournalMirror`, `:233`), filters `terminalAt === null && ACTIVITY_FEED_KINDS.has(kind)` in scope (`:326-337`); the progress word is `utils/card-subtitle.ts` `stageSubtitle`; a send in flight at popup open comes from the snapshot. `ACTIVITY_FEED_KINDS` = transfer, dapp_execute (`utils/journal-state.ts:34`). | adapt: lift the in-flight predicate into `utils/journal-state.ts`; reuse the mirror, `stageSubtitle`, `TransactionAwaitingCard` |
| History rows | `pages/activity.vue` mirrors terminal records only (`isTerminal: true`, accept `terminalAt !== null`); `utils/activity-rows.ts` `buildActivityRows` drops non-terminal records. `filterPendingDoubleRender` (`general/recent-activity-handlers.ts:34`) hides a pending chain tx a `submitting` record names. | adapt |
| Popup send in flight (switch guard) | `utils/in-flight-send.ts`: whether the popup's own send is in flight, by stage, to guard scope switches; its kind and stage rules serve that guard, not the activity set Home lists | not reused as the predicate |
| App-shell coordinator that opens toasts | `composables/useArrivals.ts` ("the popup's one arrival coordinator", scope + epoch, `openToast` injected), built in `popup/app.vue:93` | reuse the pattern |
| Toast | `packages/design/src/composables/toast.ts`: one toast at a time, a new open replaces it; `info` stays until closed; `openToast` returns an id; `closeToast()` takes no id; `toast` ref exposed. `utils/toast-call-sites.test.ts`: one object literal, literal `kind`, no `icon`/`color`/duration. | reuse-as-is |
| Send summary copy | `popup/pages/send-submit.ts` `submittedSub` = `${formatSnackAmount} ${symbol} to ${trimAddress(dest, 6, 4, "…")}` (not exported); `utils/snack-amount.ts`, `utils/string.ts` `trimAddress` | adapt: the summary built from a journal record |

## Collisions

- `exec-send-1` arc 2 (#1432) rewrites the balance leg of Send's first load (`refetchIdentityScopedState`). The opening side reads the `tokenBalance` computed after the load, which holds under both versions; a textual conflict is possible in `send.vue`.
- #1470 (open, enhancement) wants the five side-rule sites extracted into `send-sides.ts`. This lane adds only the opening rule there and leaves the forced-side sites as they are.
- #1341 (closed) settled that a paste-to-add keeps the sides (`keepFormFor`); the opening rule does not run on that path.

## Tests that pin today's behaviour

`send.test.ts` (fixture balance holds both sides, so Private stays), `SendTypesCard.test.ts`, `AddressInput.test.ts:32-58`, `RecipientField.test.ts`, `ContactFormFields.test.ts`, `TokenCard.test.ts:370` (sides at 6: `123.4M`, `1,234`), `FeePriorityRow.test.ts`, `RecentActivityView.test.ts`, `activity.test.ts`, `utils/activity-rows.test.ts`, `utils/card-subtitle.test.ts`, `composables/useArrivals.test.ts`. The e2e Send helper `setActiveSendType` (`tests/e2e/fixtures/transfers.ts`) toggles to the side a spec asks for, so a spec that names its side does not depend on the default. The smoke suite has no real clipboard ("the real clipboard needs a focused document this suite cannot promise", `tests/e2e/snackbar.test.ts:27`).
