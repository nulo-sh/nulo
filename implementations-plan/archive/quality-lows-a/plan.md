---
plan: quality-lows-a
tier: light
status: completed
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one Codex pass (gpt-6.1-sol, high) over this plan, one per arc over the completed diff, then targeted verification of material fixes; no Opus leg, no recon agent (the four sites are named by their issues)
base: origin/dev at 9c913679b
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-24. Two PRs into `dev`, each off `origin/dev`: #1986 (arc 1) and arc 2's, which carries this close-out; their merges close #1981, #1982 and #1975.
- **Status:** completed.
- **Shipped:**
  - #1981: `scripts/complexity-baseline/biome-report.ts`, the one reader of Biome's report for `generate.ts` and `rescore.ts`; each keeps its own parse-error and location policy and its truncation sentence. Proof: every output of both scripts byte-identical at base and head, on a clean and a two-stage seeded tree (§ Phases and gates; [phase 1 log](lessons/phase-1.md)).
  - #1982: `apps/landing/src/subscribe-client.ts`, the one POST, timeout, classification and retry sentence for both landing forms; the two caller tests unedited.
  - #1975: `withEditableNetwork` and `commitEndpointChangeLocked` in `network/service.ts`, used by the five endpoint edits and the reset write's tail; the network tests unedited.
  - #1976, proving backends: `PROVE_BACKENDS` in `@nulo/wallet-core/jobs`, `ProveBackend` derived from it, both `z.enum` calls reading it; the stored-shape snapshot asked for no stamp, and the popup loads the same 174 modules (+27 bytes).
- **Review:** one Codex pass (`gpt-6.1-sol`, high) over the plan (five findings, accepted) and one per arc over its diff: arc 1, two minors (one accepted, one declined); arc 2, none.
- **Dispositions:** the route-snapshot half of #1976 is left out (Fact 6): the issue's import would put 44 MB of PXE and kernel code in the popup, and the clean form needs a new leaf entry the lane may not add. A comment at `network/spec.ts`'s type-only import records the constraint. Declined: a header assertion in `confirm.test.ts` (the lane keeps that test unedited).
- **Known limits:** none.
- **Open items:** #1976, its route-snapshot half (a comment on the issue carries the measurement).
- **Lessons:** none promoted: `lessons.md` sits at 8,148 of 8,192 bytes and nothing in it is superseded; the one gotcha lives beside its import.
- **Seeds retired:** the `/goal` and `/loop` seeds in § Seeds were never run; the orchestrator drove both arcs.

# quality-lows-a: four small duplications get one home each

Issues #1981, #1982 (arc 1) and #1975, #1976 (arc 2), the owner's word of 2026-11-24 on the Low findings of the 2026-11-23 quality run: "if they all apply, I would fix all of them, unless some are over-engineering". Two PRs into `dev`, each off `origin/dev`, no stack. **UI impact: none.**

| Arc | Branch | Issues | Surface |
|---|---|---|---|
| 1 | `quality-lows-a-a1` | #1981, #1982 | `scripts/complexity-baseline/`, `apps/landing/src/` |
| 2 | `quality-lows-a-a2` | #1975, #1976 (half) | `network/service.ts`, `wallet-core/jobs`, two `z.enum` sites; this plan's close-out |

## Outcome & Quality Bar

**For whom.** The maintainer who next changes the Biome report format, the subscribe contract, an endpoint edit or the proving backends: one edit, in one place.

**Excellent.** (1) Every caller behaves byte for byte as before: the baseline manifest and the rescore's output at base and head are equal on a clean and on a seeded tree; the landing tests and the network tests pass unedited. (2) Each extraction is the smallest one its issue names; where the issue's fix would cost more than the copy, the part is left out with a measurement.

**Good enough.** No e2e scenario, no new export entry, no new test beyond one per new module or list.

## Assumptions

**Facts** (verified on `9c913679b`; every issue claim held except the one marked):

1. `generate.ts:36-38,47-68` and `rescore.ts:24-26,48-81` each spawn `node_modules/.bin/biome lint --reporter=json --max-diagnostics=none` on Bun with a 256 MiB buffer, refuse empty stdout and `diagnosticsNotPrinted > 0`, and keep `lint/complexity/*`. Only `rescore` strips `./` (`normalisePath`), reads `start?.line ?? 0`, and collects `parse*` diagnostics; `generate` reads `start.line` unguarded and ignores parse errors.
2. `signup.ts:14-36` and `confirm.ts:20-54` hold the same 20 s timeout, the same status classification and byte-equal retry sentences (`SIGNUP_MESSAGES.retry === RETRY_MESSAGE`). `signup.test.ts` imports `SIGNUP_MESSAGES` from `./signup`; `confirm.test.ts` imports `RETRY_MESSAGE` from `./confirm`.
3. `network/service.ts`: the opener (`withLock`, `requireOwnedRow`, `refuseWhileResetHolds`) at `:859-861, :898-900, :925-927, :949-951, :971-973`; the tail (`storage.set`, evictions, `routes.delete`, emits) at `:873-875, :913-916, :937-940, :959-962, :983-986`, and the reset write at `:1255-1260`. Every `onPrimaryEndpointChanged` payload equals the row's `primaryEndpointId` after the write. The file carries no complexity directive.
4. Premise of #1976, demonstrated at base: with `ProveBackend` widened to `"presto" | "browser" | "native"`, `vue-tsc --noEmit` in `apps/extension` exits 0, and both `ProvePhaseEventSchema` and `JobProgressSchema` refuse `backend: "native"` (a scratch vitest file, removed).
5. **Did not hold:** the route snapshot is not a stored shape. `stored-shapes.ts` registers no route row; only `JobProgressSchema` (inside `OperationRecordSchema`) is, and its snapshot reads `"enum": ["presto", "browser"]`.
6. **#1976's route-snapshot fix costs more than the copy.** `network/spec.ts` reaches the popup (`endpoint-error-text.ts`, `utils/full-backup-helpers.ts`, five composables). A spike exporting `RouteSnapshotSchema` from `@nulo/aztec-runtime/pxe` and importing it there moved the PXE, kernel-circuit and contract-artifact chunks into the popup's graph: `dist/chrome/src/popup/index.html` went from 174 module scripts (4.0 MB) to 254 (48.3 MB). The pxe barrel's value consumers today are service-worker and offscreen files (`offscreen/index.ts`, `pxe/client.ts`, three services), none reached from the popup.

**Inferences.** (a) Biome reports the paths it was given as given, so `generate`'s `.` run never yields `./` paths; the equality runs check it. (b) `@nulo/wallet-core/jobs` is already in the popup's graph through `operation-journal/spec.ts`'s value imports, so a value export there adds no chunk; the arc 2 build checks it, comparing module names with content hashes removed, total bytes, and newly reachable heavy chunks.

**Asks.** None of the owner. Left out under the lane brief's rule ("a new export surface beyond the ones named ... stop that item"): the route-snapshot half of #1976. A clean version needs a leaf entry (`@nulo/aztec-runtime/pxe/route-snapshot` or similar), which the issue does not name; #1976 gets a comment with the measurement and stays open.

## Architecture & Implementation

**#1981.** New `scripts/complexity-baseline/biome-report.ts` owns `BIOME` with its launcher comment, `CATEGORY_PREFIX`, `isBaselined`, and one function:

```ts
export interface BudgetDiagnostic { path: string; category: string; message: string; line: number | undefined }
export function readBiomeReport(paths: readonly string[], feeds: "baseline" | "audit", cwd?: string): { budget: BudgetDiagnostic[]; parseErrors: string[] }
```

It spawns, refuses empty or truncated output, and projects `lint/complexity/*` entries (prefix stripped, path as Biome printed it, `start?.line`) and `parse*` entries (`path: message`). It picks no policy: each caller applies its own, in its own file. `generate` ignores `parseErrors` (comment says why) and refuses a diagnostic with no line rather than inserting a marker at a guessed one. `rescore` keeps `normalisePath`, `?? 0` and its parse-error refusal. Each caller names what the report feeds (`"baseline"` or `"audit"`), so the truncation sentence each prints stays byte-equal; the name is a label, not a policy.

**#1982.** New `apps/landing/src/subscribe-client.ts`: `type Fetch`, `RETRY_MESSAGE`, `TIMEOUT_MS`, and `postSubscribe(url, { headers?, body }, fetchImpl): Promise<"ok" | "invalid" | "retry">`, which sets `method: "POST"`, `Accept: application/json` before the caller's headers, and the timeout signal. `postSignup` and `postConfirm` stay, each mapping `"ok"` to its label; `SIGNUP_MESSAGES.retry` reads `RETRY_MESSAGE`; `confirm.ts` re-exports `RETRY_MESSAGE` for its test. The button lifecycles do not move.

**#1975.** Two private methods, next to `refuseWhileResetHolds`:

```ts
private async withEditableNetwork<T>(profileId: string, networkId: string, edit: (network: Network) => Promise<T> | T): Promise<T>
/** Caller holds the network lock. */
private async commitEndpointChangeLocked(network: Network, evictedUrls: readonly string[], primaryChanged: boolean): Promise<void>
```

The opener runs inside `withLock` in today's order; probes stay before it. The tail runs `storage.set`, the `transientNodes` deletes, `routes.delete`, then `onPrimaryEndpointChanged` (when `primaryChanged`, with `network.primaryEndpointId`) and `onNetworkUpdated`. `updateEndpoint` passes `[oldUrl]` (evicted even when unchanged, as today), `deleteEndpoint` `[removed.rpcUrl]`, the reset write `[]`. Early `return network` paths stay inside `edit`. `convertRows` is not touched.

**#1976 (proving backends).** `packages/wallet-core/src/jobs/types.ts`: `export const PROVE_BACKENDS = ["presto", "browser"] as const` and `ProveBackend = (typeof PROVE_BACKENDS)[number]`; `jobs/index.ts` exports it; `execution-coordinator.ts:71` and `operation-journal/spec.ts:250` read `z.enum(PROVE_BACKENDS)`. The `execution-coordinator.ts` edit keeps at least one unchanged line from lane `task-owner-1`'s three root-task creators.

**Plan audit (Codex `gpt-6.1-sol`, high, one pass).** Five findings, all accepted: the seed split into two stages so the wrong-stamp comparison is not masked by a count mismatch; Fact 6 corrected (offscreen also imports the barrel); the bundle check strips content hashes; the subscribe test asserts the merged `Content-Type` and a `201` retry; each caller keeps its truncation sentence. It confirmed the reset write may use the commit helper but not `withEditableNetwork`, whose reset refusal would block the reset itself.

**Alternatives not taken.** #1981: an options object (`{ normalisePaths, toleratesMissingLine, collectParseErrors }`) — rejected: three flags for two callers, and the policy hides behind a boolean. #1975: one helper that also takes the commit arguments — rejected: three callers return early without a commit. #1976: importing from the pxe barrel as the issue says — rejected by Fact 6.

## Security & Adversarial Considerations

- **Threat model.** No trust boundary moves. The subscribe client still treats every answer but `200 {"ok": true}` as failure, so a page served in the Worker's place never reads as success. The route snapshot keeps its strict schema (no URL can ride along). The network lock and the reset refusal guard the same writes in the same order.
- **Quality-gate integrity.** #1981 edits a gate's own tooling: no ceiling, glob or manifest entry changes; `manifest.json` is written only by the generator and is restored after each proof run.
- **Supply chain, crypto, least privilege.** No dependency, key or workflow changes.

## Phases and gates

**Phase 1 (arc 1).** Run the equality proof at base (below) and save its outputs under `~/.cache/nulo-backlog/quality-lows-a/`. Write `biome-report.ts`, edit `generate.ts` and `rescore.ts`. Write `subscribe-client.ts` and its test (the caller's `Content-Type` survives beside `Accept`, a `URLSearchParams` body is sent as given, a `201 {"ok": true}` stays `retry`; the other classes are already pinned through the two forms' tests), edit `signup.ts` and `confirm.ts`. Run the proof at head and compare.
- **Proof.** For each of base and head: run `bun run baseline:complexity` and `bun run baseline:rescore` on the clean tree; capture stdout, stderr, exit code and `manifest.json`; restore the manifest. Then add a temporary `scripts/complexity-baseline/seed.tmp.ts` (`git add -N`; `scanTree`'s working-tree `git grep` sees an intent-to-add file) holding one over-budget function under a wrong-stamp accepted directive, and run rescore (expect `accepted N → observed M`). Append a second over-budget function with no directive; run rescore (expect the unsuppressed offender and the count mismatch), then generate (expect the `JUSTIFICATION REQUIRED` marker and exit 1). Capture the same, plus the seed file after the run. Remove the seed (`git reset`, delete). Pass: each capture shows its expected line and is byte-equal between base and head.
- **Gate.** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating` (scripts change). Pass: exit 0, retry 0. Layers: typecheck/lint, unit.

**Phase 2 (arc 2).** Add the two `NetworkService` helpers and convert the six sites. Add `PROVE_BACKENDS` and convert the two enums. Add one test per schema: every `PROVE_BACKENDS` value parses and a value outside it is refused. Build the extension and compare the popup's module list with base.
- **Gate.** `bun run lint` (no new complexity directive), `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run --cwd apps/extension build-storybook`, `bun run check:plans` after staging. `stored-shapes/snapshot.test.ts` passes with no new stamp; if it asks for one, stop. Pass: exit 0, retry 0; popup module list equal to base. Layers: typecheck/lint, unit. No local e2e: no behaviour changes, and the PR trips the four e2e lanes in CI.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `9c913679b`. Plan-specific parts:

- Step 1 is absent (`code_review: off`). Step 2 is the bounded form: per arc, one Codex pass (`gpt-6.1-sol`, `high`) over this plan and the arc's diff, with the README's two verbatim rules and the adversarial asks: a behaviour the shared code changed for one caller, an eviction or emit reordered, an import that crosses a layer, a stored shape that reads differently. Then targeted verification of each material fix. Consults are logged in `lessons/phase-N.md`.
- Delivery: `gh pr create` per arc, ready for review, no labels. Arc 1: `refactor(tooling): one biome report reader for the baseline scripts, one subscribe client`, `Closes #1981`, `Closes #1982`. Arc 2: `refactor(wallet): endpoint edits share one opener and commit; prove backends get one list`, `Closes #1975`, `Refs #1976`. Bodies state the proofs and "No visible change."
- Close-out in arc 2's PR: Outcome block, `git mv` into `archive/` in its own commit, index line in `archive/index.md`; a comment on #1976 with Fact 6. Merging is the orchestrator's call; teardown follows the README's step 5 with slug `quality-lows-a`.

## Seeds

`/goal`: Deliver quality-lows-a per implementations-plan/quality-lows-a/plan.md: two PRs into dev, each gate green, never merge.
`/loop`: Check quality-lows-a's two PRs; on a red check, fix the cause and re-run the arc's gate.
