# Phase 5 — tooling and config

## Changes

- *97.* `aztec-update/SKILL.md`: one shard per checkout, never two `e2e:agent` runs in one worktree
  (each rebuilds and owns that worktree's `dist` and `.e2e-state/`, and its global setup `pkill`s the
  Chrome loaded from that `dist`), pointing at the e2e-testing skill's § Hazards.
- *102.* `.storybook/main.ts`: `dirs: ["src/components"]`. Checked in `@storybook/builder-vite`
  10.5.8: the Vite root is `resolve(options.configDir, "..")`, the app's directory, so the old
  `../src/components` pointed at `apps/src/components`. `.storybook/preview.ts`: `chrome`,
  `chrome.runtime` and `chrome.storage` are each filled with `??=`, so a present member is left alone.
- *119.* `pages-options.ts`: `**/.*/**/*.test.*` and `**/.*/**/*.spec.*`, and one header sentence. A
  micromatch probe (the plugin's own copy) showed the limit the comment states: the variants match a
  path with ONE dot-directory (`/a/.claude/wt/s/…/x.test.ts`), not two (`/h/.cache/a/.claude/…`);
  `**` never crosses a dot segment. One is the agent-worktree layout. The new watcher test builds its
  root under `mkdtemp(tmpdir())/.worktrees/ext`, so it assumes the temp dir itself holds no
  dot-directory (true for `/tmp` and macOS's `/var/folders/…`).
- *133.* `apps/landing/vite.config.ts` imports `./scripts/headers.ts`; `tsconfig.json` sets
  `allowImportingTsExtensions`.
- *144.* `test-soak/cli.test.ts`: `90_000` on the five cases that had none, with one comment above
  the loop saying why; `hang` keeps `30_000`. A named constant was tried first: Biome's formatter
  keeps the `}, <timeout>)` test-call shape only for a numeric literal and reflowed every case for an
  identifier, so the pre-commit hook refused it.
- *146.* `src/e2e/config.test.ts`: one `FRESH_IMPORT = { timeout: 30_000 }` passed to both
  `describe`s, with the why. Assertions unchanged.

Deviation (form only): `config.test.ts`'s budget is one named options object passed to both
`describe`s, carrying the one-sentence why, instead of two literals.

## Gate runs (2026-10-09)

- Watcher case against the OLD `exclude`: fails (`expected true to be false`, the test module was
  routed); with the new globs: passes. `bun run --cwd apps/extension test -- pages-options e2e/config`:
  2 files, 11 tests, pass.
- Landing: `bun run --cwd apps/landing build` exits 0 with no config-loader warning;
  `bun run --cwd apps/landing typecheck` passes; `bun x vite build --configLoader native` (outDir in
  the lane's scratch dir) succeeds, and the same command on the base config fails with
  `ERR_MODULE_NOT_FOUND … apps/landing/scripts/headers`.
- Storybook: `build-storybook` exits 0 on the base config and on the fixed one. A throwaway Puppeteer
  pass (Bun static server over each `storybook-static`, one page per story, 176 stories) recorded
  unresolved components and every error. A production Vue build does not warn "Failed to resolve
  component" (that warning is dev-only), so the probe counts the unknown elements an unresolved
  component renders as instead.
  - Before: `popup`, `popupcard`, `popupheader` unresolved in all 7 `composite-formpopup--*`
    stories; `composite-capabilitydetailpanel--contracts-explicit-list` fails to render with
    `RpcConnectError: Cannot open a port to 'contact': Cannot read properties of undefined (reading 'connect')`;
    `/favicon.ico` 404 (the browser's own request, first story only).
  - After: no unresolved component, no `chrome.runtime`/`chrome.storage` error, the capability panel
    story renders; the only message left is the same `/favicon.ico` 404. No message is new.
- `bun run test:ci-gating`: 413 pass, 0 fail (24 files). `bun test scripts/ci-cd/test-soak/cli.test.ts`
  on the final literal form: 14 pass. `bun run lint` and `bun run typecheck:all`: pass.

## Gate (2026-10-09) — pass
