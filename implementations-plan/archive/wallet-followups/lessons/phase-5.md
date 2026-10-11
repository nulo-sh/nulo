# Phase 5: arc gate, screenshots, post-implementation loop

## Post-implementation loop

- **Codex** (gpt-6.1-sol, high, read-only; session `01a12864-2180-7353-8176-0f6447117873`). The managed environment sets `CODEX_ACCOUNT=best`, so `run-codex.sh` ran on the `alejo-icloud` roster home rather than the default `~/.codex` login the brief names; the host's `approve-for-me` sandbox opt-in applied, and nothing was written. Round 1 on `af4afcc..e78a4af`: approve with fixes, three low findings (plan.md § Audit verdicts); folded in `d9ccd23`. Round 2 on that fix: clean. Round 3 on the Opus folds (`c9baef8`): clean.
- **Opus** (general-purpose, read-only), beside Codex round 1: no defect; two low findings folded in `c9baef8`, one rejected (a debug log line the plan rules out), one bookkeeping note already handled.
- The build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` when a composable is added under `src/composables/`; they are tracked, so they ship with the composable (`b7410c9`).

## Screenshots

Taken by a scratch smoke spec outside the repo (`forms.shot.ts` + a config spreading `vitest.e2e.config.ts` with `test.dir` set to the scratch directory and `root` set to `apps/extension`): New account with a name of three spaces, and Edit account on "Account 1" with "Main " typed beside an account named "Main". "Before" from an armed build whose two popups were the `af4afcc` copies, "after" from the head build. Before: Create and Update account enabled, no warning. After: Create disabled; "Already exist" shown and Update account disabled.

## Arc gate (head `c9baef8`)

- `bun run lint` 0, `bun run typecheck:all` 0, `bun run test:all` 0 (every workspace green; extension 736 files, 11,147 tests).
- Smoke, whole suite, Chrome, retry 0, armed head build: 210 passed, 10 skipped, 1 failed. The failure is the navigation case's `clickBelowBar` 5 s wait for the compact title bar's opacity (`navigation.test.ts:182`), the signature of open known flake #269; the branch changes only the hub's config read on that page. Diagnosed as #269 (occurrence commented there), it got its one rerun: `tests/e2e/navigation.test.ts` on the same build, retry 0, 5/5.
- Smoke, whole suite, Firefox, retry 0, armed head build (`c9baef8`): 208 passed, 13 skipped, 0 failed (the four restart rows are Chrome-only and skip there, as the Lock case did).
- `origin/dev` moved during the gate (#282, `forms-and-contacts` arc 2): no file overlap with this arc; its `index.md` change is its own line, `lessons.md` untouched; merged without conflict (`fa2b5fe`). On the merged head: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test:all` 0 (extension 737 files, 11,160 tests); network `tests/e2e/network/fee-sponsor-funding.test.ts` through `e2e:agent`, Chrome, `NULO_E2E_RETRY=0`: 2/2. The two smoke suites ran before the merge; #282's own PR ran them on its change.
