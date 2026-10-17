# Phase 9: real browsers

- The sweep's grant waits for the decoded `amount` parameter, not `execute-grant-amount`: the type-role sweep never imports the playground token, so the grant reads as its parameters, as a contract the wallet has not registered as a token does. The token form is pinned by `OperationCard.authwit.test.ts`.
- This suite's `waitForSelector` resolves `null`, never a handle (`tests/e2e/fixtures/journal-page.ts` says so): read after the wait with `$eval`. The first lifecycle run failed on `amount?.evaluate`, which read `undefined`.
- Reading the completed operation broke every grant whose fee is still unchosen, which is every playground grant at open, and no unit test saw it: the fake stood in for the interaction service. The service test now drives the real one. A fix that moves a service boundary needs a browser run before the next review round.
- Runs: one `e2e:agent` at a time, each started at load1 < 150, `--retry=0`; the four quick files proverless, the two canaries prover on.
- At `f0ab5dd6` (dev merged), all pass. Per file, CI before (#594's run, attempt 1) and local after (one run each, loaded host, so the two are not comparable; this PR's CI gives the after):

| File | Chrome before | Chrome local | Firefox before | Firefox local |
|---|---|---|---|---|
| `type-roles-windows` | 91.3 s | 154.8 s | 139.5 s | 176.3 s |
| `authwit-lifecycle` | 65.2 s | 85.9 s | 70.0 s | 98.0 s |
| `authwit-consume-smoke` | 25.1 s | 40.0 s | 37.7 s | 46.9 s |
| `snack-placement` | 483.0 s | 512.8 s | 510.6 s | 563.0 s |
| `frozen-account-canary` | 76.3 s | 101.1 s | 69.9 s | 251.5 s |
| `passkey-execution-canary` | 57.1 s | 83.2 s | 63.3 s | 219.1 s |
