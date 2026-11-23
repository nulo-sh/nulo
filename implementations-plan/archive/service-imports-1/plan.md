---
plan: service-imports-1
tier: light
status: completed
issues: "#1937"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: no explorer (the recon is the generated tables below); one Codex gpt-6.1-sol high pass over the plan and the completed diff, then targeted verification
base: origin/dev at 7a766e676
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-23. Planned and delivered as one arc.
- **Status:** completed. The arc and this close-out ship as one PR into `dev`; its merge archives this plan and closes #1937.
- **Shipped:** every non-test module under `wallet/services` names a sibling service by its spec constant and types it through `import type`; values a sibling's `spec.ts` defines come from it; the dropped-send cadence constants live in `transaction/inclusion.ts` and the integrity coordinator's name in `account-integrity/types.ts`; the task module's cycle is gone and `bun run lint`'s cycle step covers all of `wallet/services`.
- **Review:** Codex r1 `clean` (Audit verdicts); nothing to verify.
- **Gates:** G1 to G3 green at `5f5ca9c67` and again after merging `origin/dev` (`4d62d8c92`); the PR's five required checks certify the e2e layer.
- **Dropped:** the brief's move of `primaryEndpointUrl` (it already lives in `network/spec.ts`, F5); a permanent pairing test (D7).
- **Known limits:** none.
- **Open items:** none. The `wallet/logger` import cycle the scan saw lies outside this lint and has no traced consequence.
- **Lessons:** none promoted: `lessons.md` sits at its budget, and the cycle rule's semantics are already in `apps/extension/tests/e2e/README.md`.
- **Seeds retired:** the `/goal` and `/loop` below are a record, not an instruction.

# service-imports-1: sibling services are named by their spec constant, not their implementation

A service module value-imports its siblings' `service.ts` to read `<X>Service.name`, an enum or a helper the sibling's `spec.ts` already exports, so loading one service loads its siblings and their collaborators, and the cycle lint covers two directories only (#1937). This plan makes the spec constant plus `import type` the one idiom #1442 began, moves the three exports that live in an implementation module to leaves, and widens the cycle lint to every service. UI impact: none.

## Outcome & Quality Bar

- **For whom**: the maintainer adding the next dependency between services, and the reviewer of that change.
- **Excellent**: (1) no module under `wallet/services` value-imports a sibling's `service.ts` or `coordinator.ts` unless it constructs that service; (2) the cycle lint covers all of `wallet/services`, so a new value edge that closes a cycle fails `bun run lint`; (3) every startup name and order is provably unchanged (generated tables, base against head).
- **Good enough**: type-only imports keep pointing at `service.ts` (erased at build); no typed `ServiceCollection.get` (D7).

## Assumptions

Facts checked at `7a766e676` with a TypeScript-checker scan (a scratch script, not committed; its tables are in the PR body).

- **Facts**:
  - F1: 149 `<X>Service.name` / `<X>Coordinator.name` reads in 26 non-test files under `wallet/services` (the brief said 142, the issue 141; the scan also counts `task/test-task-service.ts`). Every service's `spec.ts` exports `<X>_SERVICE_NAME`, which its class's `static name` holds.
  - F2: 110 `services.get` calls, 12 real `dependencies` arrays. The scan pairs each call's name with the class whose `static name` holds it and checks that class is assignable to the instantiated type and that type to the field: all pair at base but one, `execution/service.ts` `interactionOperations()`, already read by constant and untouched here: its view type adds `start(): Promise<void>` only to satisfy `IService`, which the real `start(services)` does not match, and nothing calls `start` on it.
  - F3: 276 cross-directory value edges inside `wallet/services`; 122 of them reach a sibling's `service.ts` / `coordinator.ts`.
  - F4: biome's `noImportCycles` (2.5.13) ignores `import type` but counts `import { type A }` as a value edge. Widened to all of `wallet/services` it reports one cycle only: `task/service.ts` ↔ `task/wrapped-task.ts`, import-only (`EmptyResult`, `TaskStatus` taken from `./service`, which re-exports `./spec`). Lint wall-clock at base: 3.8 s for the current paths, 3.2 s widened (load1 ≈ 130).
  - F5: `networkInfoFrom`, `findPrimaryEndpoint` and `primaryEndpointUrl` already live in `network/spec.ts`; the brief's "`primaryEndpointUrl` moves to a leaf" did not hold, so it only changes importers. `isSeedEndpointUrl` lives in `network/seeds.ts`. `OriginType`, `TxStatus`, `AccessLevel`, `AccountType`, `FpcType` and the task content classes live in their service's `spec.ts`, re-exported by `export * from "./spec"`.
  - F6: three exports live in an implementation module: `DROPPED_RESURRECTION_WINDOW_MS` and `DROPPED_RECHECK_INTERVAL_MS` (`transaction/service.ts`, read by `operation-journal/send-check.ts`) and `ACCOUNT_INTEGRITY_COORDINATOR_NAME` (`account-integrity/coordinator.ts`, read by `network-reset/service.ts`).
  - F7: `wallet/runtime.ts` value-imports every service module it constructs, so removing a sibling edge never unloads a module; no service module has top-level side effects beyond class definitions (scan: no non-declaration top-level statement).
  - F8: no non-test file under `wallet/services` constructs, `instanceof`-tests or calls a static member of a sibling service; the one construction is `wallet-sdk/queued-journal.fixtures.ts` (`new OperationJournalService`).
- **Inferences**: I1: after the change, the only value edge to a sibling implementation is F8's fixture. I2: `tsc` refuses any `import type` binding still used as a value, so a missed value use cannot ship.
- **Asks**: none.

## Architecture & Implementation

- **Idiom**: `services.get(PROFILE_SERVICE_NAME)` into a field typed through `import type { ProfileService }`; `dependencies` arrays list the same constants in the same order. Values that live in a sibling's `spec.ts` (F5) are imported from it. Statement-form `import type`, never inline `{ type X }` alone (F4).
- **Moves**: the two `DROPPED_*` constants, with their comment, to `transaction/inclusion.ts`, beside `FINALITY_READ_INTERVAL_MS`, which `send-check.ts` already takes from it (D2); `ACCOUNT_INTEGRITY_COORDINATOR_NAME` to `account-integrity/types.ts` (D3). No re-export at the old sites; five test files change only their import lines.
- **Cycle**: `task/wrapped-task.ts` takes its two values from `./spec` and `TaskService` as a type.
- **Lint**: the root `lint` script's `noImportCycles` paths become `apps/extension/tests/e2e apps/extension/src/wallet/services`.
- **Comments**: `token/service.ts`'s "Depending on that service for it would be a cycle" goes (D6); the profile and incoming-transfer comments stay.
- **Edits stay in import blocks and the `services.get` / `dependencies` lines** (collisions with `harden-security-fixes-5` arc 2 and `wallet-followups-9`).
- **Alternative not taken**: redirect only `.name` reads. The other values keep the edge to the implementation (F3), so the graph would not shrink.

## Phase 1: the idiom, the moves, the lint ✓

1. Convert the 26 files of F1, plus the non-service modules under `wallet/services` that take a spec value from a sibling `service.ts` (F5).
2. Move F6's exports; fix every importer; break F4's cycle; widen the lint; edit the token comment.
3. Commit: `refactor(services): name sibling services by spec constant, not by implementation`.

Validation gate (one at a time; none above load1 150):
- G1: the scan at head: dependency arrays and `services.get` names identical to base, row for row; every pairing as at base; cross-directory value edges and edges to implementations fewer, no edge new to an implementation; no cycle in `wallet/services`; every service module still reached from `wallet/runtime.ts`.
- G2: `bun run typecheck:all`, `bun run lint` (wall-clock of the cycle step), `bun run test`, `bun run test:all`, at retry 0; `bun run check:plans` after staging.
- G3: the widened lint fails on a scratch cycle through `@/` paths between two services (reverted, never committed).
- Layers: typecheck, lint, unit and composition tests. E2E is the PR's five required checks; no local run (the brief).

## Security & Adversarial Considerations

- **Threat model**: none new. No trust boundary, input, storage, permission or message shape changes; the attacker-relevant risk is a wiring error that starts a service with the wrong collaborator, which G1 proves absent.
- **Side effects**: an `import type` that dropped a module needed at load would change startup; F7 and G1's reachability row rule it out.
- **Cryptography, supply chain, least privilege**: untouched; no dependency added.

## Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Redirect only `.name`, or every value a sibling's `spec.ts` already exports | every such value | the edge to the implementation stays otherwise (F3), and the issue names constants too |
| D2 | `DROPPED_*` home: `transaction/inclusion.ts` or `transaction/spec.ts` | `inclusion.ts` | how long and how often a dropped send is re-asked, beside the finality cadence `send-check.ts` already imports from it; `spec.ts` would spare three test imports via the existing `export *` but holds the wire contract, not polling cadence |
| D3 | Coordinator name: new `spec.ts` or `account-integrity/types.ts` | `types.ts` | a leaf the coordinator already imports; one constant does not earn a new file |
| D4 | Point type-only imports at `spec.ts` | no | erased at build; churn in files other lanes edit |
| D5 | Widen the lint to all of `wallet/services` | yes | one import-only cycle at base (F4), fixed here |
| D6 | Which cycle comments go | token's second sentence only | it records a module cycle with `execution/service.ts`, which now imports `TokenService` as a type; profile's and incoming-transfer's record startup-order constraints (`topologicalPhases`) that still hold |
| D7 | A permanent test pairing name and type | no | the pairing needs the type checker; a typed `ServiceCollection.get` is a wallet-core contract change beyond this lane; the scan is the proof here |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, the plan and the diff from `7a766e676`): `clean`. It compared the 46 changed service files independently (executable code equivalent after the imports, the 149 substitutions and the three moves), confirmed the 110 lookups and the dependency arrays, found no stale consumer of a moved export in popup, Vue, test, package or script code, ran its own graph scan over 908 source files (no service cycle, no dynamic import in services), and judged D1 to D7 and the comment edits sound.

## Implementation record

- Phase 1 (`41ade3357`, pins `5f5ca9c67`): 46 files; the transform was mechanical (a scratch script rewrote each sibling import, `tsc` refused nothing). The two moves and the task cycle by hand.
- G1 (the scan, base `7a766e676` against head): 12 `dependencies` arrays and 110 `services.get` rows identical in file, target, name, instantiated type and verdict; `<X>Service.name` reads 149 → 0; cross-directory value edges 276 → 265, to a sibling implementation 122 → 1 (`wallet-sdk/queued-journal.fixtures.ts`, which constructs `OperationJournalService`), implementation to implementation 96 → 0; 110 new edges, every one to a sibling's `spec.ts` or `account-integrity/types.ts`; sibling implementations an implementation loads transitively 149 → 0; cycles in `wallet/services` 1 → 0 (the one left in `src`, `wallet/logger`, is outside the lint and untouched); the 215 service modules `wallet/runtime.ts` reaches, identical.
- G2: `bun run lint` 0 (7.3 s; the cycle step 4.7 s over all of `wallet/services` against 3.8 s over the two directories, at load1 ≈ 150); `typecheck:all` 0; `bun run test` red at retry 0 on two content pins the shifted import lines moved: six line citations of the profile chaos harness (`tests/e2e/helpers/profile-chaos/model.ts`) and the type-roles inventory's digest of `auth-registry/service.ts`, whose producer lines are unchanged (re-attested, re-pinned). After the fix `test:all` 0 (extension 1050 files, 18861 tests), `test:ci-gating` 0 (755).
- G3: a scratch value import of `token/service.ts` from `wallet/storage/stores.ts` (outside `services`) and one from `network/spec.ts` each made the widened step report `noImportCycles`; both reverted.
- Tests that changed imports only: `transaction/service.dropped.test.ts`, `operation-journal/send-check.test.ts`, `execution/service.composition.test.ts`, `network-reset/service.test.ts`, `network-reset/service.composition.test.ts`.

## Delivery

One arc, one PR, no stack: `worktree-service-imports-1` → `dev`, `gh pr create`, ready for review, after the Codex pass and its verification. Title (81 characters): `refactor(services): name sibling services by spec constant, not by implementation`. Body: what changed and why; the generated tables (names and order, pairings, edge counts) base against head; the value import kept and why; the lint's wall-clock before and after; the five import-only test edits and the two re-pinned content pins; each gate with its outcome; "No visible change."; `Closes #1937`. No label: the diff trips every extension lane, and those five required checks are the e2e evidence.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `7a766e676`, as bounded work: one Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and the diff from `7a766e676`, then targeted verification of material fixes. Close-out ships in the same PR: Outcome, `STATUS.md` deleted, `git mv` into `archive/`. Never merge; teardown after the orchestrator's merge, slug `service-imports-1`, trunk `dev`.

## Seeds

```
/goal Phase 1 of implementations-plan/service-imports-1/plan.md marked ✓ with G1-G3 reported passing; the Codex pass over the plan and diff recorded with its verdict; the PR to dev open, ready, with the Delivery body; the close-out archive commit shown by `git show --stat`.
```

```
/loop 15m Drive implementations-plan/service-imports-1 forward per its plan.md: run Phase 1 and its gate, then Post-implementation. Never merge; stop once the PR's checks are green and the close-out is committed.
```
