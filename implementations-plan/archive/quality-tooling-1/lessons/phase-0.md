# Phase 0 — planning log

- 2026-11-03: recon by two Sonnet explorers (release I/O; tsconfig consumers); findings in `recon.md`.
- 2026-11-03: base `bun run test:release`: 334 pass, 7 fail (`zip-read`, `zip-reproducible`); this host has no `zip` binary.
- 2026-11-03: `bun run audit:dup` base: 1548 clones, 21216 duplicated lines (3.36 %); jscpd at `--min-tokens 50` finds no production clone under `scripts/release`.
- 2026-11-03: Codex r1 (gpt-6.1-sol, high, read-only; session 01a19ecf…): conditional approve, six findings. Accepted all but one: `isolatedModules` stays in the base as a named convergence (D11), argued back in r2.
- 2026-11-03: scratch probe: Bun applies a workspace tsconfig's `paths`, through `extends`, to a bare import at run time (a base-held alias redirected `pkg` to another file). Drives D9's standalone token-list configs.
- 2026-11-03: scratch probe: Bun's `$` resolves `gh` through `process.env.PATH` at call time, so a test can put a fake `gh` script first on `PATH`.
- 2026-11-03: Opus r1 (Plan agent): conditional approve, 21 findings; all accepted. D1 reshaped to `githubHeaders` + `refusal`; D8 and `ensureLabel` dropped; a closure test pins the builtins-only rule; a non-JSON 400 pin keeps Firefox's RECOVERY text.
- 2026-11-03: `w3-ci-1` merged as #1583 during the audit; the branch fast-forwarded to `a0458e21a`, so arc 2 no longer waits.
- 2026-11-03: Codex r2 (resumed): conditional approve. `tsc --showConfig` adds the `preserveConstEnums: true` that `isolatedModules` implies and reorders keys under `extends`, so the resolved-config gate compares parsed JSON and allows both D11 differences. D11 accepted as a named diagnostic convergence; its runtime claim narrowed.
- 2026-11-03: Codex r3 (resumed): approve, no new finding.
