# send-build-1: recon

Read at `dev` `5736a920a` (the worktree's base). Three read-only explorers (Sonnet): today's Send, the prototype against production, a reuse sweep. The prototype is the test page on branch `worktree-send-pocs-8` (head `2e971f2d5`, `apps/extension/pocs/`), read only; nothing is copied from it. Paths below are under `apps/extension/` unless they say otherwise.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Section label ("To", "Amount") | `.type--label-section` (`packages/design/src/utilities.css:70`), `SectionLabel` | reuse |
| The person picked: contacts and own accounts, typed or pasted | `popup/components/modules/send/RecipientField.vue` (search, suggestions, paste), `recipient-search.ts` | reuse on the person step |
| Recent recipients | none (searched `recent`, `lastUsed`, `last_send`, `lastSent` in `src`: only Home's `RecentActivityView`) | build new: a pure selector over the journal's popup transfers |
| Last send to a person | `OperationJournalServiceClient.getOperations({ accountAddress })` (`wallet/services/operation-journal/client.ts:17`); records carry `recipientAddress`, `amountRaw`, `tokenId`, `transferType`, `networkId`, `origin`, `progress.stage`, `terminalAt` (`spec.ts:68-98`); 50 succeeded records kept per profile and account (`gc.ts`, `DEFAULT_TERMINAL_CAP_PER_SCOPE`) | reuse the client; build the selector |
| The address in two lines of 33 with bold ends | `addressEnds` (`utils/string.ts:21`, 6 and 4), the review's bold-end spans (`SendReviewSheet.vue:62,132`) | build new (small): `addressHalves` beside `addressEnds`, one L3 component |
| Token row | `SelectTokenCard.vue` (one press, chevron, the 36 px `TokenMark` signed on P129-01 / M1) | adapt: spacing only |
| Amount, unit switch, Max, refusals | `components/composite/send/AmountCard.vue` (695 lines, ~96 cases) | adapt: label line with Max (M3), balance segment out |
| The sides | `SendTypesCard.vue` (click-to-flip spans, no keyboard), `send-sides.ts` | replace the view with native radios; keep `send-sides.ts` |
| What anyone can see | `publish-facts.ts` (`publishFacts`, `payerKindOf`, `FACT_WORDS`), `PublishStrip.vue` | reuse the facts; add one sentence builder; the strip leaves the form |
| Fee: settings, payer, cost, nudges | `FeeSettingsCard.vue` (554 lines, 149 cases; also used by `windows/execute/OperationCard.vue`, `ChangeAuthwitsRegistryPopup.vue`, `RevokeAuthwitsPopup.vue`) | reuse whole, hosted in a sheet; Send-only words change |
| Fee cost words | `FeeCostReadout.vue` (also in `OperationCard.vue`), `feeDisplay` (`utils/fee-estimation.ts:118`), `QUEUED_*` copy in `publish-facts.ts` | reuse the copy constants; the line is new |
| A sheet on the popup stack | `Popup` (`closeOnEscape`, `initialFocus`, focus trap; content is `v-if="show"`), `PopupCard`, `PopupHeader`, the `send_review` key pattern | reuse |
| Disabled button names what is missing | `send.vue:579-584` (`submitLabel`, only "Estimating fee") | build new: a pure label function |
| Glossary terms | `utils/glossary.ts`: Fee Juice, Public Fee Juice, Private Fee Juice, Sponsored, FPC | reuse; no new term |
| Sending toast, Home's in-flight row | `useSendsInProgress.ts`, `RecentActivityView.vue`, `send-submit.ts` | reuse as-is (D2 is today's path) |
| Keyboard helpers | `isRepeatOrComposing`, `refuseRepeatEnter`, `isPopupSubmitKey` (`composables/usePopupEntity.ts`), `tests/helpers/send-event.ts`, `tests/helpers/send-popup-keyboard.ts` | reuse |
| Text link style for an edit control (arc 2) | `components/composite/PasskeyReuseLink.vue` `.link` | pattern only (hard-coded text) |

## Facts the plan rests on

- `send.vue` (1,060 lines) owns every input, the estimate, the gates and the submit; children are presentational over v-models. The fee card feeds the page six v-models (`modelValue`, `needsFeeJuice`, `payer`, `feeDisplay`, `queuedCapText`, `accountUnusable`) and must stay mounted while the page lives, since the estimate reads its settings.
- `Popup.vue` renders its content under `v-if="show"`: a card placed inside a closed sheet unmounts.
- `SendReviewSheet.vue` is also mounted by `RecentActivityView.vue:688` (the re-ask flow); `FeeCostReadout.vue` by `OperationCard.vue:391`; `FlaggedTokenBanner` by the token page and the execute window.
- `publishFacts` yields a warning (`requiresReview`, `you: "exposed"`) only for a private origin paid from public Fee Juice, in both arrivals (`publish-facts.test.ts`, "exactly two of them require review").
- Today a send not gated goes out from the footer ("Confirm Transaction"); a gated one opens the review, whose Send now arms after `REVIEW_ARM_MS` (800 ms) because "Review send" and "Send now" share a spot (`useSendReview.ts`).
- FX2's three phrases in Send's surfaces: `FeeSettingsCard.vue:208-210` (private nudge), `:233` ("Private FPC"), `:344` (`PRIVATE_GAS_UNCHECKED`), `send.vue:943`, `SendReviewSheet.vue:160`, `publish-facts.ts:58,65,70`. FJ1's outlier: `FeeSettingsCard.vue:212` ("You have no fee juice yet", "Get fee juice"), shown outside Send too (dApp windows, authwit popups).
- The Terms' lower-case phrase ('network fees ("gas" or fee juice)') is in `legal/`, outside this lane's code (FJ1: "at the next Terms patch").
- Send has no `DottedTerm` today; the glossary's fee keys are used as dotted terms only on Home's gas card.
- The popup also runs as a 240 px side panel (`firefox-sidebar.test.ts`, `toolbar-panel.test.ts`): 33 mono characters do not fit 192 px.

## Tests and selectors the redesign meets

- Unit: `pages/send.test.ts` (2,140 lines, ~101 cases; stubs `RecipientField`, `AmountCard`, `SelectTokenCard`, `FeeSettingsCard`; asserts "Select Asset", "Confirm Transaction", "Review send", the strip's attributes, `send-from-type` clicks), `pages/send.integration.test.ts` (1,198 lines, ~41 cases; real fee card; asserts the settled invariant `send-submit[data-action]` = review ⇔ strip `data-you` = exposed ⇔ the `send-fee-privacy-notice` tag).
- Smoke: `send-keyboard`, `send-fee-privacy`, `send-picker-add`, `legal-acceptance`, `home-links`, `token-list`, `type-roles` (Send with a recipient typed, a contact suggested, chosen, revealed; no review).
- Network: about twenty specs reach Send, most through `fixtures/transfers.ts` (`sendTransfer`, `enterSendForm`, `fillSendForm`, `setActiveSendType`, `selectFeeMethod`), `fixtures/send-page.ts` (`openSend`, `readSendView`, `submitSend`, `readReview`, `openReviewFromStrip`), `fixtures/send-burst.ts`; direct selectors in `fee-methods`, `fiat-send`, `send-amount-exact`, `send-amount-clamp`, `send-picker`, `same-token-concurrent-sends`, `snack-placement`, `store-captures`, `popup-escape-layered`, `send-chaos`, `failed-send-check`, `stale-network-a10-capture`, `legal-acceptance-wall`, `type-roles-windows` (the only sweep of the review sheet).
- `scripts/type-roles/exceptions.ts` names `AmountCard.vue`, `SendReviewSheet.vue`, `SendTypesCard.vue` (scope `[data-testid="send-from-type"] > [data-selected]`) and `PublishStrip.vue`.

## Open work and collisions

- No open issue matches the redesign (`gh issue list --state all --search` on send, recent recipients, side pairs, radio, fee juice, Max, redesign, Pay a person). #1658 (footer action below the fold) lists no Send screen as blocked. Closed known limits on Send read (`--label known-limit --search Send`): none is reopened by this plan.
- `token-icons-build-1` (planned; its arc 2 landed as `5736a920a`) changed `SelectTokenCard.vue` and `send.vue`; its arc 3 (Activity, the approval line) does not touch Send. Its owner ask A4 (a mark on `TokenCard` rows, the Send picker's included) stays open; this plan does not touch the picker rows.
- `p126-build-1` touches the execute window only; it mounts `FeeSettingsCard` and `FeeCostReadout`, which this plan changes only under Send's props.
