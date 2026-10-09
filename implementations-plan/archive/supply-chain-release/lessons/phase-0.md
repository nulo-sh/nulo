# Phase 0: planning

## Consults

- **Codex account name.** `CODEX_ACCOUNT=gmail` failed with "cannot resolve CODEX_ACCOUNT=gmail". `codex-usage list` names the roster accounts `alejo-gmail` and `alejo-icloud`; the audit ran on `alejo-gmail`. Every Codex command in this plan uses that name.
- **Dual audit, Codex (gpt-6.1-sol, high, read-only).** Verdict: reject. Four blocking findings: release-please can still publish a release early; republishing an already-published release was incomplete; the attestation would name the dispatch branch's commit, not the tag's; crxjs `standaloneFiles` fails the third-party-notices policy. All four verified against the tree and accepted (plan § Audit verdicts).
- **Dual audit, Opus 5.5 (Plan agent).** Verdict: conditional approve, six conditions. Signing jobs must stop installing dependencies and persisting tokens; release-please must never publish; `apply` must use the planned action and re-check after publishing; the verify command must pin the commit; S2 and S3 need a rehearsal and the owner; the broken gate commands must be fixed. Five met as written, one in part (no scratch-repo App install: outside this lane's authorization).

## What the audits taught (verified by the planner)

- release-please-action v5 publishes through `createReleases()` unless `skip-github-release` is set, and selects what to publish by the `autorelease: pending` label. A bump that fixed its abort bug would have published an empty, immutable release.
- Provenance records the workflow run's commit (`GITHUB_SHA`), not the checkout. A dispatch on `--ref main` for a tag behind `main` would attest the wrong commit, so the publish path requires equality and the runbook dispatches with `--ref <tag>`.
- `zip-reproducible.ts` shells out to the system `zip`: rebuild byte-equality across runners is not proven, so a store submission ships the published bytes.
- crxjs `standaloneFiles` emits its IIFE as an asset from a plugin-less sub-build; the notices generator refuses unclaimed emitted code (`packages/third-party-notices/src/generate.ts:249-254`).
- `orhun/git-cliff-action` downloads git-cliff at run time, which is why it leaves the job that holds `id-token: write`.

## Final fresh Codex pass

- Verdict: reject, three blocking findings, all verified and fixed in the plan. A local composite action runs from the checkout, so a job that checks out an older tag runs that tag's composite: an input added today is silently ignored there. GitHub ignores `target_commitish` once a tag exists, so a nightly must create its own ref before uploading. Releases published before attestations existed cannot pass a verify-before-store step; that boundary is an Ask (A11), not a weakened check.
- `decideUnstick` never compared the Release PR's merge commit with the run's commit; the I/O takes the first PR GitHub associates with the commit.
