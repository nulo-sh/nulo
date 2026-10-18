# Phase 4: proof runs

- **A1, first run** (39078345380, `release.yml` dispatch from `fcef004a`: `tag=v0.31.0`, `dry_run=true`, `run_network_e2e=true`): **failure**, a real defect.
  - `select` passed. It verified the published zips against their digests, their attestations and `SHASUMS256.txt`, and wrote `published`.
  - The unpack step then exited 2: `checkdir: cannot create extraction directory: dist/published/chrome`. Info-ZIP's `unzip -d` creates only the last directory of its path. It was reproduced locally: exit 2 without the parent, 0 with it.
  - The run failed closed: S1 skipped the builds, both smokes and `attach-assets`, and `status` refused with `select-assets is 'failure', expected 'success'`.
  - No unit test runs a workflow's `run:` block, so a live dispatch was the first thing to execute that line.
- **Lane evidence from the first run**, which the fix does not touch:
  - The 11 executed network jobs were green. Their names equal `verify-cert-run.sh`'s eleven exactly (`diff` of the sorted lists).
  - The only skipped lane job is `Run / chaos / sends`, so the three-level name is `<caller name> / <lane job name> / <suite job name>` (I1).
  - `status` checks `network-e2e` before `select-assets`. An error naming `select-assets` therefore means it had already accepted `network-e2e=success`: a lane call with one skipped job reads `success` on the release side.
  - The suite span was 20.2 min.
- **Fix** `82d490f3`: `mkdir -p dist/published` before the two `unzip` lines. `handoffFindings`' exact command list now names it. Gates `lint:actions`, `lint`, `test:release`, `test:ci-gating` and `check:plans` exited 0.
- **Codex round 3**: one resumed round, as the plan gives a fix a proof forces (resume of `01a14c0f`). Verdict **approve**: the fix is sound and the pin catches its removal. Its condition is to record the split proof. Neither run alone is one green release run with network on, so run 1 must show `network-e2e=success` accepted before the selector failure. The split is recorded here and in the PR body.
- **A1b** (39079737475, the same dispatch from `82d490f3` with `run_network_e2e=false`, so shared CI minutes are not spent on a second network run): **success**.
  - `select-assets` logged `v0.31.0: the gates and the stores get the published, attested assets in dist/release` and uploaded:
    - `published-chrome` (artifact 12118885188);
    - `published-firefox` (12118671112);
    - `published-assets` (12118825395).
  - Both builds were skipped.
  - `smoke-against-artifact` took `published-chrome` (ID 12118885188) and ran 19.1 min, green. `smoke-firefox-against-artifact` took `published-firefox` (ID 12118671112) and ran 30.6 min, green.
  - `attach-assets` downloaded `published-assets` (ID 12118825395), planned `use-published`, and as a dry run tagged, uploaded and published nothing.
  - `status` was green. The lane call `Run` was skipped as a single job.
  - Wall-clock: 38.7 min.
- **PR #732 at `82d490f3`**: 53 checks pass, 4 skip, none fail.
  - `scripts/ci-cd/verify-cert-run.sh --pr 732` prints `QUALIFYING GREEN: 82d490f3…` (Quality 39078672056, smoke 39078672071, network 39078672075, each attempt 1).
  - Per lane, the executed network job names equal the eleven exactly, and the only skipped lane job is `Run / chaos / sends`: Chrome 39078672075, Firefox 39078672118.
- **Network wall-clocks** (suite span, first job start to last job end, green runs where the suite executed): no e2e scenario changed, and the change is within run-to-run noise.

  | Lane | Before | After (#732) |
  |---|---|---|
  | Chrome | median 18.3 min (15.5–18.8, 7 PR runs on 2026-10-17, one queued 39.9 outlier excluded) | 19.2 min |
  | Firefox | median 21.5 min (18.3–21.9, 5 runs) | 21.0 min |

- **Close-out merge**: `origin/dev` at `138e0ded` merged at `85fcba0f`, clean. Dev changed no workflow and renamed no network test. The first signed commit hung on the SSH agent, so its own `ssh-keygen` was killed and the merge committed with `env -u SSH_AUTH_SOCK` (signed G). After `bun install --frozen-lockfile`, the full chain exited 0: `lint:actions`, `lint`, `typecheck:all`, `test:release`, `test:ci-gating`, `check:plans`, `test`, `test:all`.
- **I3** (re-run granularity of a failed inner job) stays plausible but unverified: no run had a failed lane job to re-run.
