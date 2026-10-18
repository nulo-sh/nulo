---
plan: onboarding-3
tier: mid
status: completed (2026-10-18): one draft PR carries the arc, the owner's page 39 and 41 answers and this close-out, held for the owner's build test; OA-14 and OA-15 wait on the owner
issues: "#588 #585 #581 #636 (one arc closes all four)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan leg); final fresh Codex pass
base: origin/dev at 1b93cbfa
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-18
- **Status:** completed. One draft PR against `dev` carries the arc and this close-out, held for the owner's build test (P33-01's note); merging it is the owner's call.
- **Shipped:**
  - #588, #585 (P30-01 A, P30-02 A, P30-03 B, P30-07 B, P28 B, P29 A):
    - the tab is Welcome, Terms, Create or Import, Ready;
    - Learn, Fees and Presto are gone;
    - Passkey comes first, in the popup's New profile too (P39-13 B);
    - the step row draws each path's cells: four on a password wallet's Create, three on a passkey wallet and on Import, whose 02 reads Import (P39-12 B).
  - P33-02 C and its Copy note: a password wallet's "Your recovery phrase" step before Ready. Settings' phrase screen gets the same numbered grid with Copy (`RecoveryPhraseGrid`, which replaces `SecretRevealCard`).
    - On the tab, Settings' three "Keep in mind" warnings sit under the grid, then Copy beside "I saved it" (P39-18 C, P39-07 C).
    - The third warning reads "Paper keeps the phrase off every computer; keep it somewhere safe from loss, water and fire." on both screens (P41-04 C).
    - Settings' three columns fit an eight-letter word beside a classic 17 px scrollbar (P39-14 A, D20).
  - P33-01 D: Home's Get started card, and the urgent banner for a funded password wallet whose phrase is unsaved. Its flags are per-profile UI keys, never proof of a backup.
  - P33-03 A, P39-11 A and its note: How Aztec works opens `https://nulo.sh/how-aztec-works`; the landing builds that page in #723 (#722).
  - P39-08 F: Welcome's first line is "A wallet that keeps your balance to yourself."
  - P39-16 B: a wallet imported from its recovery phrase starts with "Save your recovery phrase" done; a backup-file import keeps it.
  - #581, #636 (P35-02 B): the done tip is the one sentence.
  - Review: three Codex rounds (gpt-6.1-sol, high) and one Opus review. Fixed in review:
    - a locked bootstrap shows no words;
    - no length hint while creating;
    - the Presto flag re-reads on reconnect;
    - Home settles only after the gas read;
    - Settings' three columns fit an eight-letter word (D16, found by the PR screenshots).
  - E2E specs adjusted to the card, product unchanged: `rows.test` (the scroll probe lets the focus scroll pass) and `network/snack-placement` (clears the card through the shared `clearGetStarted`, found by the PR's CI).
- **Dropped:** none. OA-1 to OA-12 ship the owner's page 39 and 41 answers; P39-09 A, P39-10 A, P39-15 A and P39-17 A were already built. OA-13 ships its "what ships now". O8 (`Pick<GasSlice>`) was declined, with its reason under Audit verdicts.
- **Known limits:** #726 (clipboard scrub), #727 (bootstrap after Back), #728 (Full Backup's flag on a popup close), #729 (the phrase step after a lock).
- **Open items:**
  - #722: the landing's How Aztec works page, built in #723;
  - #730: Presto's onboarding-only leftovers;
  - OA-14 (the popup's first-run line) and OA-15 (the warnings' full stops), in [OWNER-ASKS.md](OWNER-ASKS.md).
- **Lessons:** one promoted. On Firefox, a page's `storage.local` read from its own `onChanged` listener can return the old value ([lessons/phase-4.md](lessons/phase-4.md)).
  - It was merged into the browser-quirks entry.
  - Puppeteer's mobile-emulation entry moved to the e2e-testing skill to make room.
  - The late-card scroll anchoring went to the e2e-testing skill, under Product couplings.
- **Size:** over the mid target of 350 lines: the verdict tables of the plan audits and the three implementation rounds are evidence and stay.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# onboarding-3: the fast-lane onboarding, the recovery phrase step and Home's Get started card

One arc, one PR against `dev`, opened as a **draft** with `HOLD: owner build test` (the owner's note on P33-01). It ships the onboarding redesign signed on decision pages 28, 29, 30, 33 and 35. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/` or `tests/` (`scripts/` and `tests/` are under `apps/extension/`).

## Signed scope

| Pick | What ships |
|---|---|
| P30-01 A + P30-02 A | The tab is Welcome, Terms, Create or Import, [Phrase], Ready. Home gains a "Get started" card with no counter; an item leaves when done. Order: back up, How Aztec works, Get Fee Juice, Make proofs faster. |
| P30-03 B | Onboarding's Create offers Passkey first and selects it. |
| P30-07 B | The 640 px column stays. New surfaces use `@nulo/design` roles only; type-scale-1 ships the scale; no role is added. |
| P33-01 D | Password wallet: "Save your recovery phrase" opens the 24-word screen, cannot be hidden, and once the wallet holds funds leaves the card for the drawn urgent banner above the balance (accent edge, warning mark, "Your funds have no backup", "Save phrase"). Passkey wallet: "Back up this wallet" opens Settings › Backup, never urgent, hides with the card, clears on a Full Backup export. |
| P33-02 C + note | Password wallets get a "Your recovery phrase" step between Create and Ready: a numbered 24-word grid, "I saved it" (clears the Home item), "Do it later" (keeps it; revealing the phrase later clears it, B's rule). Settings › Backup › Recovery Phrase gets the same grid. Both get Copy (placement: OA-1). |
| P33-03 A | "How Aztec works" opens a nulo.sh page in a tab. The page does not exist: the arc files a landing issue (dedupe first); the target meanwhile is OA-5. |
| P33-04 B + note | Welcome keeps its two lines. Tagline pairs for the owner's next page: OA-2 (copy only). |
| P28 B, P29 A + note | The Presto step leaves onboarding (#585's missing decline goes with it). Presto's entry points: "Make proofs faster" and Settings › Proving, where #534 already put the Firefox grant row. |
| P28-02 A, P35-02 B | The done page's tip is "Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access." alone. |

Decision page 39 (signed 2026-10-17 19:03Z) answered OA-1 to OA-12, and page 41 (signed 2026-10-18 00:08Z) worded OA-12's third warning. The owner's text, verbatim:

| Pick | Owner's text | What ships |
|---|---|---|
| P39-07 C | "Copy beside I saved it, two buttons on one row." | the tab step's row: Copy (outline), "I saved it" |
| P39-08 F | "Pair 5." | Welcome: "A wallet that keeps your balance to yourself." / "Private by default. Sovereign by design." |
| P39-09 A | "The card stays with the one row, Save your recovery phrase; the Hide link is gone." | as built |
| P39-10 A | "As shipped (the rules above)." | as built |
| P39-11 A + note | "I feel that this PR should already come with the explainer page created, and being able to watch it through cloudflare preview + already pointing at the URL in which it will be. On next release, we will release with the landing too, so this will be only pointing to something. I want to approve the explainers though." | `https://nulo.sh/how-aztec-works`; the page is #723 |
| P39-12 B | "Three cells on those paths (Terms, Create or Import, Ready); 02 reads Import on Import; the count changes once the method is chosen." | `StepIndicator` takes a path (D18) |
| P39-13 B | "The popup matches onboarding: Passkey first and selected." | the shared default (D19) |
| P39-14 A | "Three columns, words shown after the password." | as built, spacing fixed for a classic scrollbar (D20) |
| P39-15 A | "Stage an established wallet: phrase revealed, Hide tapped; Home as today." | as built (`clearGetStarted`) |
| P39-16 B | "A wallet imported from its recovery phrase starts with the item done; a backup-file import keeps it." | the seed import marks `phraseSaved` |
| P39-17 A | "Go on to Ready; Home's item stays and Settings shows the phrase after the password." | as built |
| P39-18 C + note | "Settings' three Keep in mind warnings under the grid." "Though the third warning, I'd improve it. Because it is not true it's considered one of the best ways, if it's unencrypted. So it kinda contradicts itself with the second bullet point." | the warnings under the tab's grid (D22) |
| P41-04 C | "Paper keeps the phrase off every computer; keep it somewhere safe from loss, water and fire." | the third warning on both screens |

## Issue claims that did not hold

- **Lane brief, the fee card.** The brief reads P29 as a Presto line on Send's fee card. The owner's P29 note says "I'd strictly just remove it", and the operative reading on #585 and #588 (2026-10-16 19:03Z) says no fee-card line ships. Nothing on Send changes.
- **#581.** At HEAD the done page names no browser: #642 (f695dea4) replaced "Chrome toolbar". #636's dropped sentence is what is left; the PR closes both.
- **Lane brief, out of scope.** It lists #636 as out of scope and also asks to close it; P35-02 B is signed, so it is in.
- **P28's "the fees page shrinks to one sentence"** is superseded by P30-01 A: the fees step leaves.
- **The Ready drawing's copy** ("Pin Nulo so it's one click away…") and pin picture yield to the signed P35-02 B sentence.

## Outcome & Quality Bar

For a person installing Nulo, then opening Home in the first days. Excellent: (1) a password wallet sees its 24 words before Ready, and a funded password wallet whose phrase is unsaved always shows the urgent banner; (2) nothing the person did not do is recorded as done (a held Enter never presses "I saved it"; a loading balance never moves the reminder); (3) the words live only in the page that shows them: never in storage, a log or a store. Good enough: item texts and order as drawn; the asks ship their "what ships now".

## Assumptions

**Facts** (verified at 1b93cbfa):
- F1 `createProfile` commits the row, returns `ProfileInfo` and zeroes the entropy (`wallet/services/profile/service.ts:593-638`). `exportMnemonic(id, password)` needs no active session, checks the words against the master and refuses passkey profiles (`:1933-1975`).
- F2 `useProfileCreateFlow` defaults to `"password"` and returns `authMethod` as a writable ref (`composables/useProfileCreateFlow.ts:49,153`). The page zeroes `password` on unmount (`onboarding/pages/create.vue:83-88`). The composable and `AuthMethodTabs` are shared with `popup/pages/profile/new.vue`.
- F3 Per-profile UI keys live only in `utils/profile-ui-keys.ts`, as `nulo:ui:<camelName>@` prefixes with one `*Key` builder each (`utils/profile-ui-keys.scan.test.ts:63-89`). Deletion and a row commit remove them; they are never backed up.
- F4 A failed gas read keeps `display` (undefined on a first read) and sets `status: "degraded"` (`stores/balances.store.ts:189-201`); GasBalanceCard subscribes without retry (`GasBalanceCard.vue:24`). A field of a loaded `display` can be `null` (`packages/wallet-bridge/src/fee.ts:69-76`).
- F5 `isPriceableHolding` drops unpriced tokens once prices map (`BalanceView.vue:207-210`); `isTotalUnsettled` covers rows not yet projected (`:188-194`).
- F6 `prestoReached` (`wallet/config/config.ts:60`) is set when a probe reached Presto (`composables/usePrestoCheck.ts:49`).
- F7 The legal guard allowlists welcome and terms only (`onboarding/legal-guard.ts:6`); a stage inside `/onboarding/create` stays gated.
- F8 `@alejoamiras/presto-banners` is still imported by `utils/presto-ui-state.ts`: no `package.json` edit.
- F9 `full.vue`'s `downloadBackup` resolves when the browser accepts the download (`utils/files.ts:70-80`), then toasts "Backup downloaded successfully"; nothing records an export today.
- F10 `storageLocalSet` awaits `migrationIdle()` before the write (`utils/storage.ts:80-86`); the clipboard scrub is a page timer, best effort by its own header (`composables/useSecretClipboardCopy.ts:8-27`).

**Inferences** (the gates check them):
- I1 Reading `balancesStore.entry(scope)` adds no traffic; GasBalanceCard drives the fetch.
- I2 Firefox's toolbar shows a puzzle-piece extensions button, so the sentence holds in both browsers.
- I3 type-scale-1 merges first; the arc merges `dev` before its PR and takes the roles that exist then.

**Asks**: none silent; every visible choice beyond the picks is in OWNER-ASKS.md (OA-1 to OA-12) with what ships now.

## Architecture & Implementation

**Phrase step inside Create (D1).** For a password profile, `onCreated` in `create.vue` runs in this order:
1. `managers.profile.exportMnemonic(profile.id, password.value)`;
2. zero `password` and `confirm` in a `finally` that covers the whole tail;
3. bootstrap, then `setLastActiveProfileId`;
4. set the local `stage` to `"phrase"`.

A page-lifetime fence guards the tail: one `createRunFence().begin()` taken at setup and `invalidate()`d on unmount (a `begin()` inside the handler would mint a fresh, valid generation after unmount). It is checked at `onCreated` entry, after each await, and before any publication or navigation. A Create that resolves after the person left returns at entry: no export, no bootstrap (which publishes shared store state, `composables/useProfileBootstrap.ts:220-227`), no navigation. The profile is already stored; the known-profile hydration bootstraps it when the tab next opens.

The URL stays `/onboarding/create`. The stage renders the new `onboarding/components/OnboardingPhraseStep.vue` (prop `words`; emits `saved`, `later`) with `StepIndicator :current="3"` and no Back link: Welcome, then Create, would make a second wallet. "I saved it" awaits `markGetStarted(id, "phraseSaved")` and then pushes `/onboarding/done`. "Do it later" pushes it directly. A failed export or write logs a fixed category with `{ error }` and still reaches Ready (OA-11); the Home item stays, the safe side. The words live in a component ref, emptied on unmount. A reload lands on Ready (`app.vue` resumes a known profile there). Passkey profiles and imports go straight to Ready. The password the person edits while "Creating…" runs is a plausible race (the export then fails, which is the safe side); no input freeze, which would be a visible change.

**Keyboard.** The stage moves focus to its title (`tabindex="-1"`), never to a button. "I saved it" takes `refuseRepeatEnter`, so a held Enter from Create cannot press it.

**Flags (D2).**
- `utils/profile-ui-keys.ts` gains four prefixes with builders: `nulo:ui:getStartedPhraseSaved@`, `…BackupSaved@`, `…AztecOpened@`, `…Hidden@`.
- New `utils/get-started.ts` holds two functions. `readGetStarted(profileId)` reads the four keys in one `storageLocalGet`; a flag counts only when it is `=== true`, so a malformed value reads as unset. `markGetStarted(profileId, flag)` writes `true`, through `@/utils/storage`.
- A flag is a reminder preference, not proof of a backup.
- Writers:
  - `phraseSaved`: "I saved it", and `seed.vue` after a successful `exportMnemonic`, for the profile id captured before the await;
  - `backupSaved`: Full Backup's export run (`composables/useFullBackupExport.ts` since #705) at its "Backup downloaded successfully" point, under `isCurrent()`;
  - `aztecOpened` and `hidden`: Home.
- `aztecOpened` is awaited before `window.open`, because opening a tab closes the toolbar popup.
- Every flag write catches its own error (a `debug` line with `{ error }`), so it never blocks the action it rides on: the link still opens, the Full Backup toast still reads success, "I saved it" still reaches Ready.

**Funds (D3).**
- `BalanceView.vue` emits `holdings` on Home only (no `tokenBalance` prop):
  - `"some"` once any row has `parseRawBalance(tb) > 0n`, prices aside;
  - `"unknown"` while no row is positive and `isTotalUnsettled` holds before the hero's cap;
  - `"none"` otherwise.
- `general.vue` reads the gas entry for the active scope through one helper shared with GasBalanceCard (extracted from `GasBalanceCard.vue:26-35`, so no copy is made):
  - `"some"` when `display`'s public or private amount is above zero;
  - `"none"` when `display` is loaded and both are zero or `null`, or when `status === "degraded"` with no `display`;
  - `"unknown"` otherwise.
- `funds` is `"some"` if either side is, `"unknown"` while either is unknown, else `"none"`. The scope is the selected account on the selected network.

**Get started view.** `getStartedView(input)` in `utils/get-started.ts` is pure. Its input is `{ type, flags, funds, feeJuice, prestoReached }`, where `flags` and `prestoReached` are `undefined` until read. It returns `null` until the flags of the active profile, `prestoReached` and `funds` are known. Otherwise it returns `{ banner, items, canHide }`, built from one small predicate per item (complexity budget). The rules are under Phase 4.

**Home wiring.**
- `general.vue` owns three sources:
  - `useGetStarted({ profileId: () => appStore.profile?.id })`, a new C1 hook. It holds `{ profileId, flags } | undefined` and re-reads on a profile change, refusing a stale answer as `RestoreOutcomeBanner` does. It re-reads on `chrome.storage.onChanged` for its four keys and exposes `flags`, `mark` and `dispose`. The page disposes it.
  - A `ConfigServiceClient` with `useConfigRead` for `prestoReached`.
  - The funds sources above.
- `BackupReminderBanner.vue` (L4, `.hero`, above BalanceView) draws the signed urgent form with core primitives: the accent edge, the warning glyph in the accent, the text and a "Save phrase" text action. `Banner` cannot carry the drawn edge and mark, because its glyph is fixed to `info`, and a new `Banner` variant for one caller is the rejected alternative.
- `GetStartedCard.vue` (L4, `.content`, after the two existing banners, before TokensView) renders `SectionLabel` "Get started", a "Hide" text button when `canHide`, and `ItemsContainer` + `SettingItem` rows (title, description, `value`, chevron). It emits `select(id)` and `hide`.
- The page acts on `select`:
  - the phrase item pushes `/popup/settings/security/export/seed`;
  - the backup item pushes `/popup/settings/security/export`;
  - "How Aztec works" marks `aztecOpened`, then opens `HOW_AZTEC_WORKS_URL`, a constant in `utils/get-started.ts`;
  - "Get Fee Juice" opens `FEE_JUICE_BRIDGE_URL`;
  - "Make proofs faster" pushes `/popup/settings/proving`.
- Both links use `window.open(…, "_blank", "noopener,noreferrer")`.

**Recovery phrase grid (D7).** New L3 `components/composite/RecoveryPhraseGrid.vue`:
- props `words`, `columns: 3 | 4`, `testId`, `isCopied`; it emits `copy`;
- the root carries `data-testid="<testId>"` and `translate="no"`;
- an `<ol>` of numbered words in a mono role, each with `data-testid="<testId>-word"`;
- a "Copy" button under the grid (OA-1).

The parents use `useSecretClipboardCopy` unchanged. `seed.vue` swaps `SecretRevealCard` for the grid (testId `reveal-content`, 3 columns). `SecretRevealCard` stays for the account export popup.

**Onboarding route set.**
- Delete `learn.vue`, `fees.vue`, `presto.vue` and `presto.test.ts`. Delete `OnboardingExplainer` and `OnboardingSkipLink`, with their tests.
- `create.vue` (passkey), `import.vue` and `app.vue:75` go to `/onboarding/done`.
- `StepIndicator` gets four cells: Terms, Create, Phrase, Ready (`current: 1 | 2 | 3 | 4`). Passkey and import skip from 02 to 04 (OA-6). Superseded by P39-12 B (D18).
- **First method (D5).** `create.vue` sets `authMethod.value = "passkey"` in setup. `AuthMethodTabs` takes `first?: "password" | "passkey"` (default `"password"`), because the two shells need different DOM order. The popup's page is unchanged (OA-7). Superseded by P39-13 B (D19).

## Security & Adversarial Considerations

- **Threat model.** The asset is the 24 words, shown in the onboarding tab and on the seed route; malware on the device can read the screen and the clipboard today. The new exposure is the tab step only.
- **No new holder of the words** (D1): a component ref behind a run fence, emptied on unmount; no store, storage, log or new message; the existing RPC; the password zeroed before bootstrap; `translate="no"` keeps page translation off them.
- **Clipboard (known limit).** Copy uses `useSecretClipboardCopy` unchanged: the copy runs inside the gesture, the toast is honest, and a best-effort scrub runs after 60 s. The scrub is a page timer, so closing the tab ("Open wallet") or the popup first leaves the words on the clipboard. That is true today on the seed route too. The close-out files it as a closed `known-limit` issue; whether the tab step carries the clipboard warning is OA-12.
- **Logging.** A failed export or flag write logs a fixed category with `{ error }` at `debug`. Words, the password and flag records are never logged.
- **False "saved".** A held Enter cannot press "I saved it": focus goes to the title, and the button refuses a repeat Enter, proven in a real browser. A malformed flag value reads as unset. Whoever can write `chrome.storage.local` already holds more than this reminder.
- **Wrong screen.** Only a positive balance raises the banner. A loading balance withholds the card and the banner. A failed read shows the calm row, which claims nothing.
- **Legal.** The phrase step sits under `/onboarding/create`, behind the allowlist guard. The Home items route to `/popup/settings/security/export/**`, which stays ungated (Terms § 20).
- **Links.** The two targets are fixed `https:` constants, opened with `noopener,noreferrer`. `FEE_JUICE_BRIDGE_URL` stays a build-time override.
- **Supply chain.** No dependency, permission, manifest or crypto change.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`; pass = each exits 0. Smoke: `cd apps/extension && bun run test:e2e -- tests/e2e/<file> --retry=0`, with the Firefox twin under `NULO_E2E_BROWSER=firefox`. Network: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` (the network config retries twice unless told), with the Firefox twin too. Run e2e only while load1 < 150, at retry 0. Every phase that adds or deletes an auto-imported component or export commits the regenerated `src/types/*.d.ts` (`bun run build`). A phase is ✓ only when its gate passes; each phase logs to `lessons/phase-N.md`.

**1. The fast lane (#585, P30-01 A route set, P30-03 B).** ✓ (2026-10-17, [lessons/phase-1.md](lessons/phase-1.md))
- Change map:
  - Delete `onboarding/pages/{learn,fees,presto}.vue`, `presto.test.ts`, `onboarding/components/{OnboardingExplainer,OnboardingSkipLink}.{vue,test.ts}` and `tests/e2e/helpers/presto-step.ts`.
  - `onboarding/app.vue` and `onboarding/pages/{create,import}.vue`: target `/onboarding/done`. `StepIndicator.vue`: four cells. `done.vue`: `current=4`. `create.vue`: Passkey selected. `AuthMethodTabs.vue`: `first`.
  - `scripts/type-roles/surfaces.expected.json` and `exceptions.ts`: drop the learn, fees and presto entries and `PRESTO`.
  - `tests/e2e/onboarding-tab.test.ts`: the run-through goes Welcome, Terms, Create (Password), Ready; the method focus starts at Passkey; the Presto cases go.
  - `tests/e2e/presto-host-permission.test.ts`: retarget to Settings › Proving with the same assertions.
  - `tests/e2e/helpers/{legal-drivers,import-drivers}.ts` (`successHash`), `keyboard-guards`, `passkey-retry` and `legal-acceptance` S1 to S3: click `onboarding-method-password` before typing a password; wait on the new hashes.
  - `tests/e2e/README.md`: fix the step names.
- Tests:
  - `create.test.ts`: Passkey selected and first, and the route.
  - `import.test.ts`: the route.
  - `StepIndicator.test.ts`: four cells.
  - `app.test.ts`: a known profile resumes at done.
  - `legal-guard.test.ts`: its path list.
  - `AuthMethodTabs.test.ts`: the `first` order; the arrows still switch.
  - Control: the popup's `profile/new.vue` keeps Password first and selected.
- Gate:
  - `F`, then `bun run test:all`.
  - Smoke on Chrome and Firefox: `onboarding-tab`, `keyboard-guards`, `passkey-retry`, `legal-acceptance`, `import-paths`, `onboarding-import`, `token-list`, `shipped-token-list`.
  - `presto-host-permission` on Firefox (it is skipped on Chrome).
  - Pass: all green.

**2. The done page (#581, #636).** ✓ (2026-10-17, [lessons/phase-2.md](lessons/phase-2.md))
- Change map: `onboarding/pages/done.vue`: the tip is the P35-02 B sentence alone.
- Tests: a new `done.test.ts`. The tip equals the sentence and contains neither "Chrome" nor "from now on". Control: the tip hides on `isOnToolbar: true`.
- Gate: `F`; smoke `onboarding-tab` on Chrome and Firefox.

**3. The recovery phrase (P33-02 C + Copy; the Settings grid).** ✓ (2026-10-17, [lessons/phase-3.md](lessons/phase-3.md))
- Change map:
  - New `components/composite/RecoveryPhraseGrid.vue` and `onboarding/components/OnboardingPhraseStep.vue`.
  - `onboarding/pages/create.vue`: the tail, the stage and the handlers.
  - `utils/profile-ui-keys.ts` (prefixes and builders) and `utils/get-started.ts` (storage half).
  - `popup/pages/settings/security/export/seed.vue`: the grid and the mark.
  - `tests/e2e/fixtures/profiles.ts`: `revealSeedPhrase` returns the words from `reveal-content-word`; the five readers (`security-backup`, `duplicate-phrase-import`, `legal-acceptance`, `import-paths`, `network/frozen-account-canary`) use it.
  - `helpers/legal-drivers.ts`: `createProfileAcceptingTerms` waits for the phrase stage and takes "Do it later".
  - `surfaces.expected.json`: through its test's messages.
- Tests:
  - `RecoveryPhraseGrid.test.ts`, at least 10 cases (L3): order and numbers 1 to 24, columns, the copy emit, `isCopied`, both testids, `translate="no"`, an empty list renders nothing.
  - `create.test.ts`:
    - the export runs once, with the typed password, before bootstrap;
    - the password is zeroed after a success, an export failure and a bootstrap failure;
    - the stage shows the words, step 3, and no Back link;
    - "I saved it" marks and then routes; "Do it later" routes and writes no mark;
    - a failed export routes to done with no mark;
    - unmount before `onCreated` exports nothing, bootstraps nothing and routes nowhere; unmount during the export publishes nothing; a live run is the control;
    - passkey skips the stage.
  - `get-started.test.ts` (storage): one read; only `=== true` counts (`"true"` and `1` read as unset); a mark writes `true`.
  - `profile-ui-keys.scan.test.ts` passes with the new prefixes.
  - `seed.test.ts`: a reveal marks the captured id; a wrong password marks nothing.
  - E2E, the `onboarding-tab` run-through: Create (Password); read the 24 words; "I saved it"; assert the stored `phraseSaved` before any Settings reveal; Ready; then compare the words with Settings' reveal. Failure mode: the words come from the real service and the write lands in real storage (a unit test mocks both). Runtime: estimated +6 s; measured +3.3 s on Chrome, within noise on Firefox.
  - E2E, `keyboard-guards` "Enter in the confirm field": hold Enter through the stage's mount, deliver a recorded repeat, assert no click on `onboarding-phrase-saved` and no stored flag, release; one plain activation writes the flag (control). Failure mode: a repeat after the mount; jsdom cannot show it. Runtime: estimated +3 s; measured +0.4 s on Chrome, +4.7 s on Firefox under load.
- Gate:
  - `F`.
  - Smoke on Chrome and Firefox: `onboarding-tab`, `keyboard-guards`, `security-backup`, `duplicate-phrase-import`, `legal-acceptance`, `import-paths`, `token-list`, `shipped-token-list`.
  - Network on Chrome and Firefox: `frozen-account-canary`, the prover as in CI.

**4. Home's Get started card and the reminder (P30-01 A, P30-02 A, P33-01 D, P33-03 A, P28/P29).** ✓ (2026-10-17, [lessons/phase-4.md](lessons/phase-4.md))
- Change map:
  - `utils/get-started.ts`: the pure half and `HOW_AZTEC_WORKS_URL`.
  - New `composables/useGetStarted.ts` and `popup/components/modules/general/{GetStartedCard,BackupReminderBanner}.vue`.
  - `BalanceView.vue`: `holdings`.
  - The gas scope helper (GasBalanceCard and `general.vue`).
  - `popup/pages/general.vue` and `popup/pages/settings/security/export/full.vue`.
  - `surfaces.expected.json`.
  - The landing issue for the page (dedupe first).
- View rules (items in order):
  - **backup**, password: shown while `!phraseSaved`. With `funds = "some"` it leaves the items and `banner = true`. `hidden` never removes it (OA-3).
  - **backup**, passkey: shown while `!backupSaved && !hidden`; never a banner.
  - **aztec**: shown while `!aztecOpened && !hidden`.
  - **feeJuice**: shown while `feeJuice === "none" && !hidden`.
  - **presto**: shown while `!prestoReached && !hidden`.
  - `canHide`: any shown item other than the password backup. No items: no card. Done rules: OA-4.
- Tests:
  - `get-started.test.ts` (pure): one case per rule. Never a banner while funds are unknown, and never for passkey. `null` until the flags, `prestoReached` and funds are read. A hidden password card keeps only the phrase row with `canHide` false. No card when every item is done.
  - `useGetStarted.test.ts`, at least 10 cases: the first read; the old profile's flags never render for the new one (a switch whose first read lands last); its key's change re-reads, another key's does not; `mark`; after `dispose` the listener is gone and a late read is dropped.
  - `GetStartedCard.test.ts` and `BackupReminderBanner.test.ts`: the drawn texts, the emits, Hide only with `canHide`.
  - `BalanceView.test.ts`: `holdings` for an unpriced positive token is `"some"` after prices map (zero-balance control); unknown while unsettled; nothing on the token page.
  - `general.vue` wiring: a degraded first gas read with tokens `"some"` raises the banner; a successful read is the control.
  - `full.test.ts`: a download marks; a stale run marks nothing.
  - Click order: aztec marks before `window.open`. A rejected flag write still opens the link, keeps the Full Backup success toast, and still routes "I saved it" (one case per handler).
  - E2E, `security-backup` (popup password wallet): Home shows the card with `get-started-aztec` and `get-started-phrase` and no `backup-reminder-banner`; reveal; Home keeps the card and loses only the phrase row. Failure mode: the seed route's write reaches Home. Runtime: estimated +3 s; measured +1.4 s on Chrome, +2.3 s on Firefox, How Aztec works step included (D14).
  - The `onboarding-tab` run-through gains a step: after Open wallet, Home shows the card without the phrase row.
  - E2E, `network/frozen-account-canary` (a funded password wallet): `backup-reminder-banner` before its reveal, gone after. Failure mode: the funded wiring, which no unit test reaches. Runtime: +2 s in an existing run.
- Gate:
  - `F`, then `bun run test:all`.
  - The whole smoke suite on Chrome and on Firefox. Every fresh wallet now shows the card, so `rows`, `home-links` and the type-role sweep must pass.
  - Network on Chrome and Firefox: `frozen-account-canary`, `home-cap` (its Tab walk crosses Home), `hero-prices-unavailable`, `fiat-send`, `incoming-arrival`, `send-amount-exact`.
  - Pass: green at retry 0, or one named rerun of a known flake.

**5. Store captures and delivery prep.** ✓ (2026-10-17, [lessons/phase-5.md](lessons/phase-5.md))
- Change map: `tests/e2e/network/store-captures.test.ts` stages an established wallet through the UI before the Home frame (reveal, then Hide; OA-9). Re-read the docs touched in phases 1 to 4.
- Gate:
  - `STORE_CAPTURES=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts` on Chrome (the spec is Chrome-only).
  - The log shows the test ran, not skipped. The Home frame shows no card and no banner.
  - Then `bun run audit:vue` and `bun run test:ci-gating`.

## UI impact

All signed; the PR body quotes each pick id with the owner's notes, and carries light and dark screenshots of the real screens: the tab (Welcome, Create, Phrase, Ready; Ready in both browsers), Home for a password wallet before and after funds and for a passkey wallet, and Settings › Backup › Recovery Phrase.

| Surface | Change | Record |
|---|---|---|
| Onboarding tab | Learn, Fees and Presto leave; each path's step cells; Passkey first | P30-01 A, P30-03 B, P28 B; P39-12 B |
| Onboarding phrase step | grid, three warnings, Copy beside "I saved it", "Do it later" | P33-02 C + note; P39-07 C, P39-17 A, P39-18 C, P41-04 C |
| Welcome | first line: pair 5 | P39-08 F |
| Ready | tip sentence alone | P35-02 B |
| Home | Get started card; urgent banner; How Aztec works opens its final address | P30-01 A, P30-02 A, P33-01 D; P39-09 A, P39-10 A, P39-11 A, P39-16 B |
| Settings › Backup › Recovery Phrase | numbered grid with Copy under it, in place of the one-line field; the third warning reworded | P33-02 C; P39-14 A, P41-04 C |
| Settings › Profiles › New profile | Passkey first and selected | P39-13 B |
| Store listing captures | Home as an established wallet | P39-15 A |
| Settings › Proving, Send | none | P29 note |

## Delivery

- **One arc, one PR, no stack** (the orchestrator's D-orch-1). Branch `worktree-onboarding-3` against `dev`.
- **Opening it.** Open it after phase 5 and the Codex loop converge, as a **draft**, with no labels. Title: `feat(onboarding): fast-lane tab, recovery phrase step and home's get started card` (79 characters).
- **The PR body:** what changed and why; the picks and notes (UI impact); the screenshots; the validation runs; each browser's smoke wall-clock before and after; the asks that shipped their "what ships now"; the clipboard known limit; `Closes #588`, `Closes #585`, `Closes #581`, `Closes #636`; `HOLD: owner build test`.
- **CI.** Run `gh pr checks <n> --watch`. Add `e2e:extension-network` only if the path filter skips a suite the change needs. Nothing merges before the owner's word.
- **Parallelism.** Phases 1 and 2 touch few of the files 3 and 4 touch, but they share `create.vue` and the onboarding e2e. One implementer, serial; lanes would save under 30%.
- **Close-out.** It is the PR's final commits, per `implementations-plan/README.md` § Post-implementation standard, step 4, read at 1b93cbfa.

## Decision ledger

Outline B (local `outline-b.md`, safest-first) split the arc into two PRs: B1 (the tab, done page, Presto and the Settings grid) merged at once, and B2 (Home) held. Both reviewers chose A. B1 alone ships "Do it later" with nothing behind it and drops Presto from onboarding with no entry on Home, so `dev` would hold a flow with no backup prompt.

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D1 | Where the words come from | a stage inside `create.vue`; export before bootstrap; run fence | a route (a secret handed across), re-asking the password (not drawn), words in `createProfile`'s answer (RPC change), freezing the inputs while creating (visible change for a safe-side race) |
| D2 | Flags | four set-only keys, registered in `profile-ui-keys.ts` | one record and a lock (lost writes, decoder), `Config` (global), a profile-row field (backup surface) |
| D3 | Funds | BalanceView `holdings` (raw balances) + the gas entry through a shared scope helper | lifting the snapshot (a second owner), the banner inside BalanceView (the token page shares it), the price-gated predicate (misses unpriced tokens) |
| D4 | Arcs | one draft PR, held | outline B |
| D5 | Passkey first | set `authMethod` in `create.vue`; a `first` prop on the tabs | an `initialMethod` option (one caller), flipping the shared default (beyond the pick) |
| D6 | Fee card | nothing | the brief's line (did not hold) |
| D7 | Grid and Copy | one L3 composite that emits `copy`, as `SecretRevealCard` does | Copy in each parent |
| D8 | E2E | extend `onboarding-tab`, `keyboard-guards`, `security-backup` and `frozen-account-canary`; move the grant spec to Proving | a new Home spec, or a network spec just for the banner |
| D9 | Urgent banner | the drawn form from core primitives | `Banner warning` (not the drawn form), a new `Banner` variant (one caller) |
| D10 | Presto leftovers (implementation) | keep `copyFor`'s onboarding surface, the custom-element allowance and the CSP style hash; file one issue | removing the hash now (a manifest change the plan rules out) |
| D11 | The HTTP-fallback e2e (implementation) | move the `https-disabled` case to `settings-proving` | dropping it with the Presto step (the only e2e proof of the loopback HTTP path) |
| D12 | `SecretRevealCard` (implementation) | delete it with its test and story: `seed.vue` was its only user | keeping it for the account export popup, which does not render it |
| D13 | The funded-banner e2e (implementation) | `network/hero-prices-unavailable`: a funded password wallet restored from a backup, unpriced; banner, reveal, banner gone | `frozen-account-canary`, which reveals the phrase before it mints, so its wallet never shows the banner |
| D14 | How Aztec works in e2e (implementation) | one step in `security-backup`: click the row, a tab opens, the row leaves; `nulo.sh` joins the smoke egress guard's declared refusals | no e2e (whether a tab opened after the awaited write survives the browser's popup rule is invisible to jsdom) |
| D15 | The banner's glyph (implementation) | the warning glyph in the house warning orange, as the drawing shows | `--nulo-accent`, which is cream in the dark theme |
| D16 | Settings' three columns at 360 px (found by the PR screenshots) | 8 px between columns, 12 px side padding, 4 px number to word: an eight-letter word fits; `security-backup` puts one in every cell and checks it stays inside, both browsers | two columns (OA-8's other option, owner's call) |
| D17 | Copy's place once it differs per screen (P39-07 C) | the grid takes a default slot under its list; Settings slots Copy there, the tab step puts it in its button row | a prop that hides the grid's own Copy (a second way to say where Copy goes) |
| D18 | Ready's step count (P39-12 B) | `onboarding/steps.ts`: the path rides in the history entry (`doneRoute`), parsed as an enum; an entry with none takes the wallet's type | a `?path=` query (every e2e matches `#/onboarding/done` exactly), a store (lost on reload) |
| D19 | Passkey first in the popup (P39-13 B) | flip the shared create flow's default; `AuthMethodTabs` always orders Passkey, Password and loses `first`; three e2e helpers click Password | a second override in `new.vue` beside the one in `create.vue` |
| D20 | The longest word beside a classic scrollbar (P39-14 A) | sides 12 → 8 px, column gap 8 → 6 px; `security-backup`'s probe reserves 17 px, checks the role is monospace, red at 2.9 px before | a jsdom component test (no layout), a smaller word role (a type change the pick does not make) |
| D21 | The How Aztec works address (P39-11 A) | one constant, `HOW_AZTEC_WORKS_URL` | a `VITE_` override like the fee card's: CI's build-env guard allows only two, and widening it is a security-control change |
| D22 | The warnings on two screens (P39-18 C) | one constant, `utils/recovery-phrase-warnings.ts`, rendered by each screen | an L3 component for three lines of static text |
| D23 | The Firefox BiDi socket (found by the PR's CI) | `bidi-attach.ts` opens it with `ws` and the options of Puppeteer's own BiDi transport; the e2e skill's row 57 holds the evidence. The dependency change is only what the import needs under the isolated linker: `apps/extension` devDependencies gain `ws` 8.21.3, exact, the version puppeteer-core already locks, so no new `ws` code enters the tree, and `@types/ws` ^8.18.2 for the e2e typecheck, the one package new to `bun.lock` (published 2026-09-29, past the 7-day gate). In `bun.lock` the hoisted `ws` key now names 8.21.3 and viem keeps its pinned 8.18.3 nested; the one consumer that moves is `isows`, whose any-version `ws` peer now resolves 8.21.3 (below 8.21.0 sit two `ws` advisories the audit acks hold for viem's copy). Neither `ws` nor `isows` reaches the extension's bundle: `isows`'s browser export uses the page's WebSocket, and the built notices list neither | reverting Passkey first (hides the trigger, keeps the broken client); a retry or a longer timeout (masks it); reaching `ws` through puppeteer-core undeclared (the linker rule) |

## Audit verdicts

**Round 1** (2026-10-17). Codex (gpt-6.1-sol, high): reject, 11 findings. Opus Plan leg: conditional approve, 12 findings. Every claim was checked against the tree; all were accepted, two in part.

| Finding | Label | Disposition |
|---|---|---|
| Cx1/Op1 (High): a failed first gas read keeps `display` undefined, which hides the card and the banner | demonstrated | F4 fixed; `degraded` without a display is `"none"` |
| Cx2/Op2 (High): `isPriceableHolding` misses unpriced tokens and can flip | demonstrated | `holdings` uses raw balances and waits while unsettled |
| Cx3/Op5: the clipboard scrub dies with the tab | demonstrated | worded as best effort; a known limit; OA-12 |
| Cx4: "downloaded" means the browser accepted the download | plausible | the flag rides the existing success toast; OA-4 says so |
| Cx5: the password edited while creating; cleanup after a failed tail | plausible | `finally` zeroing, export before bootstrap, a run fence; input freeze rejected (visible; safe-side race) |
| Cx6: Settings' reveal can mask a broken "I saved it" | demonstrated | the stored flag is asserted before any reveal |
| Cx7/Op7: no success proof of the funded wiring; no network gate | demonstrated | `frozen-account-canary` asserts; Home network specs gated |
| Cx8: the store-captures run skips without `STORE_CAPTURES` | demonstrated | the gate sets it and checks the run |
| Cx9/Op6: held Enter not proven after the stage mounts; the jsdom control cannot pass | demonstrated | extend `keyboard-guards` in both browsers |
| Cx10/Op asks: export-failure routing unsigned; `=== true` wording | demonstrated | OA-11; wording fixed |
| Cx11/Op11: `initialMethod` is an option for one caller | demonstrated | dropped (D5) |
| Op3: flags without an unread state can flash the banner on a profile switch | plausible | `{ profileId, flags } \| undefined`; `null` until read |
| Op4: key names fail `profile-ui-keys.scan.test.ts` | demonstrated | camelCase prefixes with builders |
| Op6: unlisted specs (`token-list`, `shipped-token-list`); keep `reveal-content` | demonstrated | listed; the root testid is kept |
| Op8: an `aztecOpened` write can die with the popup | plausible | awaited before `window.open` |
| Op9: the Back link on the phrase stage can make a second wallet | plausible | no Back link on the stage |
| Op10: regenerated `src/types/*.d.ts` | demonstrated | committed per phase |
| Op12: smaller items | mixed | taken: export before bootstrap, captured id, shared scope helper, the URL's home, `translate="no"`, per-item predicates |
| Op asks: Hide is permanent; account scope; a plain passkey export counts; the warning variant | n/a | OA-4 states the first three; D9 builds the drawn form |

**Final fresh pass** (Codex, new session, gpt-6.1-sol high): conditional approve. All three conditions verified and taken.

| Finding | Label | Disposition |
|---|---|---|
| F1 (High): `onCreated` runs after unmount (`useProfileCreateFlow.ts:117-139`); a handler-local `begin()` would be valid after unmount | demonstrated | page-lifetime fence at entry, after awaits, before routing |
| Confirmation round: keeping bootstrap after unmount contradicts "before any publication" (bootstrap publishes shared state) | demonstrated | a departed page returns at entry: no export, bootstrap or navigation; hydration covers the stored profile |

| F2: a rejected flag write blocks `window.open` or turns a done download into "Failed to download backup" (`full.vue:433-440`) | plausible | each write catches its own error; one test per handler |
| F3: the network commands retry twice by default (`vitest.e2e.network.config.ts:26`); no Firefox network twin | demonstrated | `NULO_E2E_RETRY=0` in every network command; Firefox twins in phases 3 and 4 |

**Final verdict** (same session, second confirmation): **approve**. "No material regression found"; the hydration path is `useProfileBootstrap.ts:258-266`, called by `onboarding/app.vue:73`.

**Implementation review, round 1** (2026-10-17, Codex gpt-6.1-sol high over `git diff 623fc97f HEAD`): two lifecycle gaps, two comment findings. All four verified against the tree.

| Finding | Label | Disposition |
|---|---|---|
| R1-1: bootstrap started by Create keeps publishing after Back (its fence is module-level, not the page's) | demonstrated; predates the arc | known limit: the store gets the really created, active profile; fencing it changes the composable's contract for every caller |
| R1-2: `bootstrapActiveProfile` resolving `false` (locked or superseded) still records the last profile and shows the words | demonstrated | the lock wins: no words, no last-profile write, Ready; one control test |
| R1-3: StepIndicator's header redraws the row and lists its colours | demonstrated | one sentence: every path keeps four cells |
| R1-4: the grid and banner headers narrate; `translate="no"` has no reason | demonstrated | headers deleted; one invariant comment on `translate="no"` |

**Opus review** (same round, `general-purpose`, read-only): ship after small fixes. Each claim traced in the tree.

| Finding | Label | Disposition |
|---|---|---|
| O1: zeroing before bootstrap leaves "At least 8 characters" under the empty fields beside "Creating..." | demonstrated | the hint hides while creating; the empty fields are OA-13 |
| O2: `readPrestoReached` swallows its error, so `useConfigRead` never re-reads on reconnect | demonstrated | it lands `false` and rethrows; a reconnect test |
| O3: `data-reminders-settled` turns true before the gas read, which can still add Fee Juice | demonstrated | the attribute also waits for the gas read; the view rule is unchanged |
| O4: the degraded-gas test passes with the rule deleted | demonstrated | rewritten with no token funds |
| O5: the banner-gone check after reveal can pass before the reminders settle | demonstrated | waits for `data-reminders-settled` first |
| O6: the unawaited `backupSaved` write can die if a download closes the toolbar popup | plausible | known limit; no local fix |
| O7, O9, O10: "never unset" is wrong; Create's comments restate order; a long header line, a vague TSDoc | demonstrated | reworded; one why; re-wrapped |
| O8: `GasRead` copies `GasSlice` with `status: string` | demonstrated | declined: Home's script is untyped, so no caller is checked, and the store type pulls the store graph into the e2e typecheck through the egress guard's import |

**Round 2** (same Codex session, over the round-1 fixes and the `origin/dev` merge): the fixes and the port check out; two findings.

| Finding | Label | Disposition |
|---|---|---|
| R2-1: a lock during the last-profile write still lets the words show | demonstrated; timing unverified | known limit: the tab has no lock listener, so a lock just after the words show leaves them up too; a lock reaction is a new subscription |
| R2-2: "only its toast is fenced" is stale now that the flag rides the fence (`useFullBackupExport.ts:408`) | demonstrated | reworded |

**Round 3** (same session, verify only): "verification passes; no unresolved material finding beyond the accepted known limits." The loop stops here.

**Page 39 round 1** (2026-10-18, new Codex session, gpt-6.1-sol high, over `git diff ca862e13 fd662e42`): no P1; one P2 and three comment nits, all verified.

| Finding | Evidence | Disposition |
|---|---|---|
| P39-R1-1: a reload mid-import, once the session opened, resumes at a bare Ready, so a password import shows four cells and "Create" | demonstrated from `app.vue:75` | the resume waits for the first navigation and keeps Import's path; `app.test.ts` covers it, red without the fix |
| P39-R1-2: three comments narrate or carry release coordination (`useProfileCreateFlow.ts`, `RecoveryPhraseGrid.vue`'s `testId` doc, `get-started.ts`) | demonstrated | removed or trimmed |

**Page 39 round 2** (same session, verify only, over 0ab5a6f7): "No remaining findings; high confidence." The loop stops here.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard, read at 1b93cbfa. This section keeps only this plan's parameters.

- **Diff review.** `code_review: off`, so this step is absent.
- **Review loop.** Run it once, over the net diff from 1b93cbfa, after phase 5 is green.
  - `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` (on a quota error or a 401, retry with `CODEX_ACCOUNT=alejo-icloud`), then `resume-codex.sh`. The prompt: the diff, this plan, the adversarial ask and the README's two verbatim rules.
  - Each round: verify every claim, fix, commit, log it in `lessons/phase-5.md` and under Audit verdicts. Stop when a round finds nothing material; still material after round three, stop and report `ARC_FAILED` or a plan change.
- **Delivery.** As above. First merge `origin/dev`, read what changed in `index.md` and `lessons.md`, take type-scale-1's roles, and regenerate any pinned expectation with its generator.
- **Close-out**, as the PR's final commits: the Outcome block; the lessons promotion; open items filed, deduped; the clipboard known limit as a closed `known-limit` issue; a comment on any issue left open; `STATUS.md` deleted; the `git mv` into `archive/` in its own commit; `bun run check:plans` green after staging.
- **Teardown.** After the merge, which is the owner's call: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/onboarding-3/plan.md` succeeds, run `agent-worktree done onboarding-3 --merged`. Never force past a refusal.
- **Status.** Run `agent-worktree status onboarding-3 "<phase N green: next>"` at every gate. Stop and reassess after three failures on one step.

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

```
/goal All five phases of implementations-plan/onboarding-3/plan.md marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/onboarding-3/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged on the net diff from 1b93cbfa, quoted; the draft PR against dev exists only after that, with the close-out commits (git show --stat of the archive move); bun run test and bun run lint exit 0; the report says HOLD: owner build test.
```

```
/loop 15m Drive implementations-plan/onboarding-3 forward per its plan.md (reality check from plan.md and lessons/; phases in order; each gate as written; e2e only while load1 < 150; Codex at gpt-6.1-sol high for any decision; never merge; the PR stays a draft with HOLD: owner build test).
```
