# Phase 3 and the review loop

- The crash e2e first asserted that the popup kept open beside the check window stayed on `#/popup/general`. Strict mode (the default) sends an open popup to the unlock screen when its port reconnects to a successor, so that assertion passed only by arriving first. It now waits for the successor's heartbeat, then the unlock screen, then unlocks back to Home: the successor served it.
- Mutation checks on the unit rows: removing `wireRestartPreparation`'s registration, the tracker's navigation update, or its forget-on-close each turns exactly one row red.
- **Loop round 1, Codex (`gpt-6.1-sol`, high, session `01a15977…`): approve**, two low findings: the crash e2e's popup assertion did not prove the successor served it; the preparation header narrated its body and the route list carried a comment restating it. Both accepted.
- **Opus diff review (beside round 1): conditional approve.** The same popup assertion; a forget-on-close row and a navigate row that could not fail (the fake fires no `onRemoved` for a dead id; both routes were in the set); no unit row proved the registration in `initWalletSdkHandler` or that no row is deleted; three comment nits. All accepted: the rows were rewritten, `background.restart-preparation.test.ts` drives the booted wiring.
- **Loop round 2, Codex (resumed): approve.** No new material finding. Converged.
