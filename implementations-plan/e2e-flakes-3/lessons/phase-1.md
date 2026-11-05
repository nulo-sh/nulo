# e2e-flakes-3, phase 1: the setup-tab count reads `chrome.tabs`

Base: `origin/dev` at 5f95ea108. Armed smoke builds for both browsers (`VITE_NULO_E2E_MIGRATION_FIXTURE`, `VITE_NULO_E2E_TOKEN_SEEDS`, `VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM`, `VITE_NULO_E2E_CSP_REPORT`, as `_extension-smoke-e2e.yml` builds), then from `apps/extension` with `NULO_E2E_CSP_REPORT=1 NULO_E2E_MIGRATION_FIXTURE=1`, retry 0.

- `bun run lint`, `bun run typecheck:all`: exit 0.
- Control (throwaway `bidi-attach.ts` edit dropping every BiDi event naming `src/onboarding/index.html`, `-t "brings that tab forward"`), Firefox: green in 8.8 s with 7 events dropped. The same control on the old count failed with CI's message (lessons/phase-0.md).
- `tests/e2e/onboarding-tab.test.ts`, whole file, Firefox 158.0: 10 of 10 green, 69.5-78.5 s per run (median 74.7 s).
- The same, Chrome: 5 of 5 green, 40.7-47.5 s per run (median 43.9 s).

The runs are regression checks. CI's trigger never reproduced locally, so the control is the proof. The change adds no scenario. The count now runs one `chrome.tabs.query` per poll through the control page, where it used to read Puppeteer's in-memory target list.

Deviation: `tests/e2e/FIREFOX.md`'s new-tab row called this spec's `targets()` wait "no failure seen"; it now names the `chrome.tabs` count and ledger row 69 (plan.md, D8).
