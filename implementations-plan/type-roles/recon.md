# Type roles: recon

Base: `f5ca160` (origin/dev on 2026-10-08). Every path is repo-relative and every line is at that commit, unless a row says it reads the `settings-by-task` working tree.

Method: two recon passes (the design layer; the extension's surfaces), then three read-only scripts over the tree. One parses every CSS declaration in `<style>` blocks, `.css` and `.scss` files. One counts `<Text>` opening tags in templates, across line breaks. One compares the files `settings-by-task` touches against this base. Scope matches the guard: `apps/extension/src/**` and `packages/design/src/**`, minus the generated layer (`base.css`, `utilities.css`, `token-contract.ts`, `tokens.ts`, `internal/`), tests and stories.

Where this file disagrees with the typography audit on a count, the plan uses this file's count. Each disagreement is in § Counts with its basis.

## Reuse map

| Capability | Found | Verdict | Note or search trail |
|---|---|---|---|
| A typed token source | `packages/design/src/token-contract.ts:15-98` (`tokenGroups`, `fontSizes`, `fontWeights`, `lineHeights`) | adapt | Add `typeRoles` as a top-level export. A `tokenGroups` member would be emitted as CSS-variable names (`internal/render-tokens.ts:32-34`). |
| Tracking or case tokens | none | build new | `grep -n "letter\\|tracking\\|uppercase" packages/design/src/token-contract.ts`: no hit. They live inside each role record. |
| A generated utility stylesheet | `internal/render-css.ts:28-51`, written by `scripts/gen-tokens.ts:11-12` | adapt | `rule()` takes one declaration (`render-css.ts:24-26`). The `HEADER` text (`:20-22`) is pinned by `apps/extension/src/utils/copy-dash-ban.test.ts:226-230`, so it stays byte-identical. |
| Generated TypeScript names | `internal/render-tokens.ts:29-60` | adapt | Aliases are a hand-written list (`:46-57`); add `typeRoleNames` and `TypeRole`. The barrel re-exports it (`packages/design/src/index.ts:45`). |
| Drift tests for generated files | `utilities.drift.test.ts:14-17`, `tokens.drift.test.ts:11-13` | reuse as-is | They compare the files to a fresh render, so new output is pinned with no test edit. |
| Delivery to every shell | `base.css:10` imports `utilities.css`; `popup/index.ts:11`, `onboarding/index.ts:17`, `apps/landing/src/main.ts:1`, `apps/landing/src/legal.ts:1` import `base.css` | reuse as-is | Roles reach the popup, the windows, onboarding, Storybook and the landing with no new import. `base.css` stays byte-identical until arc 5 (`base.css.test.ts:21`). |
| A text primitive | `packages/design/src/core/Text.vue:1-90` | adapt | One `<span>`; classes at `:45-77`. `variant` is free: no `<Text>` passes it. `role` is not: `DappApprovalFooter.vue:39`, `ProfileNameField.vue:34` pass it as ARIA. |
| A source-scanning guard | `apps/extension/src/utils/copy-dash-ban.test.ts` | adapt (new file on its model) | Walk `:336-348`, SFC parse `:330`, skip list `:25`, stale check `:377-380`, tree-size check `:369`, self-tests `:382-398`. |
| A lint rule that bans a CSS property | none | not used | `biome.json` sets no CSS rule; Biome 2.5.13 is installed. Inference (moderate): no Biome rule takes a banned-property list. Biome CSS linting is out of scope anyway. |
| `composes … from global` | none | build new | `grep -rn "from global" apps/extension/src packages/design/src`: 0 hits. 189 `composes: x from "<path>"` lines show the chains it extends. Arc 1 proves it on `tab-hero.module.css`'s `.hero_title`, whose values do not change, before anything depends on it (plan P1 step 11). |
| A CSS parser for the guard | `postcss` (`apps/extension/package.json:104`); `sass` (`:106`); `@vue/compiler-sfc` (`:96`) | reuse as-is | One `.scss` file picks a face (`onboarding/onboarding.scss:23`); no `<style lang="scss">` in scope. `postcss` parses nested rules (`Input.vue:384-389`). |
| Role records outside the package | `packages/design/package.json:9` exports `./tokens`, not `token-contract.ts` | adapt | Render the records into `tokens.ts` so the guard, the contract test and the e2e sweep import them. |
| A CSS module exported by the package | none | not used | `packages/design/package.json:7-15` exports `./base.css` as its only stylesheet. |
| Hero fit and its ruler | `utils/hero-fit.ts`, `utils/hero-ruler.ts:14-20` | reuse as-is | Untouched. Each hero shares one class between number and ruler (§ Heroes). |
| An address renderer | `components/AddressDisplay.vue` (`size`, `weight`, `height` at `:26-37`, one `<Text>` at `:96-100`, no `lang="ts"`) | adapt | 32 call sites in 7 files. The same `<Text>` shows a contact or account name when one matches. |
| Typography stories | `apps/extension/src/design/Typography.stories.ts` (families, sizes, weights, line heights) | reuse as-is; add a sibling | It names `.fz--N` and `.fw--N` (`:60`, `:77`), so arc 5 rewords those labels. The role specimen is a new `TypeRoles.stories.ts` beside it. |
| Smoke e2e harness | `apps/extension/vitest.e2e.config.ts:11-12`; viewport `tests/e2e/fixtures/extension.ts:1151` | reuse as-is | The role spec is one new file in `tests/e2e/`. |
| Theme switch and navigation helpers | `tests/e2e/fixtures/helpers.ts:1502` (`setTheme`), `:1586` (`navigateByHash`), `:508` (`clickNavTab`), `:1046` (`seedUsdQuoteAndReload`) | reuse as-is | The throwaway board specs drive pages with these. |
| Screenshot capture | `tests/e2e/network/store-captures.test.ts:61` (360x600, scale 2); `tests/e2e/fixtures/send-page.ts:208-231` (`shotSend`) | adapt (throwaway) | `shotSend` flips the theme and shoots at once, which catches the transition halfway (`implementations-plan/follow-ups.md:23`). The board specs wait it out. |
| An inventory of identifier sites and surfaces | none | build new | Two generators in `apps/extension/scripts/type-roles/` (plan § Algorithms), on the extension's parsers and `PageContext`. |
| A role specimen and a computed-style e2e | none | build new | `grep -rln "fontFamily\\|fontSize\\|letterSpacing" apps/extension/tests/e2e`: only `network/send-amount-exact.test.ts` reads a font property (`:53-63,85-91`). |

## Counts

| Measure | Recon | Audit | Basis of the difference |
|---|---|---|---|
| `font-family` | 247 declarations in 110 files (234 extension, 13 design): `--font-headline` 117, `--font-mono` 112, `--font-body` 17, `inherit` 1 | 229 rules (104, 109, 16) | Recon parses every declaration, nested rules and `.scss` included. The audit counted rules by script; the 18 extra were not traced one by one. The guard counts declarations, so the plan uses 247. |
| `var(--font-*)` | 246 | not counted | |
| `letter-spacing` | 148 (138 extension, 10 design), 18 distinct values | 18 distinct values | Agrees. |
| `text-transform: uppercase` | 121 (111 extension, 10 design) | not counted | |
| Off-scale `font-size` | 23: 9px ×10, 8.5px ×3, 9.5px ×2, 11.5px ×3, 12.5px ×1, 48px ×3, 56px ×1 | 16: 9px ×9, 9.5px ×2, 8.5px ×2, 48px ×3 | The audit missed 11.5px, 12.5px, 56px, one 9px and one 8.5px. 8px is on the scale (`token-contract.ts:83`), so its three sites are under the floor, not off the scale. |
| `font: inherit` | 6, plus `base.css:257`: `PublishStrip.vue:47`, `popup/app.vue:522`, `RecentActivityView.vue:890`, `TokensView.vue:545`, `CallArguments.vue:169`, `OperationCard.vue:592` | not counted | Allowed, except on an element that carries a role. Two will: the boot retry (`app.vue`, rule `:518`) and the stalled-sync Retry (`RecentActivityView.vue`, rule `:885`). |
| Face-less `font-size`/`font-weight` rules (Inter by inheritance) | about 50 | not counted | An audit's count, not re-measured. Guard rule 8 brings them into the baseline. |
| Guard CSS findings | 539 declarations in 115 files | n/a | Union of face, tracking, case and off-scale size (the plan's rules 1, 2, 3 and 5); rule 8's face-less rules come on top. |
| `<Text>` tags | 430 (424 extension, 6 design); 393 set `size`, `weight` or `mono` (377 `size`, 212 `weight`, 16 `mono`); 358 have no `height`, so they get `line-height: 1` | 424 | Agrees on the extension. |
| `<Text mono>` | 16 tags in 11 files | 16 tags in 13 files | Recon reads tags across line breaks; 11 files hold them. |
| `AddressDisplay` call sites | 32 in 7 files | about 30 | |
| Address treatments | 12 | 11 | The audit's 11 omit `AddressInput` (`components/composite/general/AddressInput.vue`), which uses `Input`'s Inter 15/500 for typed addresses. Identifier sites beyond the treatments: 38 `trimAddress(` calls in `.vue` files, `SettingItem` descriptions and titles, color-only `<Text>` tags; the plan's § Identifiers lists each with its role path. |
| Day-one guard baseline | about 1,000 entries (539 CSS + 393 `<Text>` + the face-less rules) | n/a | Keyed by file, rule and normalized text, never by line. Script-string picks are carve-outs, not entries (§ Faces outside CSS). |
| Test files that stub `Text` | 91 | n/a | Only `RecipientCard.test.ts:7` and `RecipientField.test.ts:15` list its props by name. |

## Facts the plan cites

### Design package

- Family tokens: `token-contract.ts:67-71`. `fontSizes`: `:83` (8 to 40, 17 steps). `fontWeights`: `:86`. `lineHeights`: `:89-98`.
- Generator command: `bun run --cwd packages/design gen:tokens` (`packages/design/package.json:17`). Tests: `bun run --cwd packages/design test` (`:19`).
- `base.css`: family variables `:76-78`; `button` and `input` inherit the font `:249-261`; `body` sets a literal Inter stack `:263-271`; the type utilities `:364-403` (only `.mono` has users, through `Text mono`). Hash pin: `base.css.test.ts:21`.
- Fonts: JetBrains Mono ships a Latin subset only (`base.css:30-36`, fallback `monospace` at `:78`); Space Grotesk Latin and Latin-ext; Inter variable. Their SHA-bound notices claims: `packages/third-party-notices/src/policy.ts:275-321`.
- `Text`: `size` `:11-13`, `weight` `:14-16`, `height` default `"100"` `:18-21`, `mono` `:31-34`, `tabular` `:35-38`. Tests: default `lh--100` `Text.test.ts:18-20`; off-scale pin `:31-37`.
- `Button.vue`: `size` defaults to `medium` (`:12`; the extension's wrapper too, `components/ui/Button.vue:20`); sizes are compound rules `:184-232` (medium 13px at `:196`, 0.03em at `:199`; large 14px, 0.05em); `primary` `:235-242`; `primary_outline` `:254-262`; `secondary`, `ghost`, `text` set no face `:270-306`; CTA typography `:314-324` (14px at `:320`), which wins the (0,2,0) tie with every size rule by coming later; compact CTA `:326-331` (12px, (0,3,0)). Box: the CTA rule also sets `width: 100%` and `padding: 20px 0` (`:317,323`), the compact CTA `padding: 14px 0` (`:330`), and each size rule its own `padding` (medium `0 14px` at `:198`, large `0 16px` at `:190`); the CTA rule wins those ties by order, so a single-class rule carrying the CTA's padding would lose to `.wrapper.medium`. Callers by variant and size (a template scan, 2026-10-08): CTA at the default size 32, large 11 (all onboarding), compact 1 (`PasskeyCeremonyDialog.vue:94`); `primary` and `primary_outline` medium 28 call sites (`FormPopup`'s one serves 11 popups), large 16, small 1 (`DappCancelledOverlay.vue:20`); `ghost` medium 1 and `secondary` micro 1, both icon-only; `text` none.
- `SectionLabel.vue`: root and count markup `:19-24`; label rule `:27` (G 12/700, caps, 0.1); count rule `:40` (mono 10).
- jsdom 29.1.1 (the design package's test environment, `packages/design/vitest.config.ts`) ranks matching declarations by specificity and copies their values unresolved (`node_modules/jsdom/lib/jsdom/living/css/helpers/computed-style.js:117-125`): `var(--font-headline)` and `0.2em` come back as written, so unit tests can check declarations, not computed values.
- `Input.vue`: `label` prop `:42`; `leftText` `:45`; mini size rule `:384-389`; native input rule `:391-405` (Inter 15/500).
- The landing imports only `base.css` and uses no utility class (`grep -rn "fz--\|fw--\|lh--\|color--" apps/landing/src`: no hit). Its build reaches no network (`apps/landing/README.md:41`).

### Heroes

| Hero | Number | Ruler shares | Rule |
|---|---|---|---|
| Home balance | `BalanceView.vue:305-307`, testid `balance-amount`; the drawn figure is the `.hero_fit` child (`:309`, `:314`) | `:330`; the ruler's forms share `$style.hero_fit` (`:332`, `:338`) | `.balance_amount` `:403` (G 48/700, -0.04); `.hero_fit` `:418-421` sets `calc(1em * var(--hero-scale, 1))` and re-declares `letter-spacing: -0.04em`, so tracking computes at the fitted size; symbol `.balance_symbol` `:500` (0.5em) |
| Send amount entry | `AmountCard.vue:395`, `:407` | `field_type`, comment `:410-411` | `.field_type` `:506-511` (G `calc(40px * scale)`/700, -0.04); height strut `.field_line::after, .unit_pair::before` `:482-492` |
| Send review amount | `SendReviewSheet.vue:112`, testid `send-review-amount` | `:115-117` | `.amount` `:205-213` (G `calc(30px * scale)`/700, -0.02); `.amount small` `:231` |
| Holdings total (Ask F) | `popup/pages/holdings.vue:164` `.summary_amount` | none | G 26/700, -0.04 |
| Tx detail amount (Ask A) | `popup/pages/detail-page.module.css:11` `.amount_value` (24px at `:13`), composed by `tx/[id].vue:394`, `received/[id].vue:367` and `journal/[id].vue:333`; nothing else uses that stylesheet | none | mono 24/500 |

`network/send-amount-exact.test.ts` asserts the focused field at 40px (`:152`), and the review amount with no overflow and at 18px or more (`:161-162`).

### Faces outside CSS

| Site | What | Verdict |
|---|---|---|
| `onboarding/pages/presto.vue:165-166` | `--pb-font-body`, `--pb-font-display` into the `<presto-banner>` Shadow DOM | carve-out: a class cannot cross a shadow root |
| `popup/app.vue:394,396` | the DevTools anti-scam banner's `%c` styles | carve-out: console output, not UI |
| `components/JsonViewer/creator.js:244` | CodeMirror theme `fontFamily: "monospace"` | carve-out: a style object in the developer log viewer |
| `onboarding/onboarding.scss:18-23` | `body` font-family, duplicating `base.css:263` | delete in arc 3 |
| `components/JsonViewer/creator.js:114,117` | `textTransform: "capitalize"` | allowed (rule 3 bans `uppercase` only) |
| `popup/pages/settings/appearance.vue:193` | `style="text-transform: capitalize"` | allowed |

### Testids for the role spec

Existing: `balance-amount` (`BalanceView.vue:305`), `account-address-copy` (`Header.vue:295`), `token-symbol` (`TokenCard.vue:76`), `page-hero-title` (`popup/pages/activity.vue:181`, class composed from `tab-hero.module.css:45` at `activity.vue:234-235`; also `popup/pages/settings/index.vue:72`). Missing: the token amount span (`TokenCard.vue:97`) and Home's Holdings label (`TokensView.vue:369` has only `countTestid="tokens-count"`). `DappIdentityBlock` names its hostname only through `hostnameTestId`, which discover (`popup/windows/discover/index.vue:150`) and network unavailable (`popup/windows/network-unavailable/index.vue:126`) pass and capabilities (`popup/windows/capabilities/index.vue:383`) and execute (`popup/windows/execute/index.vue:609`) do not.

### Shells and windows

- Chrome's side panel loads the popup document (`manifest/manifest.config.ts:32-34`, at `apps/extension/`).
- Firefox's toolbar panel is a distinct layout environment (`tests/e2e/FIREFOX.md:41`); `openActionPopup` and `evaluateInActionPopup` (`tests/e2e/fixtures/browser/firefox-action-popup.ts:27,51`) reach it. Whether an image can be taken of it is unproven.
- Approval windows open only in the network suite. Smoke reaches `#/windows/passkey` (`passkey-toolbar-panel.test.ts:188`), `#/windows/logger` (`rows.test.ts:435`) and a seeded tx detail (`rows.test.ts:267-306`). Windows open at the size their caller passes to the window manager (`wallet/services/window-manager/window-manager.ts:206`).
- `AccountAvatar` sizes initials `Math.max(9, round(box × 0.4))` (`AccountAvatar.vue:15`); the hidden-accounts list's 20px box (`popup/pages/settings/accounts/index.vue:193`) gives 9px.
- `Input`'s `leftText` has no caller; only `packages/design/src/ui/Input.test.ts:99-100` and `Input.stories.ts:28,50` pass it.
- `tests/e2e/action-popup-layout.test.ts:37` reads the real Firefox panel's layout through `evaluateInActionPopup`; the type-roles panel case reuses that path.
- Surfaces, the seed of the surfaces generator: `scripts/pages-options.ts:8-17` routes five directories (`src/pages` as `common`, `src/setup/pages`, which does not exist, `src/popup/pages`, `src/popup/windows`, `src/onboarding/pages`), and `scripts/pages-options.test.ts:16-20` builds that tree with `PageContext`; `scripts/**/*.test.ts` runs in `bun run test` (`apps/extension/vitest.config.ts:39`). `popup/components/popups/PopupManager.vue:78-115` mounts 26 popups, each on a `popupStore.isOpened('<key>')`. `onboarding/pages/` has eight pages; `popup/windows/` eight routes. Home is `popup/pages/general.vue`; `index.vue` and `[...catch].vue` redirect to it. `popup/app.vue:464-472` mounts `PopupManager`, `ToastManager`, `NotificationManager`, `GlobalLoader`, `MigrationBarrier`, `AccountIntegrityBarrier` (`:470`) and `LegalAcceptanceSheet` outside `RouterView`, then `Header` (`:474`), the boot banner (`:476-487`) and `Navigation` (`:493`, on `showBottomNav`). The Header renders unless `appStore._isHomeScreenOpened` (register and the windows, `app.vue:422`), the route is `popup-auth` or its meta sets `hideHeader` (`Header.vue:268`; eight pages: `import`, `profile/new`, `settings/accounts/import`, `settings/security/{change-password,reset}`, `settings/security/export/{account,full,seed}`). Five files with type picks sat outside the arc globs (`FormPopup.vue:30`, the title of 11 popups; `ProcessingErrorNote`, `NotificationManager`, `EmojiGrid.vue:25`, `LogsToolbar`); the plan places them in arcs 3 and 4.
- For the generators' first review (2026-10-08, not added to the plan's tables): `src/pages/about.vue` is routed under `common` and no capture row lists it (a ten-line page with one `Go Back` button); no file opens `select_network`, the key `SelectNetworksPopup` mounts on (`PopupManager.vue:90`).
- Account verification failure: no e2e drives it (`grep -rn "integrity" apps/extension/tests/e2e` finds only comments and a password-change refusal). `AccountIntegrityBarrier.vue` reads every `nulo:core:account-integrity-blocked@<profile id>` row (`:33-50`; root `wallet/services/account-integrity/types.ts:4`; written by `blocked-repository.ts:26`), refreshes on `chrome.storage.onChanged` (`:52-55`), blocks every route but `popup-auth` and `popup-register` (`:17,22-30`), and renders `BarrierOverlay` (`:71`), whose type rules (`BarrierOverlay.vue:45-61`) `MigrationBarrier` shares. The background re-checks the record only on restore and unlock (`wallet/services/profile/service.ts:485,1297`).
- Occurrences and shared selectors (round 3): `OperationCard.vue:340` and `:346` render the same `<AddressDisplay :address="op.address" />` on the `register_contract` and `register_sender` branches (`:337,343`), with no testid; the card carries `data-op-kind` (`:320`). `execute-authwit-spender` is one testid on four sibling branches (`OperationActionRow.vue:25,39,47,51`: call, encoded call, intent, message hash); the encoded-call, intent and message-hash branches (`:37-52`) are unreachable: the one builder of an `add_public_authwit` is `grantPublicAuthwit` (`packages/wallet-bridge/src/dispatcher.ts:702`, action at `:720`, `kind: "call"` at `:722`; the comment at `OperationActionRow.vue:35-36` says so for the encoded call). The execute window opens only for dApp operations (`wallet/services/dapp-interaction/service.ts:486`), and no dApp method builds a `simulate_transaction` or another `send_transaction`, so the top `call`/`encoded_call` row (`OperationActionRow.vue:12-17`) looks unreachable there too (moderate; the wallet's own `send_transaction`s, `auth-registry/service.ts:287,340` and `operation-planner.ts:145`, are UI-origin). The From and To `AddressDisplay`s on the tx and received pages have no testid of their own (`tx/[id].vue:229,246`; `received/[id].vue:242,265`, inside `received-from-card`).
- Raw call fields (round 3): `CallArguments.vue:132-133`, bare `mono`, renders `row.short`, which `call-surface.ts:48-51` trims with `trimAddress(p.value, 10, 6)`. It exists only on an undecodable call (`:112`, `surface.kind === "raw"`; reasons `call-surface.ts:196-201`) after the toggle `${prefix}-raw-toggle` (`:121`) sets `rawOpen` (`:22`, `:129`). No e2e opens the toggle or produces an undecodable call (`grep -rn "raw-toggle\|unverified-args" apps/extension/tests/e2e` is empty). An existing path produces one without playground changes: `tx-sendTx-delegated-authwit.test.ts:67-111` deploys a Crowdfunding consumer (`deployDelegatedPullRig`, `tests/e2e/fixtures/aztec.ts:769-801`), fills `pg-input-consumerAddress` and the two instance textareas, and clicks `pg-btn-sendTx-delegated`; the playground registers an instance only when its textarea is filled (`apps/playground/src/sections/transactions.ts:163-171`) and builds `donate(amount)` locally (`aztec.js` `request()`), so with the consumer's left empty the wallet's lookup (`wallet/services/execution/service.ts:655-661`) finds no instance and the decoder returns `unknown-contract` (`call-decoder.ts:38`). Whether the window renders the card when the fee estimate then fails is unproven (moderate): that spec notes an aborted estimate leaves the popup without its fee content. Other bare `mono` tags: identifiers `RecipientCard.vue:68`, `settings/accounts/index.vue:99`, `OperationCard.vue:275,513`; not identifiers (reviewed in as `none`) `LegalConsent.vue:46`, `OnboardingExplainer.vue:31`, `onboarding/pages/welcome.vue:20`, `done.vue:72`, `TokenMetadataPopup.vue:144`.
- Rendering dependencies outside components and CSS (round 3): the build has four entries (`apps/extension/vite.config.ts:283-288`: offscreen, popup, setup, onboarding); windows are popup routes. `popup/index.ts:9,11-12` imports `app.vue`, `base.css`, `index.scss`; `onboarding/index.ts:15,17-18` imports `onboarding/app.vue`, `base.css`, `onboarding.scss`, and `onboarding/app.vue:94-97` draws the wordmark outside `RouterView`. `OperationCard.vue:39` imports `humanizeOperationKind` from the sibling `popup/windows/execute/humanize.ts:24` (not `src/utils/`), rendered at `:106,193,326`.
- Blocked-account seeding (round 3): the overlay's testid is `account-integrity-blocked` (`AccountIntegrityBarrier.vue:71`); it is off on `popup-auth` and `popup-register` (`:17,22`). A restore closes a blocked profile's session (`wallet/services/profile/service.ts:484-487`) and unlock re-verifies (`:1294-1297`). `ensureUnlocked` is `tests/e2e/fixtures/helpers.ts:142`.
- Conditional identifier states and the e2e that already reach them: the address-change import (`contacts-import.test.ts:155`), a hidden account (`accounts.test.ts`), the import-account preview (`account-import-export.test.ts`), the class-metadata op (`network/contracts-getClassMetadata.test.ts`), the incoming-trust prompt (`network/incoming-transfers.test.ts`), account-state rows (`network/authwit-lifecycle.test.ts`). None reaches the expanded debug panel (`TxDebugPanel.vue:19,39`, behind Developer or Debug mode, `tx/[id].vue:142-144`), `recipient-card-reveal`, an open discovered authwit (`OperationCard.vue:271`) or `execute-authwit-inner-hash`; `seedTransaction` (`tests/e2e/helpers/activity-seeds.ts:48-78`) writes no `block` and no `chunkNonce`. A tx hash links out only on the testnet chain with an explorer set (`wallet/constants/explorers.ts:36-59`).

### Floors

Mono 10px rules that stay mono, at 11px (Ask D, answered 2026-10-09), 21 in all: `packages/design/src/ui/SectionLabel.vue:40`, `components/PrestoStatusCard.vue:217`, `components/composite/IdentityStrip.vue:87`, `components/composite/activity/TransactionCardLayout.vue:249`, `components/composite/send/AmountCard.vue:547,553,583`, `onboarding/components/StepIndicator.vue:64`, `popup/components/modules/general/BalanceView.vue:517`, `popup/components/modules/general/GasBalanceCard.vue:244`, `popup/components/modules/general/TokenCard.vue:181,192`, `popup/components/modules/send/FeeCostReadout.vue:74`, `popup/components/modules/tx/TxDebugPanel.vue:127,145`, `popup/components/modules/tx/TxFeeRow.vue:113,172`, `popup/pages/detail-page.module.css:164`, `popup/pages/holdings.vue:172`, `popup/pages/settings/advanced/account-state/notes/index.vue:284`, `popup/windows/capabilities/AccountSelectRow.vue:199`. The other 17 mono 10px rules move to a Space Grotesk or Inter role, to `data` at 12px (the capability function list, `components/composite/capabilities/DetailsTable.vue:262`, takes the board's Hash / id / function row), or to the avatar carve-out (`ContactRow.vue:78`). Mono under 10px (Ask B, then Ask D): `TransactionCard.vue:194`, `TransactionCardLayout.vue:234`, `TransactionIncomingCard.vue:96`, `popup/pages/received/[id].vue:409`. Sub-floor size declarations by line: 8px `TransactionCard.vue:205`, `TransactionIncomingCard.vue:86`, `activity-card.module.css:15`; 8.5px `PublishStrip.vue:78`, `DetailsTable.vue:157,275`.

### Repo rules that bind the plan

- Root `test` runs the extension only (`package.json:16`); `test:all` runs every workspace (`:29`); `audit:vue` (`:37`); `audit:dup` (`:34`); `check:plans` (`:36`); `test:ci-gating` (`:31`).
- PR title budget: 93 characters (`CLAUDE.md:90`). UI sign-off rules: `CLAUDE.md:56-64`. Duplication baseline 4.84% (`CLAUDE.md:127`).
- `CLAUDE.md:231` and `packages/design/README.md:9-10` say `base.css` is generated; it is hand-authored (`scripts/gen-tokens.ts:11-12` writes only `tokens.ts` and `utilities.css`).
- A stack closes with a docs-only PR on top (`implementations-plan/README.md:52`); the plan follows it with arc 6 (plan ledger 15).
- `vue-tsc` skips SFCs without `lang="ts"` (`implementations-plan/lessons.md:16`).
- After a squash merge, rebase the rest of the stack; never merge dev into an old arc head (`implementations-plan/lessons.md:28`).
- `implementations-plan/lessons.md` is 8,001 of its 8,192 bytes.

## Settings overlap

`settings-by-task` lands first. Its working tree on 2026-10-08, compared with this base:

| File at base | In `settings-by-task` | Type sites at base |
|---|---|---|
| `components/ui/Settings/SettingItem.vue` | changed; adds a trailing value `<Text data-testid="setting-value" size="12" weight="500">` | title `<Text>` `:132` (Inter 14/500 by inheritance); description `<Text>` `:135`, with a `#description` slot `:136`; `.title` `:254-259` (its `letter-spacing: 0.01em` at `:259` is already at the base); `.description` `:271-275` |
| `components/ui/Settings/ItemsContainer.vue` | changed | group label `:45` (G 10/700, caps, 0.2); description `:54` (I 12) |
| `components/Header.vue` | changed | `.account_label` `:372`; `.account_address` `:407`; `.network_label` `:482`; `.lock_label` `:520` |
| `popup/pages/settings/index.vue` | changed | `.footer_link` `:233` |
| `popup/pages/settings/profile/index.vue` | changed | `.id_value` `:67` |
| `popup/pages/settings/security/change-password.vue` | changed | `:243`, `:256` |
| `popup/pages/settings/security/reset.vue` | changed | `:195` |
| `popup/pages/settings/security/export/index.vue` | changed | status title and subtitle |
| `popup/pages/settings/advanced/account-state/index.vue` | changed | record card picks |
| `popup/pages/settings/appearance.vue` | renamed to `display.vue` | dust input `:316`, `:322` (mono 13); `<Text>` 13/600 `:177`, `:193`, `:224`, `:238` |
| `popup/pages/settings/security/index.vue` | renamed to `lock.vue` | `<Text>` `:155`, `:172` |
| `popup/pages/settings/advanced/index.vue` | renamed to `developer/index.vue` | `<Text>` `:172`, `:191`, `:210`, `:220`, `:227` |
| none | new `popup/pages/settings/privacy.vue` | five type picks in the working tree |
| `components/ui/Settings/settings-row.module.css` | unchanged | `.row_name` `:55` (I 14/600, 0.01); `.row_sub` `:68` (mono 11) |
| `popup/pages/settings/glossary.vue`, `popup/pages/tab-hero.module.css`, `components/ui/Settings/SettingField.vue` | unchanged | glossary `:74`, `:81`; tab hero `:21`, `:45` |

The spec said `settings-row.module.css` is rewritten; it is not, as of 2026-10-08. P1 step 2 re-audits every row above against the merged code.

Re-audit at `f557e20` (#56 merged, 2026-10-09; P1 step 2). Every type pick above survives with the same values; only lines moved.

- `SettingItem.vue`: title `<Text size="14" weight="500">` `:134` (Inter by inheritance), description `<Text size="12" weight="500">` `:137` with its slot, trailing value `<Text data-testid="setting-value" size="12" weight="500" color="secondary">` `:144`; `.title` keeps `letter-spacing: 0.01em` (`:276`). The new `.icon_slotted` and `.value` rules set no type.
- `ItemsContainer.vue`: group label `.title` G 10/700 caps 0.2 (`:54-61`), description `.description` I 12 (`:63-68`). The new `danger` prop is the danger fence: `.wrapper_danger` colours the border only (`:50-52`); the "Delete profile" row inside it is an ordinary `SettingItem`, its icon in a type-free `.danger_icon` (`settings/index.vue:337-342`).
- `settings/index.vue`: the profile card is the hub's first row, a `size="large"` `SettingItem` titled with the profile's name and described by its kind (`:130-140`, testid `setting-nav-profile`); `size` changes padding only (`SettingItem.vue:185-187`). The old `.footer_link` is gone; the hub picks no type of its own beyond the composed `tab-hero.module.css` classes.
- `Header.vue`: `.account_label` `:324-340`, `.account_address` `:359-369`, `.network_label` `:434-443`, `.lock_label` `:472-477`, values unchanged.
- `profile/index.vue`: ID `<Text size="12" weight="500">` `:33` with `.id_value` mono (`:61-64`); keys `<Text size="12" weight="600">` `:32,38`; type `<Text size="13" weight="600">` `:39`. Its "Name" row is a `SettingField` (`:23-29`).
- `lock.vue`, `display.vue`, `developer/index.vue`, `privacy.vue`: toggle-row titles `<Text size="13" weight="600">` and descriptions `<Text size="12" weight="500">`; `display.vue`'s dust input mono 13 (`:325`, `:335`). `privacy.vue` holds five `<Text>` tags: two titles, two descriptions and a 13/600 option label (`:125`).
- `security/change-password.vue` `:244-248` and `reset.vue` `:196-200` (G 11 caps 0.18), `security/export/index.vue`, `advanced/account-state/index.vue`: only their `backTo` changed. `settings-row.module.css`, `glossary.vue`, `tab-hero.module.css` and `SettingField.vue` are unchanged.

## Arcs and blast radius

Guard findings per arc (CSS declarations; `<Text>` tags that set `size`, `weight` or `mono`):

| Arc | Scope | CSS findings | `<Text>` tags | Main risk | Tests that must stay green |
|---|---|---|---|---|---|
| 1 | contract, renderer, `Text`, guard, inventory generators, story, e2e probe | 0 removed | 0 removed | a role rule reaching the landing; drift tests | `utilities.drift.test.ts`, `tokens.drift.test.ts`, `base.css.test.ts`, `copy-dash-ban.test.ts`, `Text.test.ts` |
| 2 | `packages/design/src/ui/*`, `components/ui/**`, the shared `*.module.css` except `detail-page.module.css`, the callers of `SettingItem`'s new props, `AddressDisplay` and its 32 calls, `AddressInput`, `RecipientField`, the four address `Input`s of New token, New FPC, Edit FPC and New sender, Network's chain ID description, `AccountAvatar` | 98 in 20 files at the draft's split, less `detail-page.module.css` | 12 | every screen shifts at once; `Button` and `Input` specificity ties | design `ui/*.test.ts`, `Settings.test.ts`, `RecipientField.test.ts`, `DetailsTable.test.ts:58,120,144` (reads `STYLE.address`), full smoke both browsers, network `cap-window`, `connect-dapp`, `authwit-variants`, `window-placement`, `send-amount-exact` and the new window sweep, both browsers |
| 3 | Header, navigation, Home, Holdings, Activity, tx/received/journal with all of `detail-page.module.css`, Send, Receive, wallet popups with `FormPopup` and `ProcessingErrorNote`, onboarding, unlock, register, legal, passkey, overlays with `NotificationManager`, the boot retry | 331 in 70 files, plus `detail-page.module.css` | 149 in 45 files | hero fit with tabular figures; activity row overflow | `send-amount-exact`, `tx-transfer-row`, `transfers`, `holdings`, `rows.test.ts:452-478`, `fiat-display.test.ts:19`, smoke both browsers |
| 4 | Settings pages and modules, approval windows, capabilities, dApp identity, scope components, `EmojiGrid`, `LogsToolbar` | 110 in 25 files | 232 in 35 files | approval window height; Settings rebase drift | `cap-window`, `connect-dapp`, `authwit-variants`, `window-placement`, `OperationCard*.test.ts`, smoke both browsers |
| 5 | leftovers, dead utilities, `Text` props, `.fz--`/`.fw--` | 0 left | 0 left | a stray `size` on `<Text>` falling through as an attribute | `base.css.test.ts` (new hash), `Text.test.ts`, `test:all`, network `type-roles-windows` and `send-amount-exact`, both browsers |
| 6 | the close-out: archive move, `lessons.md`, `follow-ups.md`, the indexes | none | none | a link broken by the extra directory level | `check:plans` |

CI runs quality, smoke and network for any change under `packages/design/src/**` (`.github/workflows/pr-quick.yml:94,113`, `pr-extension-smoke-e2e.yml:58`, `pr-extension-network-e2e.yml:64`), so every arc pays the full PR lanes.

## Commands

- Design unit tests: `bun run --cwd packages/design test`. Guard alone: `cd apps/extension && bun --bun vitest run src/utils/type-role-ban.test.ts`.
- Smoke builds: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 bun run build:chrome`, or the same flags with `bun run --cwd apps/extension build:firefox`. Run: `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e`, with `NULO_E2E_BROWSER=firefox` for Firefox.
- Network: `NULO_E2E_PROVERLESS=1 bun run e2e:agent <files>`, with `NULO_E2E_BROWSER=firefox` for Firefox.
- Landing: `bun run --cwd apps/landing build`, then compare the normalized declarations of every rule in `apps/landing/dist/assets/*.css` with the previous build's.
