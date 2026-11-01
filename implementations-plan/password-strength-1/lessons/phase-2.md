# Phase 2: builds, e2e, captures

- Armed builds, Chrome and Firefox: exit 0. `THIRD-PARTY-NOTICES.txt` lists the five packages and carries `language-en`'s ODC-BY notice. The hint chunk (`assets/password-hint-*.js`) is 1 659 662 bytes: the package entry pulls every English list, unused ones included, under the 4.5 MiB parse limit.
- A scratch walk of static `import` edges from every HTML entry and `service-worker-loader.js` never reaches the hint chunk on either build; its control finds `Input` from the onboarding entry. The page chunks that import it (change password, unlock method, the import forms, the file password section, the create flow) load lazily.
- The build regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json`; committed.
- Smoke e2e at retry 0 (`registration`, `onboarding-tab`, `security`): Chrome 16/16, 82.9 s; Firefox 16/16, 118.6 s. No scenario added.
- Captures (scratch spec, deleted after the run): nine lines on first-run Create profile at 720×900, light, Chrome; the longest line on Change password at 360×600.
- Timing, input event on the repeat to rendered hint: Chrome realistic 13-36 ms, 128 units 65-108 ms; Firefox realistic 36-66 ms, 128 units 94-120 ms. Firefox is over the plan's 50 ms realistic budget: D9 moves the budget to the 100 ms input-response bound instead of caching the factory, which would retain the password. Host load 17-53 on 188 cores.
