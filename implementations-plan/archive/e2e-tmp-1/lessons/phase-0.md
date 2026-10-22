# e2e-tmp-1 phase 0: planning consults

- 2026-10-22, probe (driver): a `scripts/e2e/` unit test importing `import-drivers.ts` ran (import 3.8 s) and its "dir gone after the test" case failed on the base, `expected true to be false`: the self-test's red is demonstrated. The probe's own leaked dir was removed by name.
- 2026-10-22, probe (driver): Bun and Node `os.tmpdir()` both return a `TMPDIR` set after start, so the self-test can own its root.
- 2026-10-22, Codex r1 (gpt-6.1-sol, high, session `01a16436`): conditional approve. Kept D1 over both brief shapes. Found the self-test's base run red for the wrong reason (refusal first) and the `test.fails` case unable to prove it wrote; corrected counts and hook order. All accepted.
- 2026-10-22, Opus 5.5 r1 (Plan): conditional approve. Same red-gate flaw; prefix-filtered listing; TSDoc on lifetime and concurrency; scratch `TMPDIR` removed after counting. Accepted; a guard for calls from inside another `onTestFinished` hook not taken.
- 2026-10-22, Codex r2 (resumed): approve; recon's hook-order row aligned.
