# Phase 1: the source and the lanes

- Codex r1 over the draft plan (gpt-6.1-sol, high): `approve with changes`, design (a). Its three findings and the D3 call are in the plan's Audit verdicts and ledger.
- The base sets came from a `git archive` of `c0eb5d072` with that commit's own `behavior-gating.test.ts` plus one appended dump test, run in a scratch directory outside the repository; the rest of that file's tests are irrelevant there (one needs `apps/extension/tests/e2e`, which the archive left out).
- `bun run test:release` on this host: 370 pass, 7 fail, every failure `Executable not found in $PATH: "zip"` in `scripts/release/zip-*.test.ts`. The host lacks `zip`; this plan touches nothing under `scripts/release/` or `scripts/publish/`, and CI's runners carry `zip`.
- Planted mutations of the source, each reverted: dropping `packages/wallet-core/package.json` and adding `docs/**` each red the source test, the derivation test and the fixture test.
