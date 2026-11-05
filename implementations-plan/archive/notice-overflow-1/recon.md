# notice-overflow-1: recon

Base `17f35c504` (`origin/dev`). One Explore agent (Sonnet) for the reuse sweep; the planner verified each claim used below against the tree and measured the layout in the real extension (Chrome, the armed smoke build, an uncommitted capture spec).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Wrap one unbroken string inside a box | `overflow-wrap: anywhere` is the repo's per-component rule for data-length text: `packages/design/src/ui/ToastManagerBase.vue:260` (the toast's text, the notice's nearest sibling), `TokenCard.vue:195` (its comment: `anywhere` keeps a cap from raising the column's minimum width), `DappIdentityBlock.vue:86`, `TransactionCardLayout.vue:302`, `detail-page.module.css:164`: 20 files in all. No global rule (`base.css`, `utilities.css`: none) and no `Text` prop for it (`noWrap` is the opposite). | reuse the rule as-is, local to `.card` |
| Pin a module-CSS declaration in a unit test | `apps/extension/scripts/type-roles/source-scan.ts`: `parseSource(file)`, `declarationsOf(parsed, selector)` (exact resolved selector, last rule wins). `NotificationManager.test.ts` already pins `.layer` this way and reads `.card`'s `background` as its non-empty-read control. Precedents for wrapping: `DappIdentityBlock.test.ts:42`, `TokenCard.test.ts:384`. | reuse as-is |
| Measure the real layout | No e2e or sweep measures the notice. `rows.test.ts` measures History rows; `OperationCard.long-strings.test.ts` pins rules and leaves layout to a window sweep. | no new e2e (plan D3); a scratch capture measures before/after for the PR |
| An e2e that opens the notice | `apps/extension/tests/e2e/import-errors-scroll.test.ts:264-278` ("onboarding: the page does not scroll, the warning already in view"): View Errors raises the notice and the test reads `notification-description` against `restoreNoticeText(["Local Network"])`. No e2e opens the create-failed notice. | reuse as the arc's smoke gate |
| Truncate a name with an ellipsis (option b) | None for names. Searched `export (const\|function) \w*(truncate\|shorten\|ellips\|formatAddress\|abbrev\|clip)\w*` over `apps/extension/src` and `packages`: only `truncateErrorMessage` (`wallet/services/account-state/normalize.ts:81`, error text). `restore-warning.ts` caps only the count of listed items (`MAX_LISTED`). | build new, only if (b) is picked |

## Facts the plan rests on

- The notice: `apps/extension/src/components/NotificationManager.vue`. `.card` (`:152-159`) is `width: 90%; max-width: 480px; padding: 24px` inside `.layer` (a fixed column flex, `align-items: center`). The description is `<Text id="notification-description" variant="body" … align="center">` (`:99`), a `span` that is a flex item of a column `Flex` with `align="center"`. `body` is 12 px (`packages/design/src/token-contract.ts:138`).
- Mounted in both shells: `popup/app.vue:621`, `onboarding/app.vue:84`.
- Callers: `onboarding/pages/import.vue:105-116` (title "Import completed with errors", `restoreNoticeText(unrestored)`, OK); `onboarding/pages/create.vue:145` and `popup/pages/profile/new.vue:77` (`createFailedNotice`, fixed copy, `utils/profile-flow-notices.ts`). So a data-derived string reaches the notice only in onboarding today; the popup's notice carries fixed copy.
- Network names: the add and rename fields cap at 25 (`NewNetworkPopup.vue:167`, `EditNetworkPopup.vue:120`). The wire params require `min(1)` (`network/spec.ts:212-219`); the row shape is `name: z.string()` with no maximum (`spec.ts:75`), and `NetworkSchema` (`:184`) adds none. A backup's network row therefore carries any length.
- `joinNames` (`restore-warning.ts:102-105`) also builds `stale-network/copy.ts:9` (quoted names) and the held-account list (quoted names), so a cut inside `joinNames` would reach texts outside the restore notice.
- `packages/design/src/ui/Button.vue:167` sets `white-space: nowrap`, so an inherited `overflow-wrap` does not reach a button label.

## Measured (Chrome, armed build at the base, uncommitted capture spec)

Card `scrollWidth` / `clientWidth`, a 90-character unbroken name (`aztec_devnet_eu_west_1_staging_node_for_internal_load_testing_with_the_real_prover_enabled`):

| Shell | Today | `overflow-wrap: break-word` | `overflow-wrap: anywhere` | (b) cut to 24 + `…` |
|---|---|---|---|---|
| Popup 360 × 600 (card 324) | 429 / 324, overflows 105 px each side | 429 / 324, overflows | 324 / 324 | 324 / 324 |
| Onboarding 1280 × 800 (card 480) | 507 / 480, overflows 27 px each side | 507 / 480, overflows | 480 / 480 | 480 / 480 |

- A 64-character name overflows the popup (352 / 324) and fits the onboarding card: the threshold is about 50 characters in the popup's 276 px of text and about 80 in onboarding's 432 px, by glyph.
- Ordinary text (`Local Network`) renders identically under `anywhere`: card height 171.6 px popup and 163.6 px onboarding, both with and without the rule.
- The two notices the wallet raises today (`createFailedNotice`, passkey with its note and password) render identically with and without `anywhere` (card, text and button heights) at popup widths 360, 300 and 240 and onboarding widths 1280 and 320.
- 25 `W`s, which the field accepts, fit the popup card only by running 13 px into its padding (they wrap under `anywhere`: card 188 → 205 px). A backup can carry far wider characters (U+FDFD is several em; the name field's sanitizer, `utils/string.ts:39`, drops it), so (b)'s 25-character cut does not bound the width.
- `break-word` fails because the centred flex item sizes to its min-content width, which `break-word` leaves at the whole word; `anywhere` lowers min-content too (CSS Text 3 § overflow-wrap).

## Open work and collisions

- `#1232` (this lane). Closed known limits searched: `gh issue list --state closed --label known-limit --search "overflow notice card"`: #898 (execute card label gap) and #640 (selection across an ellipsis), neither on this card.
- `#1231` (merged) added `max-width: 480px` to `.card`; this lane keeps it.
- Collisions: none. A new `describe` in `NotificationManager.test.ts` needs a name distinct from "the notice card has square corners" and "the notice is fixed to the viewport".
