# e2e-stores-1 — phase 3 (suites) and the review loop

## Suites, retry 0

- Network, Chrome (`NULO_E2E_PROVERLESS=1`, the five canary-job files excluded): exit 0 in 6,716 s (112 min, load1 120-240), 122 files passed, 6 skipped, 0 failed; 232 tests passed. Boot check: `node stores: 26 open, all inside <run dir>`; the run dir was gone afterwards.
- Network, Firefox (same selection): the agent tool stops a background command after 7,200 s, which ended the first run at 110 of 128 files (108 passed, 2 skipped, 0 failed) with `owned.json` left and every recorded pid dead. `bun run e2e:reap` then reported `sandbox reaped: true` and removed the 53 MB run dir, whose `tmp` held `archiver`, `aztec-world-state`, `p2p` ×4, `l1-tx-utils`, `sentinel`, `signing-protection`, `slasher`, `pxe_data`, `wallet_data`, a `cdb-ts-*.sock` and two `wsdb-*.log`: the killed-run half of the outcome, shown. The 18 files left then ran in 441 s: 13 passed, 5 skipped. Total 121 passed, 7 skipped, about 127 min.
- Smoke, Chrome (armed `build:chrome`, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`): exit 0 in 1,983 s, 61 passed, 9 skipped. Smoke, Firefox: exit 0 in 2,767 s, 65 passed, 5 skipped.
- Run a suite longer than about 100 min locally as two commands (`--shard`, or the files left), each under the tool's two hours.
- The armed Chrome build started at load1 155, above the host's 150 rule; nothing else did.

## Review loop

- Codex r1 (gpt-6.1-sol, high, read-only; session started on the net diff from `5711a1bc3`): `findings: 4`, low. Opus 5.5 (general-purpose, read-only) beside it: `findings: 6`, low or nit. Dispositions in plan.md § Audit verdicts. Two known limits to file closed at close-out: the budget refusing a bare run that would adopt a node, and a pid reused between the `/proc` scan and the fd read.
- Codex r2 (resumed): `findings: 1`, a comment wording, applied. Codex r3 (resumed): `clean`.
