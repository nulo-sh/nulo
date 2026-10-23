# deps-audit-1: phase 1 (the two bumps)

All commands from the repo root on branch `deps-audit-1-a1`, before 21:01Z, so both installs used the scratch config.

- Base `bun run test:all` at `ef5336bbc`: exit 0, 198 s. Pass counts: extension 14707 (5 skipped, 7 todo), wallet-bridge 805, design 534, extension-messaging 429, aztec-runtime 414 (2 skipped), wallet-core 317, wallet-crypto 123, token-list-host 85 (3 skipped), landing 79, third-party-notices 66, legal 59 (1 skipped), token-list 33, wallet-sdk-schema-patch 15, resolve-asset 14.
- Scratch config: a fresh `cp bunfig.toml` plus one `minimumReleaseAgeExcludes` line; `diff` against the tracked file shows only that line.
- `bun update follow-redirects`: exit 0. Override `8.2.4`, `bun install --config=<scratch>`: exit 0. Override and the three floors `^8.2.4`, `bun install --config=<scratch>`: exit 0. The resulting diff equals the planning probe's.
- Gate: bunfig and ack-file diff empty; `bun.lock` 6 lines changed (4 ranges, the vite and follow-redirects entries), no `@alejoamiras/*` line; one `vite` line per manifest; both integrity strings equal the registry's `dist.integrity`.
- `rm -rf node_modules apps/*/node_modules packages/*/node_modules infra/*/node_modules`, then `bun install --frozen-lockfile` with the tracked `bunfig.toml`: exit 0. The store holds `vite@8.2.4`, `follow-redirects@1.16.1` and no older copy of either.
- `bun audit --audit-level=low --json` (exit 1) into scratch, then `audit-gate.ts --mode enforce`: exit 0, `41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`.
- `bun run lint` exit 0; `bun run typecheck:all` exit 0. Committed as `81e1e7303` (signed).
- Review round 1: Codex (session 01a15c4b) approve with fixes, Opus approve with fixes; records only, no dependency file changed (plan § Review verdicts).
- Review round 2: Codex approve; loop converged.

## OA-4 step 1: storybook 10.6.2 (2026-10-22, one core)

- Pin-then-restore: exact `10.6.2` in `apps/extension` (`storybook`, `@storybook/vue3-vite`) and `packages/design` (`@storybook/vue3-vite`), `bun install`, then `^10.6.2`, `bun install` ("no changes"). No age-gate refusal.
- `bun.lock`:
  - storybook, `@storybook/vue3-vite`, `vue3` and `builder-vite` move to 10.6.2;
  - `@storybook/csf-plugin`, its nested `unplugin@2.3.11` and vue3-vite's nested `typescript@5.9.3` leave, and a nested `magic-string@1.2.0` arrives;
  - `oxc-resolver` and its bindings go 11.24.2 → 11.21.2, storybook's exact pin; storybook is its only dependent.

  All 27 new integrity strings match the registry, and the four storybook packages carry SLSA provenance and no install script.
- `bun pm diff <pkg>@<old> <new>`'s side order is not fixed (Bun 1.4.2): storybook printed 10.6.2 on the `-` side, while vitest later printed 4.1.10 there. Read the direction from the `"version"` line. In storybook 10.6.2 the new `child_process`/`net` uses are:
  - the CLI tools SDK's `fork` of its own child host;
  - host-validation middleware (`net.isIP`);
  - a 127.0.0.1 loopback listener;
  - Windows-only `icacls` on `~/.storybook/instances`.
- Every `node_modules` removed, then `bun install --frozen-lockfile`: exit 0, and the store holds only the new versions. Audit gate: 41 acknowledged, 1 unacknowledged (`@vitest/mocker` 1242767), 0 stale, 0 unreadable.
- `build-storybook` (`apps/extension`; design has no script of its own): exit 0, with 217 index entries (182 stories, 35 docs) from all 36 story files, 8 of them design's.
- `typecheck:all` exit 0 covers the extension's 28 story files. Design's tsconfig excludes its stories and nothing checks `.storybook/*.ts`, so the build is their check.
- `lint` exit 0. Unit suites, one worker: design 538/538 (28 s); extension 906 files plus 3 skipped, 14996 passed, 5 skipped, 7 todo (1537 s).
- Codex r8: approve with fixes, records only.

## OA-4 step 2: vitest 4.1.12 (2026-10-23)

- `origin/dev` `0e4bec132` merged as `0fe71361a`: `index.md` is dev's file plus this lane's row, and dev's 21 commits change no dependency file, bunfig, vitest config or soak tool.
- Pin-then-restore over the 14 manifests that declare `vitest` (`^4.1.9` → `4.1.12` → `^4.1.12`), with no age-gate refusal and no exclude. The lock moves vitest and `@vitest/{expect,mocker,pretty-format,runner,snapshot,spy,utils}` 4.1.10 → 4.1.12 and nothing else. All 8 integrity strings match the registry, all carry SLSA provenance, none has an install script, and no 4.1.10 copy is left. storybook keeps its own exact `@vitest/*` 3.2.4.
- `bun pm diff`:
  - vitest: chunk renames plus a browser-mode Chromium GC workaround these suites never run;
  - `@vitest/mocker`: generated mock code escapes names with `JSON.stringify` (1242767), and a redirect must pass vite's `isFileLoadingAllowed` (1193683/1193684);
  - `@vitest/runner`: concurrent tests are capped at `maxConcurrency`, which reaches `proverless-guard.test.ts`'s `describe.concurrent`;
  - the rest: version only.
- The vitest entry leaves `audit-acks.json` (5 entries, 39 advisories) and its row leaves `SECURITY.md`. Every `node_modules` removed, then `bun install --frozen-lockfile`: exit 0. The gate in enforce mode reads 39 / 0 / 0 / 0. Committed as `b8f5c22fe`.
- The fixture-retry repro (e2e skill row 38) on 4.1.12 under Node fails both ways: the test-scoped retry reads `undefined`, and the file-scoped one rethrows the first error. #190 stays open (D14).
- Codex r9: approve with fixes, records only (plan reconciled, D14).
