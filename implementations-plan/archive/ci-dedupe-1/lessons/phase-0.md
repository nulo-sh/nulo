# Phase 0: planning consults

Every consult of the planning panel, in order, with its verdict.

## Round 1 (2026-10-17)

- **Codex** (gpt-6.1-sol, high, read-only; session `01a14b0e`): `reject`. Blocking: a push rerun of a published release would skip the builds (auto-unstick's idempotent `skip`, verified at `scripts/release/auto-unstick.ts:70-75`); a build→published transition skipped the attestation check; D2's migration pin allowed exceptions. Medium: one lane result hides inner skips (`scripts/ci-cd/e2e-aggregate.sh` demands `success` per suite job, verified); the expander could not bind nightly's seed JSON, which a crafted seed could bend; phase 4's "a rerun clears" contradicts `verify-cert-run.sh` (attempt 1 only). All six accepted; see plan.md § Audit verdicts.
- **Opus** (Plan leg, opus): `conditional approve` with four conditions (build-path proof and source-clause pins; attestation in `verify-published`; lane-shape pin with `fail-fast`; the dropped build guards written down). Ten findings; nine accepted as plan changes, the build-guard one as known limit D8.
- **Planner checks**: re-run granularity on two levels observed in run 38962062741 (attempt 2 re-ran only `Run / shard 5/5`); GitHub's re-run docs say nothing on reusable workflows; community #52505 reports inner-job re-runs for matrixed calls. Every `v*` tag has a release (no dry-run build-path proof possible, A3).
- **Decisions changed**: `select` on dispatch only; nightly chaos kept byte for byte by a complementary chaos pair (D3 reversed); `verify-published` checks local bytes' digests and attestations (D7, which changes one push-rerun edge: a differing rebuild of an already-published push run now fails instead of warning).

## Round 2 (2026-10-17)

- **Codex** (resume of `01a14b0e`): `reject`, two blocking: D7's single strict rule broke a push rerun of a published release (reds `status`, skips `sync-main-to-dev`, `release.yml:625-640`); an empty dispatch `source` reached `attach-assets` through `source || 'build'`. Two medium: the skipped chaos branch needs its own name assertion; a targeted re-run does not prove failed-job re-run granularity. All four accepted: D7 by event (push unchanged), clauses S1/S2, `SOURCE` never defaults on a dispatch, the I3 probe dropped.

## Final pass (2026-10-17)

- **Codex** (fresh session `01a14b23`, gpt-6.1-sol, high): `conditional approve`. Conditions: bind `TAG`/`VERSION`/`SHA` into `select-assets` (Codex ran `inputFromEnv` with automatic variables only: it refuses); write the complete predicates, since "adds" to the smokes would have conflicted with their existing `build == 'success'` and the pins named S2 on the builds. Both folded; a confirming resume of the same session followed.
- **Confirmation** (resume of `01a14b23`): `approve`, no remaining finding.
