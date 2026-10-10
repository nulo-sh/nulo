# Phase 1: arc 1 log

## Phase 1.1 (#88), 2026-10-09

- `projectStoredGrants` is exported through the existing `export { … } from "./capability-negotiation"` line in `packages/wallet-bridge/src/dispatcher.ts`, which `index.ts` re-exports with `export *`; same public surface as an `index.ts` line, one place listing the module's exports.
- Fixtures made well-formed: `{ type: "transaction" }` gained `scope: "*"` (`queued-journal.fixtures.ts`, `queued-journal.test.ts` twice, `background.connect-window.test.ts`); the composition round trip's `{ type: "data" }` gained `addressBook: true`. `{ type: "accounts" }` with no flag is well-formed and stayed.
- Red/green: the nine new cases fail on the base `service.ts` and `queued-journal.ts` and pass with the fix.
- The stored-row tests plant rows signed with the real MAC key (`plantRowSignedBy`); the schema keeps a row whose grant is any object, so a non-object record is a writer-only class.
- Gate 1.1: `bun run lint` 0; `bun run typecheck:all` 0; `bun run --cwd packages/wallet-bridge test` 663 passed; `bun run test` 10724 passed, 4 skipped.

## Phase 1.2 (#228), 2026-10-09

- `wireSessionTeardown` moved into `session-revocation.ts` and takes `{ sessionProfiles, pendingVerification }`; `background.ts` passes its `state`.
- The admission gate's `released` hook tombstones whatever marker the map holds for the id, so the replaced-marker barrier test releases the old slot and admits a new one for the same id before it swaps the marker; the gate's identity check (`reservations.get(r.id) !== r`) then keeps the old callback's `releaseIfUnstarted` off the replacement's slot. A replacement while the old slot is still held cannot happen: admission refuses a second window for a live id.
- `background.connect-window.test.ts`'s handler fake now lists each session with the origin and chain its discovery named, so revocation can match it; `fakeSdkServices` returns `onDappSessionDeleted`.
- `copy-dash-ban.test.ts` reads `terminateWith`'s argument as copy (it is not a log call by name): the new reason avoids the em dash rather than adding a reviewed entry.
- `handleSessionEstablished` hit cognitive complexity 19 with the recheck inline; two helpers bring it back under 15 without a suppression.
- Red/green: the eight never-happens cases (revocation table x3, establishment barriers x2, wiring x2, composition x1) fail on the base `session-revocation.ts`, `session-established.ts` and `background.ts`; the controls pass on both.
- Composition checklist (`apps/extension/tests/COMPOSITION-TESTS.md`): no PXE fake (D1), no simulate or prove (D2), no tx request or derivation (D3, D6), fake state is the handler's live list only (D4), assertions read the real stamp map, the real marker and the rows the real service purged.
- Gate 1.2: `bun run lint` 0; `bun run typecheck:all` 0; `bun run test` 10736 passed, 4 skipped (first run red on the dash ban, fixed as above).

## Post-implementation, round 1 (2026-10-10)

- Codex (gpt-6.1-sol, high, session `01a12317-f637-7cf2-98f6-641b7dd00df1`): **reject**. C1 High: exits before the stamp still terminated by id after an id reuse. C2 Med: D-impl-2 tombstoned a newer same-tab attempt's marker. C3 Med: termination's id-keyed cleanup ends another tab's attempt. C4 Low: the marker comment overclaimed isolation. Codex reproduced C1-C3 with in-memory probes.
- Opus review: approve with fixes, three Lows (O1 D-impl-2 untested, O2 = C1, O3 staleness at the recheck).
- Fixes: `terminate()` skips termination before the stamp when the map no longer holds the captured marker, and always terminates after it; the recheck reads `cancelled`; revocation tombstones only an unstamped channel's own-tab marker; the comment rewritten.
- Mutations, each red: always terminating (5 replaced-exit cases), never terminating a replaced stamped channel (the post-stamp case), tombstoning stamped channels (the new table row).
- C3 pushed back in round 2 as pre-existing and upstream (#127); recorded as a residual in plan.md § Arc 1.
- The first smoke run (`smoke-1`) started on the build before these fixes; smoke reruns on the final head.
- Round 2 (resumed): **approve**, one Low (the marker comment overclaimed); C3 judged non-blocking. Round 3 (resumed): **approve**, no findings. Converged.

## Phase 1.3 (e2e gate), 2026-10-10

- Smoke run 1 is void: it loaded the plain `bun run build` output, so `backup-migration.test.ts`'s fixture-arming contract failed, and the harness then stopped the backgrounded run. A local smoke run needs the source build `_extension-smoke-e2e.yml` makes (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`) and the run flags `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`; the plan's `bun run test:e2e -- --retry=0` alone is not enough.
- `e2e:agent` rebuilds `dist/chrome` with the network stamps, so it never runs while a smoke run in the same worktree reads `dist/chrome`.
- Host etiquette: until #169 merges, network files wait for no `nulo-e2e-*` row in `~/.agents/ports.md` and no live network vitest. A `pgrep -f` poll must bracket its pattern (`vitest[.]e2e[.]network`), or it matches its own shell and never sees a free host.
- The bracketed pattern is still not enough: a `claude -p` subagent whose prompt names `vitest.e2e.network` matches `pgrep -f` too, so the first 90-minute poll counted two permanent false positives. The poll that works anchors on the runner: `pgrep -f '^(bun|node) .*vitest[.]e2e[.]network'`. The host was genuinely busy through that first window (sibling lanes' network runs and `nulo-e2e-*` rows); a second window started with the anchored pattern.
- Smoke run 2 (armed source build, final head `089a541`, Chrome, `--retry=0`): 47 files passed, 3 skipped by their own gates (`passkey-toolbar-panel`, `_probe-console-capture`, `action-popup-layout`); 198 tests passed, 11 skipped; 1315 s.
- Third host window (anchored pattern) also stayed busy: `e2e-harness-gaps` held 5 `nulo-e2e-*` rows and a live network run throughout. `origin/dev` moved four commits and conflicted on `implementations-plan/index.md` (sibling lanes' lines), and a conflicted PR gets no CI run, so it was merged in (`45ea5c7`), keeping every line in order. Then lint 0, typecheck:all 0, test:all 0 (extension 10798, wallet-bridge 663).
- Smoke run 3 (merged head `45ea5c7`, armed source build, Chrome, `--retry=0`): 47 files passed, 3 skipped; 198 tests passed, 11 skipped; 1343 s.
- PR #254 CI on `45ea5c7`, all green: `quality-status`, `extension-smoke-e2e-status`, `extension-smoke-e2e-firefox-status`, `extension-network-e2e-status`, `extension-network-e2e-firefox-status`. Network Chrome (run 38020400979): 111 files passed, 6 skipped; 184 tests passed, 9 skipped. Network Firefox (run 38020400950): 110 files passed, 7 skipped; 180 tests passed, 13 skipped. Both ran at `NULO_E2E_RETRY: 0`. Each of the arc's seven network files passed on both: `cap-widening` (1 test), `scope-refusal` (2), `concurrent-sendtx` (1), `connect-verify-mismatch` (2), `session-profileSwitch` (1), `session-reconnect` (2), `connect-one-window` (1).
