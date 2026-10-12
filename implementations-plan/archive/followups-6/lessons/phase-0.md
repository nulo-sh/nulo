# Phase 0: planning log

## Recon (2026-10-12)

- Two sonnet Explore agents: the smoke-spec sweep for #317 and a reuse sweep for both issues. Findings in `../recon.md`.
- The #317 sweep agent wrote one grep output to a scratch file outside the worktree against its read-only brief; nothing in the worktree changed.
- Measured from a scratch script outside the repo: `DatabaseVersion.fromBuffer` on a non-JSON stamp throws `Failed to deserialize version information: SyntaxError: JSON Parse error: Unexpected identifier "not"` (Bun), and Aztec's `convertBigintsToStrings({ reason, error })` returns `{"reason":"stamp failed to parse","error":{}}`.

## Panel consults

- **Codex round 1** (gpt-6.1-sol, high, read-only; session `01a12de2`, default `~/.codex` login): reject. Refuted the planner's logger Fact 8 by reproducing Aztec's pino options against the installed pino (the browser build reads `browser.formatters`; the direct `convertBigintsToStrings` measurement exercised a path the browser never takes). Argued B for #317. Verified by the planner at `pino@9.14.0/browser.js:113`.
- **Opus Plan lens round 1** (Opus 5.5): conditional approve, kept A; repeated the wrong Fact 8 reading.
- Planner decision: D1 → B, on the one-interception-per-origin constraint (chain-endpoints D24) that leaves A no clean fix for `send-fee-privacy`, and on the stand-in being the existing design.
- **Codex round 2** (resumed): reject, one blocker (Home caps token rows at 3); holds B.
- **Opus round 2** (resumed): conditional approve; accepts B, withdraws its D7 check.
- **Codex round 3** (resumed): approve, no new findings.
- Gotcha worth keeping: measuring a library's formatter in isolation proves nothing about the build that ships; read which option the browser build actually consumes before claiming a log shape.

## Baseline artifact runs (before)

Base tree 58d6cbc's test code at c1d6377 (plan-only commit). Release-shaped copies built with no `VITE_*` variable and no `.env*` file (`bun run --cwd apps/extension build:<browser>`), copied under the lane's scratch root; no `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP` in either. Runs: `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy> bun run test:e2e -- --retry=0`, Chrome and Firefox started 20 s apart on one host.

### Chrome

- 2026-10-12, 02:39-03:02, 1380 s. **Exit 0.** Files: 47 passed, 5 skipped (52). Tests: 200 passed, 22 skipped, 0 failed.
- Skipped files: `_probe-console-capture` (env-gated probe), `action-popup-layout`, `egress-guard` (the control spec, unguarded artifact run), `migration` (no fixture declaration), `passkey-toolbar-panel` (Chrome-only skip outside CI). Partly skipped: `appearance` (1), `backup-migration` (2).
- Slowest files: `legal-acceptance` 198 s, `import-dead-rpc` 79 s, `passkey-retry` 77 s, `sw-resilience` 63 s, `snackbar` 56 s, `onboarding-tab` 54 s, `contacts-import` 50 s.
- `rows.test.ts`'s Tab walk on Home (production seeds resolved against the live node): `DIV → gas-label-public → gas-label-private → tokens-view-all → tokens-menu-trigger → tokens-card → tokens-card → tokens-card → activity-view-all → tx-card`.

### Firefox

- 2026-10-12, 02:40-03:13, 1944 s. **Exit 0.** Files: 49 passed, 3 skipped (52). Tests: 197 passed, 25 skipped, 0 failed.
- Skipped files: `_probe-console-capture`, `egress-guard` (control spec, unguarded), `migration`. Differences from Chrome are the browsers' own scoping: `action-popup-layout` and `passkey-toolbar-panel` run here; `import-dead-rpc` (4) and `sw-resilience` (5) skip their Chrome-only cases (`CHROME_ONLY`).
- Slowest files: `legal-acceptance` 250 s, `passkey-toolbar-panel` 148 s, `passkey-retry` 100 s, `onboarding-tab` 85 s, `contacts-import` 70 s, `send-keyboard` 69 s.

No red on either browser, so no classification rerun. Gate: both runs completed and recorded: **pass**.
