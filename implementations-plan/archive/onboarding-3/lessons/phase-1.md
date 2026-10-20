# Phase 1: the fast lane

- Gate: green on the first run (see STATUS.md, 15:22Z). Load1 was 135 at the Chrome start and 149.8 at the Firefox start.
- Deviation (tree wins): the Presto-step specs in `onboarding-tab` carried the only e2e proof of the plain-HTTP loopback fallback (`HTTPS refused + a detailed HTTP body` → `https-disabled`). That case moved to `settings-proving.test.ts`, against Settings › Proving, the same `usePrestoCheck`; the `presto-reachable` twin differs only in the body and stays covered by `presto-ui-state.test.ts` and `usePrestoCheck.test.ts`. The harness self-test stays in `onboarding-tab`.
- Deviation: `presto-host-permission` asserts focus on Settings' title, which had no testid; `SubPageHeaderBase` gained `data-testid="subpage-title"` beside its `subpage-back` (no visible change).
- Left as is (scope): with `onboarding/pages/presto.vue` gone, `copyFor`'s `"onboarding"` surface, the `<presto-banner>` custom-element allowance in `vite.config.ts`, and the CSP `style-src` hash pinned for the banner's shadow style have no production caller. Removing the hash is a manifest change, which this plan rules out; the close-out files one issue for the three.
