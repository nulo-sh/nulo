# fu2-onboarding-1: phase 1 (arc 1, Ready's line and Back)

- **Reproduction (#1515), Chrome, base `1e6c5bc1f`:** the password scenario's new Back step failed with `waitForHash: #/onboarding/done not reached in 10000 ms; the page is at "#/onboarding/create"`.
- **Red on base:** `done.test.ts`'s line test (no line testid, old text) and its refused-Back test (`expected false to be true`: the pop was not aborted). The control (Back between two unguarded pages) passed on base and after.
- **jsdom harness:** each test's hash history keeps its `popstate` listener on the window until `destroy()`, so a later test's Back was answered by an earlier router and landed on the wrong route. The test file destroys every history it made in `afterEach`.
- **A guard on Ready also refuses a push off Ready**, so the first control (push Welcome from Ready, then Back) was red after the fix by design; the control now goes Back between Create and Welcome.
- **Wall-clock**, `onboarding-tab.test.ts` alone at retry 0 (host load average about 155): Chrome 46.0 s before, 46.8 s after; Firefox 71.0 s, 76.1 s. The password scenario itself: Chrome 8.9 s, 9.6 s; Firefox 14.2 s, 14.3 s.
- **Commit signing hung once** on the SSH agent; `env -u SSH_AUTH_SOCK git commit` signed at once.
