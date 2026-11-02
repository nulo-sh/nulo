# fu2-onboarding-1: phase 2 (arc 2, the phrase check)

- **Base moved.** Arc 1 merged as #1542; the branch started at `616f938a7` and was rebased, unpushed, onto `c17dfc1bc` (#1545, no shared file) before any e2e ran, so base and head runs share one trunk.
- **Red on base.** `phrase-check.test.ts` and `OnboardingPhraseCheck.test.ts` cannot import on base. `create.test.ts`: the five check tests and the passkey test that now passes the check, 6 red at base `create.vue`. `utils.test.ts`: the six new redaction keys, 6 red at base `utils.ts`. All green after.
- **jsdom has no `document.scrollingElement`.** The check's scroll-to-top is proven with a configurable stand-in property, removed in `finally`; `vi.spyOn(document, "scrollingElement", "get")` throws, as the getter does not exist.
- **The build regenerates `src/types/components.d.ts`** with the new component; it ships with the arc.
- **Wall-clock**, armed smoke at retry 0, files together (load average about 130). Chrome, base then arc 2: onboarding-tab 46.8 s, 41.3 s; keyboard-guards 13.6 s, 12.6 s; legal-acceptance 139.7 s, 138.4 s; passkey-retry 38.9 s, 32.3 s. Firefox: onboarding-tab 67.3 s, 71.6 s; keyboard-guards 18.3 s, 22.2 s; legal-acceptance 198.3 s, 195.7 s; passkey-retry 47.9 s, 48.9 s. Within host noise of D11's +1.5 s estimate.
- **Chaos replay**, `NULO_E2E_CHAOS_ACTIONS` = one `onboardingCreate` `{ ref: P1, method: password, password: S1, answer: saved }`: committed on Chrome (7.7 s) and Firefox (11.1 s); the model test (266) green with the citations moved to `create.vue:151,170,190`.
