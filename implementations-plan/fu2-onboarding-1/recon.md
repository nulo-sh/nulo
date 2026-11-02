# fu2-onboarding-1: recon

Base `1e6c5bc1f` (`origin/dev`). Two Explore agents (Sonnet) ran the reuse sweep and the test map; the planner checked each claim used in the plan against the tree. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A stage between the phrase and Ready | `src/onboarding/pages/create.vue:45` (`stage`), `:60-70` (`loseSession`, `leavePhrase`), `:157-160` (`onPhraseSaved`), `:178` (the phrase step's events) | adapt: add `check` |
| Mark the phrase saved | `src/utils/get-started.ts` (`markGetStarted`), read by `done.vue:25-30` (#1387's unsaved line), `popup/pages/general.vue:68`, `settings/security/reset.vue:139`; also written by `settings/security/export/seed.vue:93` | reuse as is |
| Random choice and shuffle | none in `src` or `packages/*/src` (searched `getRandomValues`, `randomInt`, `shuffle`, `Fisher`); `packages/wallet-core/src/utils/random.ts` has only `getRandomHex` | build new, in `phrase-check.ts` |
| Decoy words | the BIP39 list is inlined and unexported (`packages/wallet-core/src/utils/mnemonic.ts:2`); the phrase's other words are in Create's ref | use the phrase's words |
| A group of exclusive choices | `components/composite/AuthMethodTabs.vue` (a two-option tablist, roving tabindex hardcoded for two); no radio or chip component (searched `role="radio"`, `type="radio"`, `roving`, `ArrowRight`) | build new with native radios |
| Phrase step layout and focus | `src/onboarding/components/OnboardingPhraseStep.vue` (title focus and scroll on mount, `refuseRepeatEnter`, `OnboardingSkipLink`), `OnboardingStepHeader.vue`, `OnboardingPage.vue` (max 640 px) | reuse the pattern |
| Word numbering | `components/composite/RecoveryPhraseGrid.vue`: a bare 1-based number per word, every word testid `<testId>-word` | label positions `Word N` |
| Refuse leaving a route | vue-router 5.2.0; `onBeforeRouteLeave` auto-imported, unused; an aborted pop is undone by `routerHistory.go(-info.delta, false)` (`dist/vue-router.js:1417-1427`); onboarding uses hash history (`src/onboarding/index.ts:36-41`) | reuse in `done.vue` |
| Shared copy between two pages | `src/utils/recovery-phrase-warnings.ts` | the pattern for `passkey-choice.ts` |
| The reuse link | `components/composite/PasskeyReuseLink.vue`, used by `onboarding/pages/create.vue:261`, `onboarding/pages/import.vue:228,288`, `popup/pages/import.vue:288,358`, `popup/pages/profile/new.vue:139` | change its one text |
| Focus the onboarding tab | `wallet/utils/onboarding-tab.ts:49-79` (`openOrFocusOnboardingTab`, tracked id in `chrome.storage.session`); manifest has no `tabs` permission (`manifest/manifest.config.ts:46`) | reuse as is |
| The popup before setup | `onboarding-tab.ts:106-111` (`redirectToOnboardingTabIfNeeded`), called by `popup/pages/register.vue:37`, `import.vue:56`, `profile/new.vue:46` | adapt into a predicate |

## Tests and e2e that meet the change

- **"I saved it":** `tests/e2e/onboarding-tab.test.ts:122-145` (password, with `readRecoveryWords` and the Ready line), `:201-203` (passkey); `tests/e2e/keyboard-guards.test.ts:124-150` (a held Enter, then the control press expecting Ready and the flag); the chaos driver `tests/e2e/helpers/profile-chaos/drivers.ts:215-218` (already learns the words). "Do it later": `legal-acceptance.test.ts:81-85` and `createProfileAcceptingTerms` (`helpers/legal-drivers.ts:141-157`). No network spec reaches the phrase step.
- **After Ready:** no spec navigates the onboarding tab inside its document. The chaos driver loads `popup/index.html` in the same page, a new document. `onboarding-tab.test.ts:242` and `legal-acceptance.test.ts:97` set the hash to Ready from other routes.
- **The popup before setup:** `tests/e2e/onboarding-tab.test.ts:286-312` waits for the onboarding tab and closes the popup if it is still open; unit `src/wallet/utils/onboarding-tab.test.ts:126-190`; `register.test.ts`, `new.test.ts`, `import.test.ts` mock the module.
- **Texts:** no test asserts the Ready line or the popup's passkey text; `create.test.ts:135` asserts `Wallet` in the title and `:149,202` the submit `Create wallet`; `PasskeyReuseLink.test.ts:20` and two import tests hold the link text.
- **Logging:** no onboarding log line takes a word; `wallet/logger/utils.ts` redacts `mnemonic` and `seedPhrase`, not `words` or `phrase`.

## Elsewhere

- Onboarding Import is titled `Import` / `Wallet` (`onboarding/pages/import.vue:150`), with the submit `Import profile`; Create's password submit reads `Create wallet` (`create.vue:154`). Both are outside P93-30's text (OA-1).
- `Private by default.` also appears in `popup/pages/register.vue:52`, `store/listing.md:24` and `scripts/store-art.ts:26`; none changes.
