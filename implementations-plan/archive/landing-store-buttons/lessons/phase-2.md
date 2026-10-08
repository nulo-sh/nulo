# Phase 2: delete the release coupling

## Gate

- `bun run --cwd apps/landing build` (from a clean `dist/`): exit 0. `prebuild` now runs only `build-legal.ts`; the log names no GitHub request. `dist/index.html` holds no `{{`.
- `bun run --cwd apps/landing typecheck`: exit 0. `bun run --cwd apps/landing test`: 4 files, 60 tests passed (the release-resolver file is gone).
- `bun run test:ci-gating`: 334 pass, 0 fail. `bun run lint:actions`: exit 0. `bun run lint`: exit 0, 27 warnings as on the base.
- `! git grep -nE 'fetch-latest-release|ensure-release-json|release-html-plugin|release-resolver|release_url|chrome_zip_url|shasums_url|\{\{version\}\}|src/generated/release' -- . ':!implementations-plan'`: exit 0 (no match).
- `bun install --frozen-lockfile`: exit 0; script-only `package.json` edits leave the lockfile alone.

## Notes

- The deleted fetch failed for real during Phase 1: `GitHub API 403 rate limit exceeded` on this shared host, which is the failure mode the `aztec-update` skill warned about.
- CI's `build-landing` now runs `bun run build`, the same command production runs, instead of a stub step plus `vite build`. No `scripts/ci-cd/**` test pinned the old steps.
- The Vite warning about an extensionless `./scripts/headers` import under `configLoader: 'native'` predates this change and is left alone.
