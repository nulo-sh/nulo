# Phase 4: the four dead paths

- UI check, not committed: a scratch test mounted `Header` with the suite's props and captured `html()` at rest, after a network-status change and after an error log, plus `cacheStore.failureLog`. Base and branch outputs are byte-identical (`cmp`).
- The committed badge test drives the log bus (Info leaves the badge null, Error red, Warn yellow, cleared at 60 s); it passes on the base Header too.
- `scripts/type-roles/inventory.test.ts` pins a SHA-256 of `dispatcher.ts` under three producers in `identifier-sites.expected.json`, so any edit to the dispatcher needs "re-attest, then re-pin". The removed `aztec_createAuthWit` arm is in `buildAccountOperation`, not a `send_transaction` producer; the hits and evidence still match, and only the three digest lines change (D12). That JSON is in type-roles-coverage's hold: a one-value change, but the orchestrator should sequence the two PRs.
- The expiry test fakes `Date` only; with the eviction removed from `isExpired` it fails, so the read-back on the real clock proves the eviction.
- `SessionManager` keeps `runExclusive` optional (tests build it without the facade); its doc no longer claims those paths skip the alarm.
