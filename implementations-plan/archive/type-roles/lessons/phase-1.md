# Phase 1: the role layer

Arc 1 of the type-roles stack. Every meaningful attempt, failure and decision, in order.

## Log

- **Plan committed** (`docs(plans): add the type-roles plan`), `check:plans` 0 findings.
- **Board checked against the plan.** The "Nulo Type Roles" board's rulebook table has 34 rows with columns Today, Chosen, A, B, C. Every A cell matches the role the plan gives that row, except the three stated deviations: `meta`'s rows (Hash, small; Token symbol; Meta / count / hint) are drawn at 10px (Ask D: 11px), "Amount, detail" takes B's G 24/700 -0.02 tabular (Ask A), and the "Hero amount" A cell (M site/500 -0.02) is `amount-total` while `amount-hero` carries B's cell. "Avatar initial" (I 13/600) takes no role. The contract test's literal table is transcribed from the A column.
- **Steps 3 to 6** before #56 landed: contract, the multi-declaration `rule()` helper, the `.type--*` block after `.lh--`, the records and names in `tokens.ts`. `renderStringList` breaks `typeRoleNames` one per line because the one-line form exceeds Biome's 140-column width, as Biome would.
- **#56 landed** at `f557e20` while step 6 was being committed; step 1's check succeeded and the branch rebased onto it cleanly.
- **Step 2, Settings re-audit at `f557e20`.** Every type pick of `recon.md` § Settings overlap survived with its values; only lines moved (recon now records the merged lines). The trailing `setting-value` is I 12/500 secondary as the plan assumed; the danger fence (`ItemsContainer`'s `danger`) colours a border and picks no type; the profile card is the hub's large first `SettingItem`, titled with the profile name, so arc 2's `titleVariant="name"` list already covers it; the hub's `.footer_link` is gone. The board's one Section label still overrides the two label levels (ledger 26): `ItemsContainer`'s group label stays G 10/700 caps 0.2 until arc 2 gives it `label-section`. Plan rows updated: the Settings table header, the row-title row (profile card), the trailing-value row.
- **Step 15, `innerText` reads in `tests/e2e`** (CSS `text-transform` changes `innerText`, never `textContent`). Twelve reads; nine only build a failure message (`backup-roundtrip.test.ts:182`, `contacts.test.ts:48`, `passkey-toolbar-panel.test.ts:51,143`, `helpers/crash-truth.ts:102`, `helpers/account-io.ts:53,148`, `fixtures/helpers.ts:576`, `network/selfpay-phase.test.ts:264`). Three assert on text:
  - `network/transfers.test.ts:197-198` (`not.toContain("No available tokens")`): the Select token empty label is caps today and stays caps under `title-page`, so the assertion passes vacuously. Arc 3 switches it to `textContent` (P3 step 8).
  - `network/receive-unregistered.test.ts:43` (`includes("Something went wrong")`): the text is `AsyncListStatus`'s `Banner` description, which arc 2 gives `body` (no caps), so its case does not change; no switch needed. Arc 2 re-checks it if the Banner's description role changes.
  - `network/backup-import-stalled-network.test.ts:85` (parses the data viewer's JSON): the JSON renders in the JsonViewer's CodeMirror, a carve-out no role reaches.
- **Step 11, the composition proof.** `tab-hero.module.css` `.hero_title` now opens with `composes: type--title-hero from global;` and keeps `font-size: 48px`. Biome accepts the global form; the Chrome build exports History's key as `_hero_title_… _hero_title_… type--title-hero`, so `from global` resolves to the bare class through the cross-file chain (`activity.vue` composes the tab-hero rule). Storybook builds. The smoke spec reads History's `page-hero-title` as Space Grotesk, 48px, 700, uppercase, -1.92px on both browsers.
- **The sweep fixture and smoke spec** (`tests/e2e/fixtures/type-roles.ts`, `tests/e2e/type-roles.test.ts`): Chrome 4 passed, 1 skipped (the Firefox-only panel case), 18 s; Firefox 5 passed, 46 s; retry 0. Findings against the plan:
  - Inference 5 (Firefox's coarser `letterSpacing` rounding) did not show: both browsers report the exact em × size in px for every probe. The 0.1px tolerance stays; tracking 0 must read `normal` or `0px` exactly.
  - Sweep step 1 as written (each of the three families has a loaded face on every page) cannot hold: a family no element on the page uses is never requested and stays `unloaded`. The sweep requires `loaded` only for the families of the roles on the page, and fails any face in `error` or a family with no `@font-face`; the smoke spec, whose probes use all three, still requires all three.
  - A site-sized role leaves the size to the element; with no size of its own the probe inherits 12px in Chrome and 16px in Firefox (Chrome's extension pages default smaller). Harmless for the probes; every real site-sized element sets its own size.
  - `AddressDisplay` exposes no "showing a name" state, so the fixture treats an `AddressDisplay` site whose text holds no `0x` + two hex digits as showing a name (`name`). Arc 2, which rewrites `AddressDisplay`, can expose the state as a data attribute for the fixture to read instead.
  - Firefox panel geometry, Home and Settings, steady from 0 to 1.2 s: viewport 360×600, `#app` 600, bottom nav ends at 600; no role-bearing text clipped.
- **Landing at the base and at this head.** Built with `origin/dev`'s `utilities.css` swapped in (the only landing input arc 1 changes), then restored and built again: the normalized declarations differ only by the added role rules, all 28 present (the minifier merges `.type--time` and `.type--meta`, whose six declarations are identical).

## Step 10: the baseline's roles

- **Counts.** Day one's baseline holds 1,578 entries in 170 files: face 244, tracking 146, case 119, size 60, text-prop 622, face-less 362, identifier 25; no tie and no site-size finding. Rule 8 alone finds 362 face-less sizes and weights, not the draft's about 50. The role tally per entry is in `apps/extension/src/utils/type-role-ban.reviewed.json`.
- **Rows added.** 132 rows marked † in § Surfaces: Shared 3; Home, Holdings, Activity 8 (the Activity empty state among them); Transaction detail 10; Send 11; Receive and the other popups 11; Settings 43; Approval windows 25 (the warned identity strip among them); Onboarding and overlays 21. Two proposed rows merged, both naming `capability-shared.module.css`'s `.mono`; the profile page's type value went into the existing "Account state, notes, profile ID" row. Sixteen existing § Surfaces rows were corrected against the code (Before values, one split into four, line drift), and § Identifiers, § Captures and the change map now agree with the two generators' expected files.
- **Line drift from the testid commit.** The identifier testids added lines to `received/[id].vue` (+3), `tx/[id].vue` (+3) and one each to `TxDebugPanel.vue`, `CallArguments.vue`, `EditFpcPopup.vue`, `settings/connected-apps/[id].vue`, `settings/networks/[id].vue`, `capabilities/index.vue` and `execute/index.vue`; the added rows cite the lines after it. `handleGrantPublicAuthwit` spans `dispatcher.ts:638-681`; the warned identity strip network is M 10/700 today, not 11.

Picks the boards should look at, most visible first (pick → alternative):

1. `DropdownItem.vue:20-43` `row-title` moves nine menus from I 13/500 to G 13/700 → `value` I 12/600 or `body`.
2. The legal sheet title `title-page`, 18 → 13px (`LegalAcceptanceSheet.vue:100`) → `title-hero` at 18px, as the declined page's identical title took (`declined.vue:38`).
3. Onboarding sentences `body`, 14 and 15 → 12px (`OnboardingExplainer.vue:24`, `welcome.vue:17`, `done.vue:69`, `presto.vue:76`) → today's sizes only through `OVERRIDES` and the owner.
4. The passkey window body `body`, 15 → 12px (`PasskeyScreen.vue:227`) → 15px as an `OVERRIDES` entry, the owner's call.
5. Execute group labels `label`, a full sentence in caps (`OperationCard.vue:239`) → `label-section` G 11, or `body` for that sentence.
6. Confirm's toggle label `row-title` G 13/700 (`ConfirmPopup.vue:108`) → `label` G 10 caps, the rulebook's toggle label.
7. The verification toggle, "Skip this check next time": `label` in Settings (`DappSessionVerification.vue:29`), `row-title` in the verify window (`verify/index.vue:212`) → one role for both.
8. "Override with my method", "Use app's payment" `label`, now caps (`FeeSettingsCard.vue:872,905`) → `value` I 12/600, sentence case.
9. The notification title `title-page`, 16 → 13px caps (`NotificationManager.vue:56`) → `row-title` G 16/700.
10. Delete profile's checkbox labels `body`, 14/600 → 12/400 (`settings/security/reset.vue:135,138,141`) → `row-title` G 14/700.
11. The connected app's URL `data-lead` M 13/600 (`settings/connected-apps/[id].vue:249`) → `data` M 12/500, since the name leads.
12. The glossary term `row-title` G 14/700 (`settings/glossary.vue:24`) → `name`, today's I 14/600.
13. "Hidden accounts" and its count in caps and mono (`settings/accounts/index.vue:176,178`) → `row-title` 13 and `value`, sentence case.
14. The Activity origin chip `tag`, a hostname in caps (`TransactionCard.vue:163`), while the windows set hostnames in `data-lead` mono.
15. Received "Private" and "Mint" `name` I 13/600 (`received/[id].vue:253-255`) → `data-lead`, the To card's face.
16. The detail amount's symbol inherits `amount-detail` G 24/700 tabular (`detail-page.module.css:7-9`) → `meta`, as the review sheet's symbols.
17. The cancelled overlay's message `value` I 12/600 (`DappCancelledOverlay.vue:19`) → `body`, since its messages are sentences.
18. Raw error dumps stay mono in `meta` (`TxDebugPanel.vue:161-170`, `journal/[id].vue:371-381`) → `body`, which needs a hex-scan exemption.
19. Row error lines `caption` I 11 (`TokenCard.vue:231-235`, `TokenSeedRow.vue`, `TokenImportRow.vue`) → `body` I 12, the rulebook's errors.
20. 11px sentences split: `body` 12 (`settings/about.vue:147`, `settings/networks/[id].vue:255`, `IncomingTrustPopup.vue:187`) but `caption` 11 for 11/500 notes (`send.vue:743`, `FeeSettingsCard.vue:937`) → one rule.
21. The import error title with a detail line `body` (`ImportFullBackupForm.vue:82`) → `value` I 12/600, a banner title.
22. The sponsored readout's "Nothing" loses its 600 under `data` (`FeeCostReadout.vue:39`) → `value` I 12/600, in Inter beside mono.
23. The warned identity strip network keeps 700 through a new compound override (`IdentityStrip.vue:98-101`) → drop it, orange at 400.
24. The logger's menu items `body` (`LogsToolbar.vue:87-121`) while "Clear logs" (`:127`) reads `DropdownItem`'s `row-title` → one role for the menu.
25. The profile's name value `name` I 13/600 (`SettingField.vue:26-27`) beside its type value `value` I 12/600 (`settings/profile/index.vue:39`) → `value` for both.
26. Explainer card titles `row-title` G 16/700 (`OnboardingExplainer.vue:32`) → `title-page`.
27. The scope contact annotation `name` I 600 (`ScopeAddress.vue:68`) → `meta`, quieter beside the address.
28. The execute amount's symbol `meta` M 11 beside a `data` amount at 12 (`CallArguments.vue:66`) → `data`.
29. The migration banner's ✕ `body` 12 (`MigrationBarrier.vue:146`) → `caption`, today's 11.
30. "Invalid address" beside the Recipient label `body` (`RecipientField.vue:88`) → `label`, the label's line.

Picks changed by the lead:

- The explainer and consent ordinals (`OnboardingExplainer.vue:31`, `LegalConsent.vue:46`): `body` → `meta` M 11/400, as the step numbers.
- The Terms eyebrows (`LegalAcceptanceSheet.vue:99`, `declined.vue:35`): `body` → `label-section` G 11/700 caps 0.1, the popups' pre-titles.
- `ContactRow`'s initials' face → `drop`: arc 4 drops the mono face; their size and weight stay carve-outs.

## Step 13: the generators' first review

- **Review cleared, 53 items.** Accepted the generator's splits of two selectors § Identifiers shared (`activity-row-hash` / `activity-incoming-hash`; `import-contact-address-saved` / `-incoming`), its `none` calls (Terms versions, the consent hint, a hidden accessible name), Edit FPC's title and the decoded non-address value as new sites, the 29 routed non-page modules and `common-about` as no surface, and the change-map arcs over § Captures' (the tables now follow). `journal-recipient` was never needed: the element carries `journal-detail-recipient`.
- **A gap the first run hid.** `AuthwitCard` renders `caller`, `contract`, `to` and `consumer` as plain members, outside the pattern list, so the one live branch (a granted call) had no site. Adding the four names finds exactly AuthwitCard's five and nothing else; three are pinned unreachable beside the two the first run found. A note's `entry.value` stays a hand entry.
- **Two row testids wrapped their label.** `execute-op-transfer-sender` and `execute-op-decoded-param` sit on rows that also hold "From:" or the parameter name, so the sweep would judge the label once labels carry roles; the values take `-address` / `-value` testids of their own. Edit FPC's bare `setting-title` matched the FPC rows under the popup: scoped to `edit-fpc-header-row`.

## Rebase onto dev after #55, #58 and #75

- `origin/dev` moved while step 16 waited: #55 added a `destructive` `Button` variant (`primary`'s type on red, one rule with it, so it takes `button-md` with `primary`), #58 rewrote the verify window's copy and buttons and added its refusal error, #75 closed security-ui-1 (the one index conflict). The guard found the change exactly: one stale entry (the old "OK" label's `size`) and one new pick (the refusal error's `size="12"`, `body`); the inventories did not move. The before set is shot from the rebased head.

## Codex implementation round 1

- Verdict reject, eight findings (plan § Audit verdicts, R1), all adopted. The ones worth remembering: an `unreachable` claim must consider every path that writes the value, restore included, not only the live producer (C1); a reader that descends to "the first role-bearing element" reads a label as soon as roles land, so selectors name the value element and a test holds them to it (C2); a property a component exposes (`data-address-shows`, `data-input-size`) beats inferring its state from text or testids (C3, C4); module class names are hashed at runtime, so a source selector cannot scope a runtime exception (C4).
- The dry-run Chrome shots (15:15 to 15:31, 405 files, 8 unreached) were taken with the old reader; the before set is reshot at the fixed head.

## Codex implementation round 2

- Verdict reject, three findings (plan § Audit verdicts, R2), all adopted. A "testid no ancestor carries" is not proof that it sits inside the site's component: a slot's content renders inside the component's wrapper, so the check now reads the component's own template (C10). When a selector moves to a child, the role's composition target moves with it, or the sweep's own-class check fails a correct inheritance (C11).

## Codex implementation round 3

- Verdict reject, one finding (C12, plan § Audit verdicts, R3), adopted after the round: proving a testid exists in a component is not proving it renders the site's value, so the check now ties it to the bound prop. Three rounds, so the loop stops here; C12's fix had no codex pass of its own and goes to the final cross-arc pass.

## Rebase onto dev after #76

- #76 (accessibility-1 arc 2) landed while codex round 2 ran: Home's two view links became `RouterLink`s, a focus ring on the back arrow and the method tab, `--nulo-track` and three `--txt-*` status tokens. Only the index line conflicted; the regenerated `tokens.ts` merged cleanly, and the guard, the inventories and the design tests found no new type pick, colour and focus being outside the roles. The before set is shot from this rebased head, so its Home carries #76's links.

## Step 16: the before set

- Shot at `3ba2d1f`, now `ceaa36f` after a message-only reword lower in the branch (same tree, `c401b0a`), dark only after the owner's cut (ledger 34): smoke Chrome 107 shots in 381 s, smoke Firefox 5 in 38 s, network Chrome 25 in 270 s, network Firefox 2 in 193 s, each a png and a json of the sweep's record mode; published as https://claude.ai/artifact/We9yw2nuj33e9rkzhMRyyM. Chrome's side panel measured 360x665 (headed, window 1280x800); Firefox's toolbar panel 360x600. S29's raw field reads `0x00000000..000064 = 100` in JetBrains Mono 11/400 on Chrome, reached on both browsers once the dApp holds the contracts grant.
- The dry run's eight unreached surfaces were all spec faults: `popup-profile-new` carries `?from=`; a light-pass Terms shot left the next onboarding pass at the Terms gate; GlobalLoader needs `chrome.runtime.connect` to throw; the boot Banner needs the boot's own profile lookup to time out while the route guard's read still answers, since a port that answers nothing never readies the router. Neither overlay can be forced on Firefox, where the preload never reaches moz-extension pages.
- The plan claimed ten execute-window operation cards reachable; the network run showed no dApp method opens a window for them (the dispatcher hands only four operation kinds to the interaction service). They are attested unreachable under the `execute_window` producer set. Lesson: an inventory state is a claim about a producer, and only a run that reaches it, or a producer search, proves it.
- The shot spec credited the simulate branch's `call.to` from the send state, because both branches share `execute-op-call-to`; coverage counts the expected file's live sites, so that credit does not count.

## The before cells against the before set

- Six readers checked every row of § UI impact's tables, 237 in all, against the recorded JSON (`records` per surface, `sites` per identifier selector). 122 agree, 20 cells were corrected, 93 hold an element no shot reached (an error or empty state, a mini size, a confirm toggle: they stay as the code reads), and the four cells that describe the five sites the set never observed say so. The corrections, as recorded:
  - `SectionLabel`: `G 12/700 caps 0.1; count M 10 in the label's caps and tracking` → `G 12/700 caps 0.1; count M 10/700 in the label's caps and tracking`.
  - Home balance (`.balance_amount`, the fitted `.hero_fit` and its symbol: `G 48/700 -0.04, fitted; symbol 0.5em` → `G 48/700 -0.04, fitted; symbol 0.5em -0.08 (the fit's px tracking inherited)`.
  - Recipient field text: `M 14/400` → `M 14/500`.
  - Publish strip: `cells M 8.5 caps 0.05; name G 8.5/700 caps 0.1` → `cells M 8.5/500 caps 0.05; name G 8.5/700 caps 0.1`.
  - Review sheet: `title G 12/700 caps 0.2; amount G 30/700 -0.02 at the fit's scale; symbol M 11; recipient M 11; rows head G 9 caps 0.12; row top I 11.5/600; row word M 9.5 caps 0.06; row note I 11/500; fee M 11` → `title G 12/700 caps 0.2; amount G 30/700 -0.02 at the fit's scale; symbol M 11; recipient M 11; rows head G 9 caps 0.12; row top I 11.5/600; row word M 9.5/500 caps 0.06; row note I 11/500; fee M 11`.
  - Accounts popup rows: `name I 14/500 (inherited, `SettingItem.vue:134`)` → `name I 14/500 0.01 (inherited, `SettingItem.vue:134`)`.
  - Accounts list; export account list; connected app accounts: `names I 14/500` → `names I 14/500 0.01`.
  - FPC rows: `title I 14/500 (the FPC's name, or its address when it has none)` → `title I 14/500 0.01 (the FPC's name, or its address when it has none)`.
  - Glossary: `"where" M 9.5 caps` → `"where" M 9.5 caps 0.06`.
  - Operation values; amounts; addresses; account in parentheses; function: `I 11 to 12 (`AddressDisplay`)` → `I 11/500 to 12/500 (`AddressDisplay`) (the discovered authwit's consumer, caller and hash not observed in the before set)`.
  - Capabilities: `table sub G 10 caps; address M 11; function M 10 (`DetailsTable.vue:267` only; `capability-shared.module.css`'s `.mono` renders only in Settings); tag M 10/600 0.08` → `table sub G 10 caps 0.1; address M 11; function M 10 (`DetailsTable.vue:267` only; `capability-shared.module.css`'s `.mono` renders only in Settings); tag M 10/600 caps 0.08`.
  - Header address (`Header.vue:249-252`, the copy button's rule `.account: `G 14/700` → `G 14/700 -0.02`.
  - Every other `AddressDisplay` call (26 in `OperationActionRow.vue`, `Op: `I 11 to 12` → `I 11/500 to 12/500 (`OperationActionRow`'s call target and the discovered authwit's consumer and caller not observed in the before set)`.
  - FPC row title when the FPC has no name (`FpcRow.vue:33`): `I 14/500` → `I 14/500 0.01`.
  - Edit FPC's header row, titled like `FpcRow` with the FPC's name or, wi: `I 14/500` → `I 14/500 0.01`.
  - Contact suggestion address (`RecipientField.vue:123-124`); imported co: ``<Text>` I 12/500, I 13/600, `mono` 12, `mono` 11` → ``<Text>` I 12/500, I 13/600, `mono` 12/500, `mono` 11/500`.
  - Rows and tables: contacts (`ContactRow.vue:33`), account select (`Acco: `M 11 to 12, I` → `M 11 to 12; profile ID M 12/500`.
  - Aux ids: block hashes (`tx/[id].vue:318`, `received/[id].vue:325`), ch: `M 10` → `M 10; notes contract M 10/600 0.02`.
  - Typed addresses: `AddressInput` (the recipient field, the contact form: `I 15/500; the recipient M 14/400` → `I 15/500; the recipient M 14/500`.
  - dApp hostname (`DappIdentityBlock.vue:38`, rule `:83`): `G 14/700` → `G 14/700 0.01`.
- Reading rule used: Grotesk without a weight means 700 and mono without one 400, as the plan writes them, so a bare `G 9 caps` agrees with a computed 700 and a bare `M 9.5` does not agree with a computed 500. A 0.01em tracking declared in source counts (SettingItem titles, the dApp hostname). The patterns behind the misses: inherited weights (an `AddressDisplay`'s 500, a section count inside a 700 label), inherited px tracking that is a different em at a different size (the Home symbol's -0.08), and tracking the cell left out.

