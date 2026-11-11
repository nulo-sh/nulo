# Phase 1: the step's chevron

- `execute-op-step-toggle` is `StepRow`'s stretched `RowTarget`, a sibling of the sentence, not its parent: the e2e reads the chevron and its last word from the step, `execute-op-summary-call`.
- Red on base (base `SendTxSummary.vue` with only the testid added, armed builds): `batch` at 400 px, step 2's chevron at 674.8 (Chrome) / 674.9 (Firefox) while its last word `0x1e6f12..7a8b` ends on the line at 652.8 / 653.1.
- Base timing of the touched smoke specs (execute-steps, type-roles, rows, home-links, token-list, shipped-token-list), retry 0: Chrome 330 s green; Firefox 472 s with type-roles' two reds, #1763 (Senders swept before its list settles; the second red is its coverage cascade), pre-existing on base.
- Arc 1's gates at `933f8fb27`, once, in order: `lint` 7 s, `typecheck:all` 64 s, `bun run --cwd apps/extension test` 237 s (1,029 files), `test:components` 10 s (101 files), all exit 0; armed builds, then `execute-steps.test.ts` green at retry 0: Chrome 47.6 s (base 42.9 s), Firefox 84.7 s (base 67.8 s), on a host at load ~200 of 188 cores.
- Codex fix loop, round 1 (session `01a1cb7f`, gpt-6.1-sol, high): approve, no material findings.
