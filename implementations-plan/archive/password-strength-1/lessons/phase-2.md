# Phase 2: builds, e2e, captures

- Armed builds, Chrome and Firefox: exit 0. `THIRD-PARTY-NOTICES.txt` lists the five packages and carries `language-en`'s ODC-BY notice. The hint chunk (`assets/password-hint-*.js`) is 1 659 662 bytes: the package entry pulls every English list, unused ones included, under the 4.5 MiB parse limit.
- A scratch walk of static `import` edges from every HTML entry and `service-worker-loader.js` never reaches the hint chunk on either build; its control finds `Input` from the onboarding entry. The page chunks that import it (change password, unlock method, the import forms, the file password section, the create flow) load lazily.
- The build regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json`; committed.
- Smoke e2e at retry 0 (`registration`, `onboarding-tab`, `security`): Chrome 16/16, 82.9 s; Firefox 16/16, 118.6 s. No scenario added.
- Captures (scratch spec, deleted after the run): nine lines on first-run Create profile at 720×900, light, Chrome; the longest line on Change password at 360×600.
- Timing, input event on the repeat to rendered hint: Chrome realistic 13-36 ms, 128 units 65-108 ms; Firefox realistic 36-66 ms, 128 units 94-120 ms. Firefox is over the plan's 50 ms realistic budget: D9 moves the budget to the 100 ms input-response bound instead of caching the factory, which would retain the password. Host load 17-53 on 188 cores.

## Implementation review, round 1

- Codex (gpt-6.1-sol, high): conditional approve, three findings, all verified: the base test's accented letter was decomposed (`e` + U+0301, checked with `od`), the rewrite had made it precomposed; D9's "both browsers meet 100 ms" was false at 128 units; three comments restated code. D9's design judged right: the public API has no prepared configuration, and scrubbing a cached factory relies on internals.
- Opus (general-purpose): conditional approve, D9 accepted (a cached factory scrubbed by a dummy check would still leave the repeat matcher's own scoring object holding the repeated chunk). Adopted: the typed warning table (`satisfies`, proven by a deliberate typo), two missing invariants in comments, the stale Architecture bullet. Declined: trimming the per-form tables (D7, the brief's per-tier values).

## Implementation review, round 2, and the final gates

- Codex (resumed): approve; no regression.
- After merging `origin/dev` (index line conflict only, both lines kept): lint, typecheck:all, test:all, both armed builds and the three smoke files on both browsers green at retry 0 (Chrome 95.5 s, Firefox 134.0 s; host shared with other lanes).
